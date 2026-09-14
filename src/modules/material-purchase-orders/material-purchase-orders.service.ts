import { eq, inArray, sql } from 'drizzle-orm';
import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DRIZZLE, type DrizzleDB } from 'src/database/database.constants';
import {
  materialPurchaseOrderItemRequisitionItems,
  materialPurchaseOrderItems,
  materialPurchaseOrders,
  materialPurchaseReceiptItems,
  materialPurchaseRequisitionItems,
  materialPurchaseRequisitions,
  materials,
  suppliers,
} from 'src/database/schema';
import { APPROVAL_DECISIONS } from 'src/utils/constants';
import { QueryParams, type MaterialUnit, type User } from 'src/utils/types';
import { translate } from 'src/utils/i18n/translate';
import { materialUnitConversionsExtra } from 'src/utils/extras/material-unit-conversions-extra';
import { resolveConversionFactor, toBaseQuantity } from 'src/utils/helpers/unit-conversion';
import { MaterialUnitValidationService } from 'src/utils/services/material-unit-validation.service';
import { QueryBuilderService } from 'src/utils/services/query-builder.service';
import { CreateMaterialPurchaseOrderDto } from './dto/create-material-purchase-order.dto';
import { CreateMaterialPurchaseOrderItemDto } from './dto/create-material-purchase-order-item.dto';

const MATERIAL_COLUMNS = {
  code: true,
  title: true,
  materialType: true,
  unitOfMeasurement: true,
  subCategoryId: true,
} as const;

type Tx = Parameters<Parameters<DrizzleDB['transaction']>[0]>[0];

type UnitConversionRow = { unit: MaterialUnit; conversionFactorToBase: number };

@Injectable()
export class MaterialPurchaseOrdersService {
  constructor(
    @Inject(DRIZZLE) private db: DrizzleDB,
    private queryBuilderService: QueryBuilderService,
    private materialUnitValidationService: MaterialUnitValidationService,
  ) {}

  public async create(createDto: CreateMaterialPurchaseOrderDto, user: User) {
    const { items, supplierId, notes } = createDto;
    this.assertNoDuplicateMaterials(items.map((item) => item.materialCode));
    await this.assertSupplierExists(supplierId);
    await this.materialUnitValidationService.assertValidSelectedUnits(items);
    this.assertEveryItemHasAllocations(items);
    this.assertNoDuplicateAllocationsPerItem(items);

    const totalAmount = items.reduce((sum, item) => sum + Number(item.quantityOrdered) * Number(item.unitPrice), 0);

    return await this.db.transaction(async (tx) => {
      const [order] = await tx
        .insert(materialPurchaseOrders)
        .values({
          code: sql`DEFAULT`,
          supplierId,
          totalAmount,
          notes,
          createdBy: user.id,
        })
        .returning();

      const insertedItems = await tx
        .insert(materialPurchaseOrderItems)
        .values(
          items.map((item) => ({
            materialPurchaseOrderId: order.id,
            materialCode: item.materialCode,
            unitOfMeasurementSelected: item.unitOfMeasurementSelected,
            quantityOrdered: item.quantityOrdered,
            unitPrice: item.unitPrice,
            notes: item.notes,
          })),
        )
        .returning();

      await this.insertRequisitionAllocations(tx, items, insertedItems);

      return { ...order, items: insertedItems };
    });
  }

  public async list(queryParams: QueryParams) {
    return await this.queryBuilderService.execute(materialPurchaseOrders, queryParams, {
      filtering: true,
      searchableFields: ['code', 'notes'],
      fieldLimiting: true,
      sorting: true,
      pagination: true,
      withRelations: {
        supplier: { columns: { id: true, name: true } },
        invoices: { columns: { id: true, invoiceNumber: true, issuedAt: true, totalPurchases: true } },
      },
    });
  }

