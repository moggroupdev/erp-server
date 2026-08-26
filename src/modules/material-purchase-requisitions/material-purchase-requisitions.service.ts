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
  materialPurchaseOrderItemRequisitionItems,
  materialPurchaseRequisitionItems,
  materialPurchaseRequisitions,
  materials,
} from 'src/database/schema';
import { QueryParams, User } from 'src/utils/types';
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
type ApprovalSlot = 'planning' | 'purchasingManager' | 'director';

@Injectable()
export class MaterialPurchaseRequisitionsService {
  constructor(
    @Inject(DRIZZLE) private db: DrizzleDB,
    private queryBuilderService: QueryBuilderService,
  ) {}

  public async create(createDto: CreateMaterialPurchaseRequisitionDto, user: User) {
    const { items, ...header } = createDto;
    this.assertNoDuplicateMaterials(items.map((item) => item.materialCode));
    await this.assertMaterialsExist(items.map((item) => item.materialCode));

    return await this.db.transaction(async (tx) => {
      const [requisition] = await tx
        .insert(materialPurchaseRequisitions)
        .values({
          ...header,
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
      withRelations: { createdBy: { columns: USER_COLUMNS } },
    });
  }

  public async get(id: string) {
    const requisition = await this.db.query.materialPurchaseRequisitions.findFirst({
      where: eq(materialPurchaseRequisitions.id, id),
      with: {
        createdBy: { columns: USER_COLUMNS },
        planningApprovedBy: { columns: USER_COLUMNS },
        purchasingManagerApprovedBy: { columns: USER_COLUMNS },
        directorApprovedBy: { columns: USER_COLUMNS },
        rejectedBy: { columns: USER_COLUMNS },
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

    const [updated] = await this.db
      .update(materialPurchaseRequisitions)
      .set(updateDto)
      .where(eq(materialPurchaseRequisitions.id, id))
      .returning();

    return updated;
  }

  public async addItem(id: string, createDto: CreateMaterialPurchaseRequisitionItemDto) {
    const requisition = await this.requireRequisition(id);
    this.assertEditable(requisition);
    await this.assertMaterialsExist([createDto.materialCode]);
    await this.assertMaterialNotOnRequisition(id, createDto.materialCode);

    const [inserted] = await this.db
      .insert(materialPurchaseRequisitionItems)
      .values({
        materialPurchaseRequisitionId: id,
        materialCode: createDto.materialCode,
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

    if (updateDto.materialCode !== undefined && updateDto.materialCode !== existing.materialCode) {
      await this.assertMaterialsExist([updateDto.materialCode]);
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
    return this.approveSlot(id, user, 'planning');
  }

  public async approvePurchasingManager(id: string, user: User) {
    return this.approveSlot(id, user, 'purchasingManager');
  }

  public async approveDirector(id: string, user: User) {
    return this.approveSlot(id, user, 'director');
  }

  public async reject(id: string, rejectDto: RejectMaterialPurchaseRequisitionDto, user: User) {
    const requisition = await this.requireRequisition(id);

    if (requisition.cancelledAt) {
      throw new BadRequestException(
        translate(
          'Cannot reject a cancelled purchase requisition.',
          'لا يمكن رفض طلب شراء ملغى.',
        ),
      );
    }

    if (requisition.rejectedAt) {
      throw new BadRequestException(
        translate(
          'Purchase requisition is already rejected.',
          'طلب الشراء مرفوض بالفعل.',
        ),
      );
    }

    if (this.isFullyApproved(requisition)) {
      await this.assertNoAllocations(id);
    }

    const [updated] = await this.db
      .update(materialPurchaseRequisitions)
      .set({
        rejectedAt: new Date(),
        rejectedBy: user.id,
        rejectionReason: rejectDto.rejectionReason,
      })
      .where(eq(materialPurchaseRequisitions.id, id))
      .returning();

    return updated;
  }

  public async cancel(id: string) {
    const requisition = await this.requireRequisition(id);

    if (requisition.rejectedAt) {
      throw new BadRequestException(
        translate(
          'Cannot cancel a rejected purchase requisition.',
          'لا يمكن إلغاء طلب شراء مرفوض.',
        ),
      );
    }

    if (requisition.cancelledAt) {
      throw new BadRequestException(
        translate(
          'Purchase requisition is already cancelled.',
          'طلب الشراء ملغى بالفعل.',
        ),
      );
    }

    if (this.isFullyApproved(requisition)) {
      await this.assertNoAllocations(id);
    }

    const [updated] = await this.db
      .update(materialPurchaseRequisitions)
      .set({ cancelledAt: new Date() })
      .where(eq(materialPurchaseRequisitions.id, id))
      .returning();

    return updated;
  }

  // ============================== PRIVATE METHODS ==============================

  private async approveSlot(id: string, user: User, slot: ApprovalSlot) {
    const requisition = await this.requireRequisition(id);

    if (requisition.cancelledAt) {
      throw new BadRequestException(
        translate(
          'Cannot approve a cancelled purchase requisition.',
          'لا يمكن اعتماد طلب شراء ملغى.',
        ),
      );
    }

    if (requisition.rejectedAt) {
      throw new BadRequestException(
        translate(
          'Cannot approve a rejected purchase requisition.',
          'لا يمكن اعتماد طلب شراء مرفوض.',
        ),
      );
    }

    const alreadyApproved =
      slot === 'planning'
        ? requisition.planningApprovedAt
        : slot === 'purchasingManager'
          ? requisition.purchasingManagerApprovedAt
          : requisition.directorApprovedAt;

    if (alreadyApproved) {
      throw new BadRequestException(
        translate(
          'This approval has already been recorded.',
          'تم تسجيل هذا الاعتماد مسبقاً.',
        ),
      );
    }

    const now = new Date();
    const patch =
      slot === 'planning'
        ? { planningApprovedAt: now, planningApprovedBy: user.id }
        : slot === 'purchasingManager'
          ? { purchasingManagerApprovedAt: now, purchasingManagerApprovedBy: user.id }
          : { directorApprovedAt: now, directorApprovedBy: user.id };

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
    if (requisition.cancelledAt) {
      throw new BadRequestException(
        translate(
          'Cannot edit a cancelled purchase requisition.',
          'لا يمكن تعديل طلب شراء ملغى.',
        ),
      );
    }

    if (requisition.rejectedAt) {
      throw new BadRequestException(
        translate(
          'Cannot edit a rejected purchase requisition.',
          'لا يمكن تعديل طلب شراء مرفوض.',
        ),
      );
    }

    if (this.hasAnyApproval(requisition)) {
      throw new BadRequestException(
        translate(
          'Cannot edit a purchase requisition after any approval has been recorded.',
          'لا يمكن تعديل طلب شراء بعد تسجيل أي اعتماد.',
        ),
      );
    }
  }

  private hasAnyApproval(requisition: RequisitionRow) {
    return Boolean(
      requisition.planningApprovedAt ||
        requisition.purchasingManagerApprovedAt ||
        requisition.directorApprovedAt,
    );
  }

  private isFullyApproved(requisition: RequisitionRow) {
    return Boolean(
      requisition.planningApprovedAt &&
        requisition.purchasingManagerApprovedAt &&
        requisition.directorApprovedAt,
    );
  }

  private async assertNoAllocations(requisitionId: string) {
    const items = await this.db.query.materialPurchaseRequisitionItems.findMany({
      where: eq(materialPurchaseRequisitionItems.materialPurchaseRequisitionId, requisitionId),
      columns: { id: true },
    });

    if (items.length === 0) return;

    const allocation = await this.db.query.materialPurchaseOrderItemRequisitionItems.findFirst({
      where: inArray(
        materialPurchaseOrderItemRequisitionItems.materialPurchaseRequisitionItemId,
        items.map((item) => item.id),
      ),
      columns: { id: true },
    });

    if (allocation) {
      throw new BadRequestException(
        translate(
          'Cannot reject or cancel a fully approved purchase requisition that already has purchase-order allocations.',
          'لا يمكن رفض أو إلغاء طلب شراء معتمد بالكامل وله تخصيصات على أوامر شراء.',
        ),
      );
    }
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

  private async assertMaterialsExist(materialCodes: string[]) {
    const uniqueCodes = [...new Set(materialCodes)];
    const found = await this.db.query.materials.findMany({
      where: and(inArray(materials.code, uniqueCodes), isNull(materials.deletedAt)),
      columns: { code: true },
    });

    const foundCodes = new Set(found.map((row) => row.code));
    const missing = uniqueCodes.filter((code) => !foundCodes.has(code));

    if (missing.length > 0) {
      throw new NotFoundException(
        translate(
          `Material(s) not found: ${missing.join(', ')}.`,
          `المواد غير موجودة: ${missing.join(', ')}.`,
        ),
      );
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
