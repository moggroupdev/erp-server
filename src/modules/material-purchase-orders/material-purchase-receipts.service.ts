import { eq, inArray, sql } from 'drizzle-orm';
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DRIZZLE, type DrizzleDB } from 'src/database/database.constants';
import {
  materialPurchaseOrderItems,
  materialPurchaseOrders,
  materialPurchaseReceiptItems,
  materialPurchaseReceipts,
} from 'src/database/schema';
import { QueryParams, type MaterialUnit, type User } from 'src/utils/types';
import { translate } from 'src/utils/i18n/translate';
import { materialUnitConversionsExtra } from 'src/utils/extras/material-unit-conversions-extra';
import { resolveConversionFactor, toBaseQuantity } from 'src/utils/helpers/unit-conversion';
import { MaterialUnitValidationService } from 'src/utils/services/material-unit-validation.service';
import { QueryBuilderService } from 'src/utils/services/query-builder.service';
import { CreateMaterialPurchaseReceiptDto } from './dto/create-material-purchase-receipt.dto';

const MATERIAL_COLUMNS = {
  code: true,
  title: true,
  materialType: true,
  unitOfMeasurement: true,
  subCategoryId: true,
} as const;

const QTY_EPSILON = 1e-9;

type UnitConversion = { unit: MaterialUnit; conversionFactorToBase: number };

type OrderItemForReceipt = {
  id: string;
  materialCode: string;
  unitOfMeasurementSelected: MaterialUnit;
  quantityOrdered: string | number;
  material: {
    code: string;
    unitOfMeasurement: MaterialUnit;
    unitConversions: UnitConversion[];
  };
};

@Injectable()
export class MaterialPurchaseReceiptsService {
  constructor(
    @Inject(DRIZZLE) private db: DrizzleDB,
    private queryBuilderService: QueryBuilderService,
    private materialUnitValidationService: MaterialUnitValidationService,
  ) {}

  public async list(queryParams: QueryParams) {
    return await this.queryBuilderService.execute(materialPurchaseReceipts, queryParams, {
      filtering: true,
      searchableFields: ['code', 'notes'],
      fieldLimiting: true,
      sorting: true,
      pagination: true,
    });
  }

  public async get(id: string) {
    const receipt = await this.db.query.materialPurchaseReceipts.findFirst({
      where: eq(materialPurchaseReceipts.id, id),
      with: {
        materialPurchaseOrder: { columns: { id: true, code: true } },

        inventoryTransactions: { columns: { id: true, legacyNumber: true } },
        createdBy: { columns: { id: true, name: true } },
        receivedBy: { columns: { id: true, name: true } },
        items: {
          with: {
            materialPurchaseOrderItem: {
              columns: {
                id: true,
                materialCode: true,
                unitOfMeasurementSelected: true,
                quantityOrdered: true,
                unitPrice: true,
              },
              with: { material: { columns: MATERIAL_COLUMNS, extras: materialUnitConversionsExtra } },
            },
          },
        },
      },
    });

    if (!receipt)
      throw new NotFoundException(
        translate(`Material purchase receipt with ID ${id} does not exist.`, `لا يوجد إذن استلام مواد بالمعرف ${id}.`),
      );

    return receipt;
  }