  public async get(id: string) {
    const order = await this.db.query.materialPurchaseOrders.findFirst({
      where: eq(materialPurchaseOrders.id, id),
      with: {
        supplier: { columns: { id: true, name: true } },
        createdBy: { columns: { id: true, name: true } },
        items: {
          with: { material: { columns: MATERIAL_COLUMNS, extras: materialUnitConversionsExtra } },
        },
      },
    });

    if (!order)
      throw new NotFoundException(
        translate(`Material purchase order with ID ${id} does not exist.`, `لا يوجد أمر شراء مواد بالمعرف ${id}.`),
      );

    const progressByItemId = await this.getQuantityProgressByOrderItemId(order.items);
    const allocationsByOrderItemId = await this.getRequisitionAllocationsByOrderItemIds(order.items.map((item) => item.id));

    return {
      ...order,
      items: order.items.map((item) => {
        const progress = progressByItemId.get(item.id);
        return {
          ...item,
          quantityReceived: progress?.quantityReceived ?? 0,
          quantityRemaining: progress?.quantityRemaining ?? Number(item.quantityOrdered),
          requisitionAllocations: allocationsByOrderItemId.get(item.id) ?? [],
        };
      }),
    };
  }

  // ============================== PRIVATE METHODS ==============================

  private assertNoDuplicateMaterials(materialCodes: string[]) {
    if (new Set(materialCodes).size !== materialCodes.length) {
      throw new ConflictException(
        translate(
          'Duplicate materials are not allowed on the same purchase order.',
          'لا يُسمح بتكرار المواد في نفس أمر التوريد.',
        ),
      );
    }
  }

  private assertEveryItemHasAllocations(items: CreateMaterialPurchaseOrderItemDto[]) {
    for (const item of items) {
      if (!item.requisitionAllocations?.length) {
        throw new BadRequestException(
          translate(
            `Material ${item.materialCode} must be linked to at least one open purchase requisition line.`,
            `يجب ربط المادة ${item.materialCode} ببند طلب شراء مفتوح واحد على الأقل.`,
          ),
        );
      }
    }
  }

  private assertNoDuplicateAllocationsPerItem(items: CreateMaterialPurchaseOrderItemDto[]) {
    for (const item of items) {
      const allocations = item.requisitionAllocations;
      const ids = allocations.map((row) => row.materialPurchaseRequisitionItemId);
      if (new Set(ids).size !== ids.length) {
        throw new BadRequestException(
          translate(
            `Duplicate requisition allocations are not allowed on material ${item.materialCode}.`,
            `لا يُسمح بتكرار توزيعات طلب الشراء على المادة ${item.materialCode}.`,
          ),
        );
      }
    }
  }

  private async assertSupplierExists(supplierId: string) {
    const supplier = await this.db.query.suppliers.findFirst({
      where: eq(suppliers.id, supplierId),
      columns: { id: true },
    });

    if (!supplier) {
      throw new NotFoundException(
        translate(`Supplier with ID ${supplierId} does not exist.`, `لا يوجد مورد بالمعرف ${supplierId}.`),
      );
    }
  }

  private async insertRequisitionAllocations(
    tx: Tx,
    items: CreateMaterialPurchaseOrderItemDto[],
    insertedItems: { id: string; materialCode: string }[],
  ) {
    const allocationRows: {
      materialPurchaseOrderItemId: string;
      materialPurchaseRequisitionItemId: string;
      quantityAllocated: number;
      materialCode: string;
      quantityOrdered: number;
      unitOfMeasurementSelected: MaterialUnit;
    }[] = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const inserted = insertedItems[i];
      for (const allocation of item.requisitionAllocations) {
        allocationRows.push({
          materialPurchaseOrderItemId: inserted.id,
          materialPurchaseRequisitionItemId: allocation.materialPurchaseRequisitionItemId,
          quantityAllocated: Number(allocation.quantityAllocated),
          materialCode: item.materialCode,
          quantityOrdered: Number(item.quantityOrdered),
          unitOfMeasurementSelected: item.unitOfMeasurementSelected,
        });
      }
    }

    if (allocationRows.length === 0) {
      throw new BadRequestException(
        translate(
          'Every purchase order line must be linked to open purchase requisition lines.',
          'يجب ربط كل بند في أمر التوريد ببنود طلبات شراء مفتوحة.',
        ),
      );
    }

    const requisitionItemIds = [...new Set(allocationRows.map((row) => row.materialPurchaseRequisitionItemId))];

