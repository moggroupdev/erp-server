import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DRIZZLE, type DrizzleDB } from 'src/database/database.constants';
import {
  materialPurchaseRequisitionItems,
  materialPurchaseRequisitions,
  materials,
  materialUnitConversions,
  productionSubDepartmentManagers,
} from 'src/database/schema';
import { APPROVAL_DECISIONS } from 'src/utils/constants';
import { QueryParams, User, type ApprovalDecision, type MaterialUnit, type ProductionSubDepartment } from 'src/utils/types';
import { translate } from 'src/utils/i18n/translate';
import { materialUnitConversionsExtra } from 'src/utils/extras/material-unit-conversions-extra';
import { QueryBuilderService } from 'src/utils/services/query-builder.service';
import { CreateMaterialPurchaseRequisitionDto } from './dto/create-material-purchase-requisition.dto';
import { CreateMaterialPurchaseRequisitionItemDto } from './dto/create-material-purchase-requisition-item.dto';
import { UpdateMaterialPurchaseRequisitionDto } from './dto/update-material-purchase-requisition.dto';
import { UpdateMaterialPurchaseRequisitionItemDto } from './dto/update-material-purchase-requisition-item.dto';
import { RejectMaterialPurchaseRequisitionDto } from './dto/reject-material-purchase-requisition.dto';

const MATERIAL_COLUMNS = {
  code: true,
  title: true,
  materialType: true,
  unitOfMeasurement: true,
  subCategoryId: true,
} as const;

const USER_COLUMNS = { id: true, name: true } as const;

type RequisitionRow = typeof materialPurchaseRequisitions.$inferSelect;
type ApprovalSlot = 'planning' | 'purchasingManager' | 'manager';

@Injectable()
export class MaterialPurchaseRequisitionsService {
  constructor(
    @Inject(DRIZZLE) private db: DrizzleDB,
    private queryBuilderService: QueryBuilderService,
  ) {}

  public async create(createDto: CreateMaterialPurchaseRequisitionDto, user: User) {
    const { items, ...header } = createDto;
    this.assertNoDuplicateMaterials(items.map((item) => item.materialCode));
    await this.assertMaterialsAndSelectedUnits(items);
    const productionSubDepartmentManagerId = await this.resolveSubDepartmentManagerId(
      header.productionSubDepartment,
    );

    return await this.db.transaction(async (tx) => {
      const [requisition] = await tx
        .insert(materialPurchaseRequisitions)
        .values({
          ...header,
          productionSubDepartmentManagerId,
          code: sql`DEFAULT`,
          createdBy: user.id,
        })
        .returning();

      const insertedItems = await tx
        .insert(materialPurchaseRequisitionItems)
        .values(
          items.map((item) => ({
            materialPurchaseRequisitionId: requisition.id,
            materialCode: item.materialCode,
            unitOfMeasurementSelected: item.unitOfMeasurementSelected,
            quantityRequested: item.quantityRequested,
            notes: item.notes,
          })),
        )
        .returning();

      return { ...requisition, items: insertedItems };
    });
  }

  public async list(queryParams: QueryParams) {
    return await this.queryBuilderService.execute(materialPurchaseRequisitions, queryParams, {
      filtering: true,
      searchableFields: ['code', 'notes'],
      fieldLimiting: true,
      sorting: true,
      pagination: true,
      withRelations: {
        createdBy: { columns: USER_COLUMNS },
        productionSubDepartmentManager: { columns: USER_COLUMNS },
      },
    });
  }

  public async get(id: string) {
    const requisition = await this.db.query.materialPurchaseRequisitions.findFirst({
      where: eq(materialPurchaseRequisitions.id, id),
      with: {
        createdBy: { columns: USER_COLUMNS },
        productionSubDepartmentManager: { columns: USER_COLUMNS },
        planningDecidedBy: { columns: USER_COLUMNS },
        purchasingManagerDecidedBy: { columns: USER_COLUMNS },
        managerDecidedBy: { columns: USER_COLUMNS },
        items: {
          with: {
            material: { columns: MATERIAL_COLUMNS, extras: materialUnitConversionsExtra },
            orderItemAllocations: { columns: { quantityAllocated: true } },
          },
        },
      },
    });

    if (!requisition) this.throwNotFound(id);

    return {
      ...requisition,
      items: requisition.items.map((item) => {
        const quantityAllocated = item.orderItemAllocations.reduce(
          (sum, allocation) => sum + Number(allocation.quantityAllocated),
          0,
        );
        const { orderItemAllocations: _, ...rest } = item;
        return {
          ...rest,
          quantityAllocated,
          quantityRemaining: Number(item.quantityRequested) - quantityAllocated,
        };
      }),
    };
  }