  public async create(createDto: CreateMaterialPurchaseReceiptDto, user: User) {
    const { materialPurchaseOrderId, notes, receivedAt, items } = createDto;

    this.assertNoDuplicateOrderItems(items.map((item) => item.materialPurchaseOrderItemId));

    if (!items.some((item) => Number(item.quantityReceived) + Number(item.quantityRejected) > 0)) {
      throw new BadRequestException(
        translate(
          'At least one receipt line must have a received or rejected quantity greater than zero.',
          'يجب أن يحتوي بند واحد على الأقل على كمية مستلمة أو مرفوضة أكبر من صفر.',
        ),
      );
    }

    const order = await this.db.query.materialPurchaseOrders.findFirst({
      where: eq(materialPurchaseOrders.id, materialPurchaseOrderId),
      columns: { id: true, code: true, cancelledAt: true, completedAt: true },
      with: {
        items: {
          with: { material: { columns: MATERIAL_COLUMNS, extras: materialUnitConversionsExtra } },
        },
      },
    });

    if (!order)
      throw new NotFoundException(
        translate(
          `Material purchase order with ID ${materialPurchaseOrderId} does not exist.`,
          `لا يوجد أمر توريد خامات بالمعرف ${materialPurchaseOrderId}.`,
        ),
      );

    if (order.cancelledAt) {
      throw new BadRequestException(
        translate(
          'Cannot add a receipt to a cancelled purchase order.',
          'لا يمكن إضافة سند استلام إلى أمر توريد ملغي.',
        ),
      );
    }

    const orderItemById = new Map(order.items.map((item) => [item.id, item as OrderItemForReceipt]));

    for (const item of items) {
      if (!orderItemById.has(item.materialPurchaseOrderItemId)) {
        throw new BadRequestException(
          translate(
            `Order item ${item.materialPurchaseOrderItemId} does not belong to this purchase order.`,
            `بند أمر التوريد ${item.materialPurchaseOrderItemId} لا ينتمي إلى أمر التوريد هذا.`,
          ),
        );
      }
    }

    await this.materialUnitValidationService.assertValidSelectedUnits(
      items.map((item) => {
        const orderItem = orderItemById.get(item.materialPurchaseOrderItemId)!;
        return { materialCode: orderItem.materialCode, unitOfMeasurementSelected: item.unitOfMeasurementSelected };
      }),
    );

    const previouslyReceivedBase = await this.getPreviouslyReceivedBaseByOrderItemId(order.id);

    for (const item of items) {
      const orderItem = orderItemById.get(item.materialPurchaseOrderItemId)!;
      const conversions = orderItem.material.unitConversions ?? [];
      const baseUnit = orderItem.material.unitOfMeasurement;

      const orderedBase = toBaseQuantity(
        Number(orderItem.quantityOrdered),
        resolveConversionFactor(orderItem.unitOfMeasurementSelected, baseUnit, conversions),
      );
      const previousBase = previouslyReceivedBase.get(item.materialPurchaseOrderItemId) ?? 0;
      const incomingBase =
        toBaseQuantity(
          Number(item.quantityReceived),
          resolveConversionFactor(item.unitOfMeasurementSelected, baseUnit, conversions),
        ) +
        toBaseQuantity(
          Number(item.quantityRejected),
          resolveConversionFactor(item.unitOfMeasurementSelected, baseUnit, conversions),
        );

      if (previousBase + incomingBase > orderedBase + QTY_EPSILON) {
        throw new BadRequestException(
          translate(
            `Received and rejected quantities for material ${orderItem.materialCode} exceed the ordered quantity.`,
            `الكميات المستلمة والمرفوضة للمادة ${orderItem.materialCode} تتجاوز الكمية المطلوبة.`,
          ),
        );
      }
    }

    const resolvedReceivedAt = receivedAt ? new Date(receivedAt) : new Date();

    return await this.db.transaction(async (tx) => {
      const [receipt] = await tx
        .insert(materialPurchaseReceipts)
        .values({
          code: sql`DEFAULT`,
          materialPurchaseOrderId: order.id,
          receivedAt: resolvedReceivedAt,
          receivedBy: user.id,
          notes,
          createdBy: user.id,
        })
        .returning();

      const insertedItems = await tx
        .insert(materialPurchaseReceiptItems)
        .values(
          items.map((item) => ({
            materialPurchaseReceiptId: receipt.id,
            materialPurchaseOrderItemId: item.materialPurchaseOrderItemId,
            unitOfMeasurementSelected: item.unitOfMeasurementSelected,
            quantityReceived: item.quantityReceived,
            quantityRejected: item.quantityRejected,
            inspectionNotes: item.inspectionNotes,
          })),
        )
        .returning();

      await this.recomputeOrderCompletedAt(tx, order.id, order.items as OrderItemForReceipt[], previouslyReceivedBase, items);

      return { ...receipt, items: insertedItems };
    });
  }