    // Lock requisition lines so concurrent MPO creates cannot over-allocate remaining qty.
    await tx
      .select({ id: materialPurchaseRequisitionItems.id })
      .from(materialPurchaseRequisitionItems)
      .where(inArray(materialPurchaseRequisitionItems.id, requisitionItemIds))
      .for('update');

    const requisitionItems = await tx.query.materialPurchaseRequisitionItems.findMany({
      where: inArray(materialPurchaseRequisitionItems.id, requisitionItemIds),
      with: {
        materialPurchaseRequisition: {
          columns: {
            id: true,
            code: true,
            planningDecision: true,
            inventoryControlDecision: true,
            managerDecision: true,
          },
        },
      },
    });

    if (requisitionItems.length !== requisitionItemIds.length) {
      const found = new Set(requisitionItems.map((row) => row.id));
      const missing = requisitionItemIds.filter((id) => !found.has(id));
      throw new NotFoundException(
        translate(
          `Purchase requisition item(s) not found: ${missing.join(', ')}.`,
          `بنود طلب الشراء غير موجودة: ${missing.join(', ')}.`,
        ),
      );
    }

    const reqItemById = new Map(requisitionItems.map((row) => [row.id, row]));
    const materialCodes = [...new Set(allocationRows.map((row) => row.materialCode))];

    const materialRows = await tx.query.materials.findMany({
      where: inArray(materials.code, materialCodes),
      columns: { code: true, unitOfMeasurement: true },
      extras: materialUnitConversionsExtra,
    });
    const materialByCode = new Map(materialRows.map((row) => [row.code, row]));

    const existingAllocations = await tx
      .select({
        materialPurchaseRequisitionItemId: materialPurchaseOrderItemRequisitionItems.materialPurchaseRequisitionItemId,
        totalAllocated: sql<string>`coalesce(sum(${materialPurchaseOrderItemRequisitionItems.quantityAllocated}), 0)`,
      })
      .from(materialPurchaseOrderItemRequisitionItems)
      .where(inArray(materialPurchaseOrderItemRequisitionItems.materialPurchaseRequisitionItemId, requisitionItemIds))
      .groupBy(materialPurchaseOrderItemRequisitionItems.materialPurchaseRequisitionItemId);

    const existingAllocatedByReqItemId = new Map(
      existingAllocations.map((row) => [row.materialPurchaseRequisitionItemId, Number(row.totalAllocated)]),
    );

    const newAllocatedByReqItemId = new Map<string, number>();
    const newAllocatedBaseByOrderItemId = new Map<string, number>();

    for (const row of allocationRows) {
      const reqItem = reqItemById.get(row.materialPurchaseRequisitionItemId)!;
      const requisition = reqItem.materialPurchaseRequisition;
      const material = materialByCode.get(row.materialCode);

      if (!material) {
        throw new NotFoundException(
          translate(`Material ${row.materialCode} does not exist.`, `المادة ${row.materialCode} غير موجودة.`),
        );
      }

      if (
        requisition.planningDecision !== APPROVAL_DECISIONS.APPROVED ||
        requisition.inventoryControlDecision !== APPROVAL_DECISIONS.APPROVED ||
        requisition.managerDecision !== APPROVAL_DECISIONS.APPROVED
      ) {
        throw new BadRequestException(
          translate(
            `Requisition ${requisition.code} must be fully approved before allocating its lines.`,
            `يجب اعتماد طلب الشراء ${requisition.code} بالكامل قبل توزيع بنوده.`,
          ),
        );
      }

      if (reqItem.materialCode !== row.materialCode) {
        throw new BadRequestException(
          translate(
            `Requisition item material ${reqItem.materialCode} does not match order line material ${row.materialCode}.`,
            `مادة بند طلب الشراء ${reqItem.materialCode} لا تطابق مادة بند أمر التوريد ${row.materialCode}.`,
          ),
        );
      }

      const conversions = (material.unitConversions ?? []) as UnitConversionRow[];
      const reqFactor = resolveConversionFactor(
        reqItem.unitOfMeasurementSelected as MaterialUnit,
        material.unitOfMeasurement as MaterialUnit,
        conversions,
      );

      newAllocatedByReqItemId.set(
        row.materialPurchaseRequisitionItemId,
        (newAllocatedByReqItemId.get(row.materialPurchaseRequisitionItemId) ?? 0) + row.quantityAllocated,
      );
      newAllocatedBaseByOrderItemId.set(
        row.materialPurchaseOrderItemId,
        (newAllocatedBaseByOrderItemId.get(row.materialPurchaseOrderItemId) ?? 0) +
          toBaseQuantity(row.quantityAllocated, reqFactor),
      );
    }

