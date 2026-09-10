import { eq, inArray, sql } from 'drizzle-orm';
import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DRIZZLE, type DrizzleDB } from 'src/database/database.constants';
import {
  materialPurchaseOrderItems,
  materialPurchaseOrders,
  materialPurchaseReceiptItems,
  suppliers,
} from 'src/database/schema';
import { QueryParams, type MaterialUnit, type User } from 'src/utils/types';
import { translate } from 'src/utils/i18n/translate';
import { materialUnitConversionsExtra } from 'src/utils/extras/material-unit-conversions-extra';
import { resolveConversionFactor, toBaseQuantity } from 'src/utils/helpers/unit-conversion';
import { MaterialUnitValidationService } from 'src/utils/services/material-unit-validation.service';
import { QueryBuilderService } from 'src/utils/services/query-builder.service';
import { CreateMaterialPurchaseOrderDto } from './dto/create-material-purchase-order.dto';

const MATERIAL_COLUMNS = {
  code: true,
  title: true,
  materialType: true,
  unitOfMeasurement: true,
  subCategoryId: true,
} as const;

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

    const remainingByItemId = await this.getQuantityRemainingByOrderItemId(order.items);

    return {
      ...order,
      items: order.items.map((item) => ({
        ...item,
        quantityRemaining: remainingByItemId.get(item.id) ?? Number(item.quantityOrdered),
      })),
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

  /** Remaining qty per order line, expressed in that line's `unitOfMeasurementSelected`. */
  private async getQuantityRemainingByOrderItemId(
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
    const remaining = new Map<string, number>();
    const orderItemIds = orderItems.map((item) => item.id);

    for (const item of orderItems) {
      remaining.set(item.id, Number(item.quantityOrdered));
    }

    if (orderItemIds.length === 0) return remaining;

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
    const receivedBaseById = new Map<string, number>();

    for (const row of receiptItems) {
      const orderItem = orderItemById.get(row.materialPurchaseOrderItemId);
      if (!orderItem) continue;

      const conversions = orderItem.material.unitConversions ?? [];
      const factor = resolveConversionFactor(
        row.unitOfMeasurementSelected,
        orderItem.material.unitOfMeasurement,
        conversions,
      );
      const baseQty =
        toBaseQuantity(Number(row.quantityReceived), factor) + toBaseQuantity(Number(row.quantityRejected), factor);
      receivedBaseById.set(row.materialPurchaseOrderItemId, (receivedBaseById.get(row.materialPurchaseOrderItemId) ?? 0) + baseQty);
    }

    for (const item of orderItems) {
      const conversions = item.material.unitConversions ?? [];
      const orderFactor = resolveConversionFactor(
        item.unitOfMeasurementSelected,
        item.material.unitOfMeasurement,
        conversions,
      );
      const orderedBase = toBaseQuantity(Number(item.quantityOrdered), orderFactor);
      const receivedBase = receivedBaseById.get(item.id) ?? 0;
      const remainingBase = Math.max(0, orderedBase - receivedBase);
      remaining.set(item.id, orderFactor === 0 ? remainingBase : remainingBase / orderFactor);
    }

    return remaining;
  }
}