  // ============================== PRIVATE METHODS ==============================

  private assertNoDuplicateOrderItems(orderItemIds: string[]) {
    if (new Set(orderItemIds).size !== orderItemIds.length) {
      throw new BadRequestException(
        translate(
          'Duplicate order items are not allowed on the same receipt.',
          'لا يُسمح بتكرار بنود أمر التوريد في نفس سند الاستلام.',
        ),
      );
    }
  }

  private async getPreviouslyReceivedBaseByOrderItemId(orderId: string) {
    const orderItems = await this.db.query.materialPurchaseOrderItems.findMany({
      where: eq(materialPurchaseOrderItems.materialPurchaseOrderId, orderId),
      columns: { id: true },
    });

    const orderItemIds = orderItems.map((item) => item.id);
    const totals = new Map<string, number>();
    for (const id of orderItemIds) totals.set(id, 0);

    if (orderItemIds.length === 0) return totals;

    const existingReceiptItems = await this.db.query.materialPurchaseReceiptItems.findMany({
      where: inArray(materialPurchaseReceiptItems.materialPurchaseOrderItemId, orderItemIds),
      with: {
        materialPurchaseOrderItem: {
          columns: { id: true, materialCode: true, unitOfMeasurementSelected: true },
          with: {
            material: {
              columns: { unitOfMeasurement: true },
              extras: materialUnitConversionsExtra,
            },
          },
        },
      },
    });

    for (const row of existingReceiptItems) {
      const material = row.materialPurchaseOrderItem.material;
      const conversions = material.unitConversions ?? [];
      const factor = resolveConversionFactor(row.unitOfMeasurementSelected, material.unitOfMeasurement, conversions);
      const baseQty =
        toBaseQuantity(Number(row.quantityReceived), factor) + toBaseQuantity(Number(row.quantityRejected), factor);
      totals.set(row.materialPurchaseOrderItemId, (totals.get(row.materialPurchaseOrderItemId) ?? 0) + baseQty);
    }

    return totals;
  }

  private async recomputeOrderCompletedAt(
    tx: Pick<DrizzleDB, 'update'>,
    orderId: string,
    orderItems: OrderItemForReceipt[],
    previouslyReceivedBase: Map<string, number>,
    newItems: {
      materialPurchaseOrderItemId: string;
      unitOfMeasurementSelected: MaterialUnit;
      quantityReceived: number;
      quantityRejected: number;
    }[],
  ) {
    const totals = new Map(previouslyReceivedBase);

    for (const item of newItems) {
      const orderItem = orderItems.find((row) => row.id === item.materialPurchaseOrderItemId);
      if (!orderItem) continue;

      const conversions = orderItem.material.unitConversions ?? [];
      const factor = resolveConversionFactor(item.unitOfMeasurementSelected, orderItem.material.unitOfMeasurement, conversions);
      const incoming =
        toBaseQuantity(Number(item.quantityReceived), factor) + toBaseQuantity(Number(item.quantityRejected), factor);
      totals.set(item.materialPurchaseOrderItemId, (totals.get(item.materialPurchaseOrderItemId) ?? 0) + incoming);
    }

    const fullyReceived = orderItems.every((orderItem) => {
      const conversions = orderItem.material.unitConversions ?? [];
      const orderedBase = toBaseQuantity(
        Number(orderItem.quantityOrdered),
        resolveConversionFactor(orderItem.unitOfMeasurementSelected, orderItem.material.unitOfMeasurement, conversions),
      );
      const receivedBase = totals.get(orderItem.id) ?? 0;
      return receivedBase + QTY_EPSILON >= orderedBase;
    });

    await tx
      .update(materialPurchaseOrders)
      .set({ completedAt: fullyReceived ? new Date() : null })
      .where(eq(materialPurchaseOrders.id, orderId));
  }
}