    for (const [reqItemId, newQty] of newAllocatedByReqItemId) {
      const reqItem = reqItemById.get(reqItemId)!;
      const existing = existingAllocatedByReqItemId.get(reqItemId) ?? 0;
      const requested = Number(reqItem.quantityRequested);
      if (existing + newQty > requested + 1e-9) {
        throw new BadRequestException(
          translate(
            `Allocated quantity for requisition item exceeds quantity requested (${requested}).`,
            `الكمية الموزعة لبند طلب الشراء تتجاوز الكمية المطلوبة (${requested}).`,
          ),
        );
      }
    }

    const orderItemById = new Map(
      allocationRows.map((row) => [
        row.materialPurchaseOrderItemId,
        {
          quantityOrdered: row.quantityOrdered,
          unitOfMeasurementSelected: row.unitOfMeasurementSelected,
          materialCode: row.materialCode,
        },
      ]),
    );

    for (const [orderItemId, allocatedBase] of newAllocatedBaseByOrderItemId) {
      const orderItem = orderItemById.get(orderItemId)!;
      const material = materialByCode.get(orderItem.materialCode)!;
      const conversions = (material.unitConversions ?? []) as UnitConversionRow[];
      const orderFactor = resolveConversionFactor(
        orderItem.unitOfMeasurementSelected,
        material.unitOfMeasurement as MaterialUnit,
        conversions,
      );
      const orderedBase = toBaseQuantity(orderItem.quantityOrdered, orderFactor);
      if (Math.abs(allocatedBase - orderedBase) > 1e-9) {
        throw new BadRequestException(
          translate(
            `Allocated quantity for material ${orderItem.materialCode} must equal quantity ordered.`,
            `يجب أن تساوي الكمية الموزعة للمادة ${orderItem.materialCode} الكمية المطلوبة في أمر التوريد.`,
          ),
        );
      }
    }