  public async updateHeader(id: string, updateDto: UpdateMaterialPurchaseRequisitionDto) {
    const requisition = await this.requireRequisition(id);
    this.assertEditable(requisition);

    const values: UpdateMaterialPurchaseRequisitionDto & {
      productionSubDepartmentManagerId?: string | null;
    } = { ...updateDto };

    if (
      updateDto.productionSubDepartment !== undefined &&
      updateDto.productionSubDepartment !== requisition.productionSubDepartment
    ) {
      values.productionSubDepartmentManagerId = await this.resolveSubDepartmentManagerId(
        updateDto.productionSubDepartment,
      );
    }

    const [updated] = await this.db
      .update(materialPurchaseRequisitions)
      .set(values)
      .where(eq(materialPurchaseRequisitions.id, id))
      .returning();

    return updated;
  }

  public async addItem(id: string, createDto: CreateMaterialPurchaseRequisitionItemDto) {
    const requisition = await this.requireRequisition(id);
    this.assertEditable(requisition);
    await this.assertMaterialsAndSelectedUnits([createDto]);
    await this.assertMaterialNotOnRequisition(id, createDto.materialCode);

    const [inserted] = await this.db
      .insert(materialPurchaseRequisitionItems)
      .values({
        materialPurchaseRequisitionId: id,
        materialCode: createDto.materialCode,
        unitOfMeasurementSelected: createDto.unitOfMeasurementSelected,
        quantityRequested: createDto.quantityRequested,
        notes: createDto.notes,
      })
      .returning();

    return inserted;
  }

  public async updateItem(id: string, itemId: string, updateDto: UpdateMaterialPurchaseRequisitionItemDto) {
    const requisition = await this.requireRequisition(id);
    this.assertEditable(requisition);

    const existing = await this.requireItem(id, itemId);

    const nextMaterialCode = updateDto.materialCode ?? existing.materialCode;
    const nextUnit = updateDto.unitOfMeasurementSelected ?? existing.unitOfMeasurementSelected;

    if (updateDto.materialCode !== undefined || updateDto.unitOfMeasurementSelected !== undefined) {
      await this.assertMaterialsAndSelectedUnits([
        { materialCode: nextMaterialCode, unitOfMeasurementSelected: nextUnit },
      ]);
    }

    if (updateDto.materialCode !== undefined && updateDto.materialCode !== existing.materialCode) {
      await this.assertMaterialNotOnRequisition(id, updateDto.materialCode, itemId);
    }

    const [updated] = await this.db
      .update(materialPurchaseRequisitionItems)
      .set(updateDto)
      .where(eq(materialPurchaseRequisitionItems.id, itemId))
      .returning();

    return updated;
  }

  public async deleteItem(id: string, itemId: string) {
    const requisition = await this.requireRequisition(id);
    this.assertEditable(requisition);
    await this.requireItem(id, itemId);

    const items = await this.db.query.materialPurchaseRequisitionItems.findMany({
      where: eq(materialPurchaseRequisitionItems.materialPurchaseRequisitionId, id),
      columns: { id: true },
    });

    if (items.length <= 1) {
      throw new BadRequestException(
        translate(
          'A purchase requisition must keep at least one item.',
          'يجب أن يحتفظ طلب الشراء ببند واحد على الأقل.',
        ),
      );
    }

    const [deleted] = await this.db
      .delete(materialPurchaseRequisitionItems)
      .where(eq(materialPurchaseRequisitionItems.id, itemId))
      .returning();

    return deleted;
  }

  public async approvePlanning(id: string, user: User) {
    return this.decideGate(id, user, 'planning', APPROVAL_DECISIONS.APPROVED);
  }

  public async rejectPlanning(id: string, rejectDto: RejectMaterialPurchaseRequisitionDto, user: User) {
    return this.decideGate(id, user, 'planning', APPROVAL_DECISIONS.REJECTED, rejectDto.reason);
  }

  public async approvePurchasingManager(id: string, user: User) {
    return this.decideGate(id, user, 'purchasingManager', APPROVAL_DECISIONS.APPROVED);
  }

  public async rejectPurchasingManager(id: string, rejectDto: RejectMaterialPurchaseRequisitionDto, user: User) {
    return this.decideGate(id, user, 'purchasingManager', APPROVAL_DECISIONS.REJECTED, rejectDto.reason);
  }

  public async approveManager(id: string, user: User) {
    return this.decideGate(id, user, 'manager', APPROVAL_DECISIONS.APPROVED);
  }

  public async rejectManager(id: string, rejectDto: RejectMaterialPurchaseRequisitionDto, user: User) {
    return this.decideGate(id, user, 'manager', APPROVAL_DECISIONS.REJECTED, rejectDto.reason);
  }

  // ============================== PRIVATE METHODS ==============================

  private async decideGate(
    id: string,
    user: User,
    slot: ApprovalSlot,
    decision: Exclude<ApprovalDecision, 'pending'>,
    reason?: string,
  ) {
    const requisition = await this.requireRequisition(id);

    if (this.isRejected(requisition)) {
      throw new BadRequestException(
        translate(
          'Cannot record a decision on a rejected purchase requisition.',
          'لا يمكن تسجيل قرار على طلب شراء مرفوض.',
        ),
      );
    }

    if (this.gateDecision(requisition, slot) !== APPROVAL_DECISIONS.PENDING) {
      throw new BadRequestException(
        translate(
          'This decision has already been recorded.',
          'تم تسجيل هذا القرار مسبقاً.',
        ),
      );
    }

    const trimmedReason = reason?.trim() || null;

    if (decision === APPROVAL_DECISIONS.REJECTED && !trimmedReason) {
      throw new BadRequestException(
        translate('Rejection reason is required.', 'سبب الرفض مطلوب.'),
      );
    }

    const now = new Date();
    const patch =
      slot === 'planning'
        ? {
            planningDecision: decision,
            planningDecidedAt: now,
            planningDecidedBy: user.id,
            planningDecisionReason: decision === APPROVAL_DECISIONS.REJECTED ? trimmedReason : null,
          }
        : slot === 'purchasingManager'
          ? {
              purchasingManagerDecision: decision,
              purchasingManagerDecidedAt: now,
              purchasingManagerDecidedBy: user.id,
              purchasingManagerDecisionReason: decision === APPROVAL_DECISIONS.REJECTED ? trimmedReason : null,
            }
          : {
              managerDecision: decision,
              managerDecidedAt: now,
              managerDecidedBy: user.id,
              managerDecisionReason: decision === APPROVAL_DECISIONS.REJECTED ? trimmedReason : null,
            };

    const [updated] = await this.db
      .update(materialPurchaseRequisitions)
      .set(patch)
      .where(eq(materialPurchaseRequisitions.id, id))
      .returning();

    return updated;
  }

  private async requireRequisition(id: string): Promise<RequisitionRow> {
    const requisition = await this.db.query.materialPurchaseRequisitions.findFirst({
      where: eq(materialPurchaseRequisitions.id, id),
    });

    if (!requisition) this.throwNotFound(id);
    return requisition;
  }

  private async requireItem(requisitionId: string, itemId: string) {
    const item = await this.db.query.materialPurchaseRequisitionItems.findFirst({
      where: and(
        eq(materialPurchaseRequisitionItems.id, itemId),
        eq(materialPurchaseRequisitionItems.materialPurchaseRequisitionId, requisitionId),
      ),
    });

    if (!item) {
      throw new NotFoundException(
        translate(
          `Purchase requisition item with ID ${itemId} does not exist for requisition ${requisitionId}.`,
          `لا يوجد بند طلب شراء بالمعرف ${itemId} لطلب الشراء ${requisitionId}.`,
        ),
      );
    }

    return item;
  }

  private assertEditable(requisition: RequisitionRow) {
    if (this.hasAnyDecision(requisition)) {
      throw new BadRequestException(
        translate(
          'Cannot edit a purchase requisition after any decision has been recorded.',
          'لا يمكن تعديل طلب شراء بعد تسجيل أي قرار.',
        ),
      );
    }
  }

  private gateDecision(requisition: RequisitionRow, slot: ApprovalSlot): ApprovalDecision {
    if (slot === 'planning') return requisition.planningDecision as ApprovalDecision;
    if (slot === 'purchasingManager') return requisition.purchasingManagerDecision as ApprovalDecision;
    return requisition.managerDecision as ApprovalDecision;
  }