    await tx.insert(materialPurchaseOrderItemRequisitionItems).values(
      allocationRows.map((row) => ({
        materialPurchaseOrderItemId: row.materialPurchaseOrderItemId,
        materialPurchaseRequisitionItemId: row.materialPurchaseRequisitionItemId,
        quantityAllocated: row.quantityAllocated,
      })),
    );
  }

  /**
   * Progress per order line, expressed in that line's `unitOfMeasurementSelected`.
   * `quantityReceived` = accepted qty only; remaining subtracts accepted + rejected.
   */
  private async getQuantityProgressByOrderItemId(
    orderItems: {
      id: string;
      quantityOrdered: string | number;
      unitOfMeasurementSelected: MaterialUnit;
      material: {
        unitOfMeasurement: MaterialUnit;
        unitConversions: { unit: MaterialUnit; conversionFactorToBase: number }[];
      };
    }[],
  ) {
    const progress = new Map<string, { quantityReceived: number; quantityRemaining: number }>();
    const orderItemIds = orderItems.map((item) => item.id);

    for (const item of orderItems) {
      progress.set(item.id, { quantityReceived: 0, quantityRemaining: Number(item.quantityOrdered) });
    }

    if (orderItemIds.length === 0) return progress;

    const receiptItems = await this.db.query.materialPurchaseReceiptItems.findMany({
      where: inArray(materialPurchaseReceiptItems.materialPurchaseOrderItemId, orderItemIds),
      columns: {
        materialPurchaseOrderItemId: true,
        unitOfMeasurementSelected: true,
        quantityReceived: true,
        quantityRejected: true,
      },
    });

    const orderItemById = new Map(orderItems.map((item) => [item.id, item]));
    const acceptedBaseById = new Map<string, number>();
    const coveredBaseById = new Map<string, number>();

    for (const row of receiptItems) {
      const orderItem = orderItemById.get(row.materialPurchaseOrderItemId);
      if (!orderItem) continue;

      const conversions = orderItem.material.unitConversions ?? [];
      const factor = resolveConversionFactor(
        row.unitOfMeasurementSelected,
        orderItem.material.unitOfMeasurement,
        conversions,
      );
      const acceptedBase = toBaseQuantity(Number(row.quantityReceived), factor);
      const coveredBase = acceptedBase + toBaseQuantity(Number(row.quantityRejected), factor);
      acceptedBaseById.set(
        row.materialPurchaseOrderItemId,
        (acceptedBaseById.get(row.materialPurchaseOrderItemId) ?? 0) + acceptedBase,
      );
      coveredBaseById.set(
        row.materialPurchaseOrderItemId,
        (coveredBaseById.get(row.materialPurchaseOrderItemId) ?? 0) + coveredBase,
      );
    }

    for (const item of orderItems) {
      const conversions = item.material.unitConversions ?? [];
      const orderFactor = resolveConversionFactor(
        item.unitOfMeasurementSelected,
        item.material.unitOfMeasurement,
        conversions,
      );
      const orderedBase = toBaseQuantity(Number(item.quantityOrdered), orderFactor);
      const acceptedBase = acceptedBaseById.get(item.id) ?? 0;
      const coveredBase = coveredBaseById.get(item.id) ?? 0;
      const remainingBase = Math.max(0, orderedBase - coveredBase);

      progress.set(item.id, {
        quantityReceived: orderFactor === 0 ? acceptedBase : acceptedBase / orderFactor,
        quantityRemaining: orderFactor === 0 ? remainingBase : remainingBase / orderFactor,
      });
    }

    return progress;
  }

  private async getRequisitionAllocationsByOrderItemIds(orderItemIds: string[]) {
    type AllocationView = {
      id: string;
      materialPurchaseRequisitionItemId: string;
      quantityAllocated: number;
      unitOfMeasurementSelected: MaterialUnit;
      requisition: { id: string; code: string; productionSubDepartment: string };
    };

    const result = new Map<string, AllocationView[]>();
    for (const id of orderItemIds) result.set(id, []);
    if (orderItemIds.length === 0) return result;

    const rows = await this.db
      .select({
        id: materialPurchaseOrderItemRequisitionItems.id,
        materialPurchaseOrderItemId: materialPurchaseOrderItemRequisitionItems.materialPurchaseOrderItemId,
        materialPurchaseRequisitionItemId: materialPurchaseOrderItemRequisitionItems.materialPurchaseRequisitionItemId,
        quantityAllocated: materialPurchaseOrderItemRequisitionItems.quantityAllocated,
        unitOfMeasurementSelected: materialPurchaseRequisitionItems.unitOfMeasurementSelected,
        requisitionId: materialPurchaseRequisitions.id,
        requisitionCode: materialPurchaseRequisitions.code,
        productionSubDepartment: materialPurchaseRequisitions.productionSubDepartment,
      })
      .from(materialPurchaseOrderItemRequisitionItems)
      .innerJoin(
        materialPurchaseRequisitionItems,
        eq(
          materialPurchaseOrderItemRequisitionItems.materialPurchaseRequisitionItemId,
          materialPurchaseRequisitionItems.id,
        ),
      )
      .innerJoin(
        materialPurchaseRequisitions,
        eq(materialPurchaseRequisitionItems.materialPurchaseRequisitionId, materialPurchaseRequisitions.id),
      )
      .where(inArray(materialPurchaseOrderItemRequisitionItems.materialPurchaseOrderItemId, orderItemIds));

    for (const row of rows) {
      const list = result.get(row.materialPurchaseOrderItemId) ?? [];
      list.push({
        id: row.id,
        materialPurchaseRequisitionItemId: row.materialPurchaseRequisitionItemId,
        quantityAllocated: Number(row.quantityAllocated),
        unitOfMeasurementSelected: row.unitOfMeasurementSelected as MaterialUnit,
        requisition: {
          id: row.requisitionId,
          code: row.requisitionCode,
          productionSubDepartment: row.productionSubDepartment,
        },
      });
      result.set(row.materialPurchaseOrderItemId, list);
    }

    return result;
  }
}