  private hasAnyDecision(requisition: RequisitionRow) {
    return (
      this.gateDecision(requisition, 'planning') !== APPROVAL_DECISIONS.PENDING ||
      this.gateDecision(requisition, 'purchasingManager') !== APPROVAL_DECISIONS.PENDING ||
      this.gateDecision(requisition, 'manager') !== APPROVAL_DECISIONS.PENDING
    );
  }

  private isRejected(requisition: RequisitionRow) {
    return (
      this.gateDecision(requisition, 'planning') === APPROVAL_DECISIONS.REJECTED ||
      this.gateDecision(requisition, 'purchasingManager') === APPROVAL_DECISIONS.REJECTED ||
      this.gateDecision(requisition, 'manager') === APPROVAL_DECISIONS.REJECTED
    );
  }

  private assertNoDuplicateMaterials(materialCodes: string[]) {
    if (new Set(materialCodes).size !== materialCodes.length) {
      throw new ConflictException(
        translate(
          'Duplicate materials are not allowed on the same purchase requisition.',
          'لا يُسمح بتكرار المواد في نفس طلب الشراء.',
        ),
      );
    }
  }

  private async resolveSubDepartmentManagerId(productionSubDepartment: ProductionSubDepartment) {
    const assignment = await this.db.query.productionSubDepartmentManagers.findFirst({
      where: eq(productionSubDepartmentManagers.subDepartment, productionSubDepartment),
      columns: { managerId: true },
    });

    return assignment?.managerId ?? null;
  }

  private async assertMaterialsAndSelectedUnits(
    items: { materialCode: string; unitOfMeasurementSelected: MaterialUnit }[],
  ) {
    const uniqueCodes = [...new Set(items.map((item) => item.materialCode))];
    const found = await this.db.query.materials.findMany({
      where: and(inArray(materials.code, uniqueCodes), isNull(materials.deletedAt)),
      columns: { code: true, unitOfMeasurement: true },
    });

    const byCode = new Map(found.map((row) => [row.code, row]));
    const missing = uniqueCodes.filter((code) => !byCode.has(code));

    if (missing.length > 0) {
      throw new NotFoundException(
        translate(
          `Material(s) not found: ${missing.join(', ')}.`,
          `المواد غير موجودة: ${missing.join(', ')}.`,
        ),
      );
    }

    const conversions = await this.db.query.materialUnitConversions.findMany({
      where: inArray(materialUnitConversions.materialCode, uniqueCodes),
      columns: { materialCode: true, unit: true },
    });

    const allowedByCode = new Map<string, Set<string>>();
    for (const material of found) {
      allowedByCode.set(material.code, new Set([material.unitOfMeasurement]));
    }
    for (const conversion of conversions) {
      allowedByCode.get(conversion.materialCode)?.add(conversion.unit);
    }

    for (const item of items) {
      const allowed = allowedByCode.get(item.materialCode);
      if (!allowed?.has(item.unitOfMeasurementSelected)) {
        throw new BadRequestException(
          translate(
            `Unit "${item.unitOfMeasurementSelected}" is not valid for material ${item.materialCode}.`,
            `الوحدة "${item.unitOfMeasurementSelected}" غير صالحة للمادة ${item.materialCode}.`,
          ),
        );
      }
    }
  }

  private async assertMaterialNotOnRequisition(requisitionId: string, materialCode: string, excludeItemId?: string) {
    const existing = await this.db.query.materialPurchaseRequisitionItems.findFirst({
      where: and(
        eq(materialPurchaseRequisitionItems.materialPurchaseRequisitionId, requisitionId),
        eq(materialPurchaseRequisitionItems.materialCode, materialCode),
      ),
      columns: { id: true },
    });

    if (existing && existing.id !== excludeItemId) {
      throw new ConflictException(
        translate(
          `Material ${materialCode} is already on this purchase requisition.`,
          `المادة ${materialCode} موجودة بالفعل في طلب الشراء هذا.`,
        ),
      );
    }
  }

  private throwNotFound(id: string): never {
    throw new NotFoundException(
      translate(
        `Material purchase requisition with ID ${id} does not exist.`,
        `لا يوجد طلب شراء مواد بالمعرف ${id}.`,
      ),
    );
  }
}
