import { and, asc, eq, inArray, isNull, notInArray, sql } from 'drizzle-orm';
import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DRIZZLE, type DrizzleDB } from 'src/database/database.constants';
import {
  inventoryTransactionItems,
  inventoryTransactions,
  materialPurchaseOrderItemRequisitionItems,
  materialPurchaseOrderItems,
  materialPurchaseOrderPaymentTerms,
  materialPurchaseOrders,
  materialPurchaseReceiptItems,
  materialPurchaseReceipts,
  materialPurchaseRequisitionItems,
  materialPurchaseRequisitions,
  materials,
  requestForQuotations,
  supplierInvoices,
  supplierQuotationItems,
  supplierQuotations,
  suppliers,
} from 'src/database/schema';
import {
  APPROVAL_DECISIONS,
  MATERIAL_PURCHASE_ORDER_UPDATE_WINDOW_MS,
  MPO_DELIVERY_TIMINGS,
  MPO_PAYMENT_EVENTS,
  MPO_PAYMENT_VALUE_KINDS,
  VAT_RATE,
} from 'src/utils/constants';
import { QueryParams, type MaterialUnit, type User } from 'src/utils/types';
import { translate } from 'src/utils/i18n/translate';
import { materialUnitConversionsExtra } from 'src/utils/extras/material-unit-conversions-extra';
import { convertUnitPrice, resolveConversionFactor, toBaseQuantity } from 'src/utils/helpers/unit-conversion';
import { MaterialUnitValidationService } from 'src/utils/services/material-unit-validation.service';
import { QueryBuilderService } from 'src/utils/services/query-builder.service';
import { CreateMaterialPurchaseOrderDto } from './dto/create-material-purchase-order.dto';
import { UpdateMaterialPurchaseOrderDto } from './dto/update-material-purchase-order.dto';
import { UpdateMaterialPurchaseOrderItemDto } from './dto/update-material-purchase-order-item.dto';
import { CreateMaterialPurchaseOrderItemDto } from './dto/create-material-purchase-order-item.dto';
import { CreateMaterialPurchaseOrderPaymentTermDto } from './dto/create-material-purchase-order-payment-term.dto';

const QTY_EPSILON = 1e-9;

const MONEY_SCALE = 1_000_000;

function toScaledAmount(amount: number) {
  return Math.round(amount * MONEY_SCALE);
}

function sameNullableNumber(current: string | number | null, next: number | null) {
  if (current == null && next == null) return true;
  if (current == null || next == null) return false;
  return Number(current) === next;
}

function needsPaymentOffset(event: CreateMaterialPurchaseOrderPaymentTermDto['event']) {
  return event === MPO_PAYMENT_EVENTS.AFTER_RECEIPT || event === MPO_PAYMENT_EVENTS.AFTER_INVOICE;
}

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
    const { items, supplierId, notes, deliveryLocation, deliveryTiming, paymentTerms } = createDto;
    this.assertNoDuplicateMaterials(items.map((item) => item.materialCode));
    await this.assertSupplierExists(supplierId);
    await this.materialUnitValidationService.assertValidSelectedUnits(items);
    this.assertEveryItemHasAllocations(items);
    this.assertNoDuplicateAllocationsPerItem(items);
    await this.assertSupplierQuotationLinks(supplierId, items);

    const deliveryPeriodDays = this.resolveDeliveryPeriodDays(deliveryTiming, createDto.deliveryPeriodDays);
    const normalizedTerms = this.normalizePaymentTerms(paymentTerms);

    const totalAmount = items.reduce((sum, item) => sum + Number(item.quantityOrdered) * Number(item.unitPrice), 0);
    const grandTotal = totalAmount + totalAmount * VAT_RATE;
    this.assertPaymentTermsCoverTotal(normalizedTerms, grandTotal);

    return await this.db.transaction(async (tx) => {
      const [order] = await tx
        .insert(materialPurchaseOrders)
        .values({
          code: sql`DEFAULT`,
          supplierId,
          totalAmount,
          deliveryLocation,
          deliveryTiming,
          deliveryPeriodDays,
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
            supplierQuotationItemId: item.supplierQuotationItemId ?? null,
          })),
        )
        .returning();

      await this.insertRequisitionAllocations(tx, items, insertedItems);

      const insertedPaymentTerms = await tx
        .insert(materialPurchaseOrderPaymentTerms)
        .values(
          normalizedTerms.map((term, index) => ({
            materialPurchaseOrderId: order.id,
            sequenceOrder: index + 1,
            event: term.event,
            offsetDays: term.offsetDays,
            valueKind: term.valueKind,
            value: term.value,
          })),
        )
        .returning();

      return { ...order, items: insertedItems, paymentTerms: insertedPaymentTerms };
    });
  }

  public async update(id: string, updateDto: UpdateMaterialPurchaseOrderDto) {
    const { items, notes, deliveryLocation, deliveryTiming, paymentTerms } = updateDto;
    this.assertNoDuplicateMaterials(items.map((item) => item.materialCode));
    await this.materialUnitValidationService.assertValidSelectedUnits(items);
    this.assertEveryItemHasAllocations(items);
    this.assertNoDuplicateAllocationsPerItem(items);

    const deliveryPeriodDays = this.resolveDeliveryPeriodDays(deliveryTiming, updateDto.deliveryPeriodDays);
    const normalizedTerms = this.normalizePaymentTerms(paymentTerms);

    const totalAmount = items.reduce((sum, item) => sum + Number(item.quantityOrdered) * Number(item.unitPrice), 0);
    const grandTotal = totalAmount + totalAmount * VAT_RATE;
    this.assertPaymentTermsCoverTotal(normalizedTerms, grandTotal);

    return await this.db.transaction(async (tx) => {
      const [order] = await tx.select().from(materialPurchaseOrders).where(eq(materialPurchaseOrders.id, id)).for('update');

      if (!order) {
        throw new NotFoundException(
          translate(`Material purchase order with ID ${id} does not exist.`, `لا يوجد أمر شراء مواد بالمعرف ${id}.`),
        );
      }

      this.assertOrderIsEditable(order);
      await this.assertSupplierQuotationLinks(order.supplierId, items);
      await this.assertNoReceiptsOrInvoices(tx, id);

      const existingItems = await tx
        .select()
        .from(materialPurchaseOrderItems)
        .where(eq(materialPurchaseOrderItems.materialPurchaseOrderId, id));

      const existingByCode = new Map(existingItems.map((item) => [item.materialCode, item]));
      const incomingCodes = new Set(items.map((item) => item.materialCode));
      const resolvedItems: { id: string; materialCode: string }[] = [];
      const savedItems: typeof existingItems = [];

      for (const item of items) {
        const existing = existingByCode.get(item.materialCode);
        if (!existing) {
          const [inserted] = await tx
            .insert(materialPurchaseOrderItems)
            .values({
              materialPurchaseOrderId: id,
              materialCode: item.materialCode,
              unitOfMeasurementSelected: item.unitOfMeasurementSelected,
              quantityOrdered: item.quantityOrdered,
              unitPrice: item.unitPrice,
              notes: item.notes,
              supplierQuotationItemId: item.supplierQuotationItemId ?? null,
            })
            .returning();
          resolvedItems.push(inserted);
          savedItems.push(inserted);
          continue;
        }

        const lineChanged =
          existing.unitOfMeasurementSelected !== item.unitOfMeasurementSelected ||
          Number(existing.quantityOrdered) !== Number(item.quantityOrdered) ||
          Number(existing.unitPrice) !== Number(item.unitPrice) ||
          (existing.notes ?? null) !== (item.notes ?? null) ||
          (existing.supplierQuotationItemId ?? null) !== (item.supplierQuotationItemId ?? null);

        if (lineChanged) {
          const [updated] = await tx
            .update(materialPurchaseOrderItems)
            .set({
              unitOfMeasurementSelected: item.unitOfMeasurementSelected,
              quantityOrdered: item.quantityOrdered,
              unitPrice: item.unitPrice,
              notes: item.notes,
              supplierQuotationItemId: item.supplierQuotationItemId ?? null,
            })
            .where(eq(materialPurchaseOrderItems.id, existing.id))
            .returning();
          resolvedItems.push(updated);
          savedItems.push(updated);
          continue;
        }

        resolvedItems.push(existing);
        savedItems.push(existing);
      }

      const allocationRows = await this.insertRequisitionAllocations(tx, items, resolvedItems, {
        excludeOrderItemIds: existingItems.map((item) => item.id),
        persist: false,
      });

      const existingItemIds = existingItems.map((item) => item.id);
      const existingAllocations =
        existingItemIds.length === 0
          ? []
          : await tx
              .select()
              .from(materialPurchaseOrderItemRequisitionItems)
              .where(inArray(materialPurchaseOrderItemRequisitionItems.materialPurchaseOrderItemId, existingItemIds));

      await this.diffRequisitionAllocations(
        tx,
        allocationRows,
        existingAllocations,
        new Set(resolvedItems.map((item) => item.id)),
      );

      const removedItems = existingItems.filter((item) => !incomingCodes.has(item.materialCode));
      if (removedItems.length > 0) {
        const removedIds = removedItems.map((item) => item.id);
        await tx
          .delete(materialPurchaseOrderItemRequisitionItems)
          .where(inArray(materialPurchaseOrderItemRequisitionItems.materialPurchaseOrderItemId, removedIds));
        await tx.delete(materialPurchaseOrderItems).where(inArray(materialPurchaseOrderItems.id, removedIds));
      }

      const paymentTermsResult = await this.diffPaymentTerms(tx, id, normalizedTerms);

      const headerChanged =
        Number(order.totalAmount) !== totalAmount ||
        order.deliveryLocation !== deliveryLocation ||
        order.deliveryTiming !== deliveryTiming ||
        order.deliveryPeriodDays !== deliveryPeriodDays ||
        (order.notes ?? null) !== (notes ?? null);

      const [savedOrder] = await tx
        .update(materialPurchaseOrders)
        .set({
          ...(headerChanged ? { totalAmount, deliveryLocation, deliveryTiming, deliveryPeriodDays, notes } : {}),
          updatedAt: new Date(),
        })
        .where(eq(materialPurchaseOrders.id, id))
        .returning();

      return { ...savedOrder, items: savedItems, paymentTerms: paymentTermsResult };
    });
  }

  public async getItemUpdateContext(orderId: string, itemId: string) {
    const order = await this.db.query.materialPurchaseOrders.findFirst({
      where: eq(materialPurchaseOrders.id, orderId),
      columns: { id: true, code: true, cancelledAt: true },
    });
    if (!order) {
      throw new NotFoundException(
        translate(`Material purchase order with ID ${orderId} does not exist.`, `لا يوجد أمر شراء مواد بالمعرف ${orderId}.`),
      );
    }

    const item = await this.db.query.materialPurchaseOrderItems.findFirst({
      where: and(
        eq(materialPurchaseOrderItems.id, itemId),
        eq(materialPurchaseOrderItems.materialPurchaseOrderId, orderId),
      ),
      columns: {
        id: true,
        materialCode: true,
        unitOfMeasurementSelected: true,
        quantityOrdered: true,
        unitPrice: true,
        notes: true,
      },
    });
    if (!item) {
      throw new NotFoundException(
        translate(
          `Purchase order item ${itemId} was not found on this order.`,
          `بند أمر التوريد ${itemId} غير موجود على هذا الأمر.`,
        ),
      );
    }

    const [invoice] = await this.db
      .select({ id: supplierInvoices.id })
      .from(supplierInvoices)
      .where(eq(supplierInvoices.materialPurchaseOrderId, orderId))
      .limit(1);

    const receiptRows = await this.db
      .select({
        receiptItemId: materialPurchaseReceiptItems.id,
        receiptId: materialPurchaseReceipts.id,
        receiptCode: materialPurchaseReceipts.code,
        quantityReceived: materialPurchaseReceiptItems.quantityReceived,
        quantityRejected: materialPurchaseReceiptItems.quantityRejected,
        unitOfMeasurementSelected: materialPurchaseReceiptItems.unitOfMeasurementSelected,
      })
      .from(materialPurchaseReceiptItems)
      .innerJoin(
        materialPurchaseReceipts,
        eq(materialPurchaseReceiptItems.materialPurchaseReceiptId, materialPurchaseReceipts.id),
      )
      .where(eq(materialPurchaseReceiptItems.materialPurchaseOrderItemId, itemId));

    let linkedReceipt: {
      receiptCode: string;
      quantityReceived: number;
      quantityRejected: number;
      unitOfMeasurementSelected: MaterialUnit;
      inventoryTransactionCode: string | null;
    } | null = null;

    if (receiptRows.length === 1) {
      const row = receiptRows[0];
      const [ivt] = await this.db
        .select({ code: inventoryTransactions.code })
        .from(inventoryTransactions)
        .where(eq(inventoryTransactions.materialPurchaseReceiptId, row.receiptId))
        .limit(1);

      linkedReceipt = {
        receiptCode: row.receiptCode,
        quantityReceived: Number(row.quantityReceived),
        quantityRejected: Number(row.quantityRejected),
        unitOfMeasurementSelected: row.unitOfMeasurementSelected as MaterialUnit,
        inventoryTransactionCode: ivt?.code ?? null,
      };
    }

    return {
      orderCode: order.code,
      cancelled: !!order.cancelledAt,
      hasSupplierInvoice: !!invoice,
      receiptLineCount: receiptRows.length,
      linkedReceipt,
      item: {
        id: item.id,
        materialCode: item.materialCode,
        unitOfMeasurementSelected: item.unitOfMeasurementSelected as MaterialUnit,
        quantityOrdered: Number(item.quantityOrdered),
        unitPrice: Number(item.unitPrice),
        notes: item.notes,
      },
    };
  }

  public async updateItem(orderId: string, itemId: string, dto: UpdateMaterialPurchaseOrderItemDto) {
    await this.materialUnitValidationService.assertValidSelectedUnits([
      { materialCode: dto.materialCode, unitOfMeasurementSelected: dto.unitOfMeasurementSelected },
    ]);

    return await this.db.transaction(async (tx) => {
      const [order] = await tx
        .select()
        .from(materialPurchaseOrders)
        .where(eq(materialPurchaseOrders.id, orderId))
        .for('update');

      if (!order) {
        throw new NotFoundException(
          translate(
            `Material purchase order with ID ${orderId} does not exist.`,
            `لا يوجد أمر شراء مواد بالمعرف ${orderId}.`,
          ),
        );
      }

      if (order.cancelledAt) {
        throw new BadRequestException(
          translate('A cancelled purchase order cannot be updated.', 'لا يمكن تحديث أمر توريد ملغى.'),
        );
      }

      const [item] = await tx
        .select()
        .from(materialPurchaseOrderItems)
        .where(
          and(
            eq(materialPurchaseOrderItems.id, itemId),
            eq(materialPurchaseOrderItems.materialPurchaseOrderId, orderId),
          ),
        )
        .for('update');

      if (!item) {
        throw new NotFoundException(
          translate(
            `Purchase order item ${itemId} was not found on this order.`,
            `بند أمر التوريد ${itemId} غير موجود على هذا الأمر.`,
          ),
        );
      }

      const material = await tx.query.materials.findFirst({
        where: and(eq(materials.code, dto.materialCode), isNull(materials.deletedAt)),
        columns: { code: true, unitOfMeasurement: true },
        extras: materialUnitConversionsExtra,
      });

      if (!material) {
        throw new NotFoundException(
          translate(`Material ${dto.materialCode} does not exist.`, `المادة ${dto.materialCode} غير موجودة.`),
        );
      }

      if (dto.materialCode !== item.materialCode) {
        const [duplicate] = await tx
          .select({ id: materialPurchaseOrderItems.id })
          .from(materialPurchaseOrderItems)
          .where(
            and(
              eq(materialPurchaseOrderItems.materialPurchaseOrderId, orderId),
              eq(materialPurchaseOrderItems.materialCode, dto.materialCode),
            ),
          )
          .limit(1);

        if (duplicate) {
          throw new ConflictException(
            translate(
              'Duplicate materials are not allowed on the same purchase order.',
              'لا يُسمح بتكرار المواد في نفس أمر التوريد.',
            ),
          );
        }
      }

      const receiptItems = await tx
        .select({
          id: materialPurchaseReceiptItems.id,
          materialPurchaseReceiptId: materialPurchaseReceiptItems.materialPurchaseReceiptId,
          quantityReceived: materialPurchaseReceiptItems.quantityReceived,
          quantityRejected: materialPurchaseReceiptItems.quantityRejected,
          unitOfMeasurementSelected: materialPurchaseReceiptItems.unitOfMeasurementSelected,
        })
        .from(materialPurchaseReceiptItems)
        .where(eq(materialPurchaseReceiptItems.materialPurchaseOrderItemId, itemId))
        .for('update');

      if (receiptItems.length > 1) {
        throw new BadRequestException(
          translate(
            'This order line has more than one receipt and cannot be corrected this way.',
            'هذا البند له أكثر من سند استلام ولا يمكن تصحيحه بهذه الطريقة.',
          ),
        );
      }

      const receiptItem = receiptItems[0] ?? null;
      if (receiptItem && Number(receiptItem.quantityRejected) > QTY_EPSILON) {
        throw new BadRequestException(
          translate(
            'This order line has a rejected receipt quantity and cannot be corrected this way.',
            'هذا البند يحتوي على كمية مرفوضة في الاستلام ولا يمكن تصحيحه بهذه الطريقة.',
          ),
        );
      }

      let inventoryTransaction: { id: string; code: string } | null = null;
      let inventoryItem: { id: string; materialCode: string } | null = null;

      if (receiptItem) {
        const [ivt] = await tx
          .select({ id: inventoryTransactions.id, code: inventoryTransactions.code })
          .from(inventoryTransactions)
          .where(eq(inventoryTransactions.materialPurchaseReceiptId, receiptItem.materialPurchaseReceiptId))
          .for('update');

        if (ivt) {
          inventoryTransaction = ivt;
          const ivtItems = await tx
            .select({
              id: inventoryTransactionItems.id,
              materialCode: inventoryTransactionItems.materialCode,
            })
            .from(inventoryTransactionItems)
            .where(eq(inventoryTransactionItems.transactionId, ivt.id))
            .for('update');

          const matches = ivtItems.filter((row) => row.materialCode === item.materialCode);
          if (matches.length !== 1) {
            throw new BadRequestException(
              translate(
                `Inventory transaction ${ivt.code} does not have exactly one line for material ${item.materialCode}.`,
                `إذن الإضافة ${ivt.code} لا يحتوي على بند واحد بالضبط للمادة ${item.materialCode}.`,
              ),
            );
          }

          if (dto.materialCode !== item.materialCode) {
            const targetTaken = ivtItems.some((row) => row.materialCode === dto.materialCode);
            if (targetTaken) {
              throw new ConflictException(
                translate(
                  `Inventory transaction ${ivt.code} already has a line for material ${dto.materialCode}.`,
                  `إذن الإضافة ${ivt.code} يحتوي بالفعل على بند للمادة ${dto.materialCode}.`,
                ),
              );
            }
          }

          inventoryItem = matches[0];
        }
      }

      const allocations = await tx
        .select({
          id: materialPurchaseOrderItemRequisitionItems.id,
          materialPurchaseRequisitionItemId: materialPurchaseOrderItemRequisitionItems.materialPurchaseRequisitionItemId,
          quantityAllocated: materialPurchaseOrderItemRequisitionItems.quantityAllocated,
        })
        .from(materialPurchaseOrderItemRequisitionItems)
        .where(eq(materialPurchaseOrderItemRequisitionItems.materialPurchaseOrderItemId, itemId))
        .for('update');

      const conversions = (material.unitConversions ?? []) as UnitConversionRow[];
      const orderFactor = resolveConversionFactor(
        dto.unitOfMeasurementSelected,
        material.unitOfMeasurement as MaterialUnit,
        conversions,
      );
      const orderedBase = toBaseQuantity(Number(dto.quantityOrdered), orderFactor);

      if (allocations.length === 1) {
        const allocation = allocations[0];
        const [reqItem] = await tx
          .select({
            id: materialPurchaseRequisitionItems.id,
            materialCode: materialPurchaseRequisitionItems.materialCode,
            quantityRequested: materialPurchaseRequisitionItems.quantityRequested,
            unitOfMeasurementSelected: materialPurchaseRequisitionItems.unitOfMeasurementSelected,
          })
          .from(materialPurchaseRequisitionItems)
          .where(eq(materialPurchaseRequisitionItems.id, allocation.materialPurchaseRequisitionItemId))
          .for('update');

        if (!reqItem) {
          throw new NotFoundException(
            translate('Purchase requisition item not found.', 'بند طلب الشراء غير موجود.'),
          );
        }

        if (reqItem.materialCode !== dto.materialCode) {
          throw new BadRequestException(
            translate(
              `Requisition item material ${reqItem.materialCode} does not match order line material ${dto.materialCode}.`,
              `مادة بند طلب الشراء ${reqItem.materialCode} لا تطابق مادة بند أمر التوريد ${dto.materialCode}.`,
            ),
          );
        }

        const reqFactor = resolveConversionFactor(
          reqItem.unitOfMeasurementSelected as MaterialUnit,
          material.unitOfMeasurement as MaterialUnit,
          conversions,
        );
        const newAllocated = reqFactor === 0 ? orderedBase : orderedBase / reqFactor;

        const [{ totalAllocated }] = await tx
          .select({
            totalAllocated: sql<string>`coalesce(sum(${materialPurchaseOrderItemRequisitionItems.quantityAllocated}), 0)`,
          })
          .from(materialPurchaseOrderItemRequisitionItems)
          .where(
            and(
              eq(
                materialPurchaseOrderItemRequisitionItems.materialPurchaseRequisitionItemId,
                allocation.materialPurchaseRequisitionItemId,
              ),
              notInArray(materialPurchaseOrderItemRequisitionItems.id, [allocation.id]),
            ),
          );

        if (Number(totalAllocated) + newAllocated > Number(reqItem.quantityRequested) + QTY_EPSILON) {
          throw new BadRequestException(
            translate(
              `Allocated quantity for requisition item exceeds quantity requested (${reqItem.quantityRequested}).`,
              `الكمية الموزعة لبند طلب الشراء تتجاوز الكمية المطلوبة (${reqItem.quantityRequested}).`,
            ),
          );
        }

        if (Math.abs(Number(allocation.quantityAllocated) - newAllocated) > QTY_EPSILON) {
          await tx
            .update(materialPurchaseOrderItemRequisitionItems)
            .set({ quantityAllocated: newAllocated })
            .where(eq(materialPurchaseOrderItemRequisitionItems.id, allocation.id));
        }
      } else if (allocations.length > 1) {
        if (dto.materialCode !== item.materialCode) {
          throw new BadRequestException(
            translate(
              'This order line has multiple requisition allocations. Change the material only after reallocating on the normal edit path.',
              'هذا البند مرتبط بعدة توزيعات لطلبات شراء. غيّر المادة فقط بعد إعادة التوزيع من مسار التعديل العادي.',
            ),
          );
        }

        const reqItemIds = allocations.map((row) => row.materialPurchaseRequisitionItemId);
        const reqItems = await tx.query.materialPurchaseRequisitionItems.findMany({
          where: inArray(materialPurchaseRequisitionItems.id, reqItemIds),
          columns: {
            id: true,
            materialCode: true,
            unitOfMeasurementSelected: true,
          },
        });
        const reqById = new Map(reqItems.map((row) => [row.id, row]));

        let allocatedBase = 0;
        for (const allocation of allocations) {
          const reqItem = reqById.get(allocation.materialPurchaseRequisitionItemId);
          if (!reqItem) {
            throw new NotFoundException(
              translate('Purchase requisition item not found.', 'بند طلب الشراء غير موجود.'),
            );
          }
          if (reqItem.materialCode !== dto.materialCode) {
            throw new BadRequestException(
              translate(
                `Requisition item material ${reqItem.materialCode} does not match order line material ${dto.materialCode}.`,
                `مادة بند طلب الشراء ${reqItem.materialCode} لا تطابق مادة بند أمر التوريد ${dto.materialCode}.`,
              ),
            );
          }
          const reqFactor = resolveConversionFactor(
            reqItem.unitOfMeasurementSelected as MaterialUnit,
            material.unitOfMeasurement as MaterialUnit,
            conversions,
          );
          allocatedBase += toBaseQuantity(Number(allocation.quantityAllocated), reqFactor);
        }

        if (Math.abs(allocatedBase - orderedBase) > QTY_EPSILON) {
          throw new BadRequestException(
            translate(
              'This order line has multiple requisition allocations. Change the ordered quantity only after reallocating on the normal edit path.',
              'هذا البند مرتبط بعدة توزيعات لطلبات شراء. غيّر الكمية المطلوبة فقط بعد إعادة التوزيع من مسار التعديل العادي.',
            ),
          );
        }
      }

      const supplierQuotationItemId =
        dto.materialCode !== item.materialCode ? null : (item.supplierQuotationItemId ?? null);

      const [updatedItem] = await tx
        .update(materialPurchaseOrderItems)
        .set({
          materialCode: dto.materialCode,
          unitOfMeasurementSelected: dto.unitOfMeasurementSelected,
          quantityOrdered: dto.quantityOrdered,
          unitPrice: dto.unitPrice,
          notes: dto.notes,
          supplierQuotationItemId,
        })
        .where(eq(materialPurchaseOrderItems.id, itemId))
        .returning();

      if (receiptItem) {
        await tx
          .update(materialPurchaseReceiptItems)
          .set({
            unitOfMeasurementSelected: dto.unitOfMeasurementSelected,
            quantityReceived: dto.quantityOrdered,
          })
          .where(eq(materialPurchaseReceiptItems.id, receiptItem.id));
      }

      if (inventoryTransaction && inventoryItem) {
        await tx
          .update(inventoryTransactionItems)
          .set({
            materialCode: dto.materialCode,
            unitOfMeasurementSelected: dto.unitOfMeasurementSelected,
            quantity: dto.quantityOrdered,
            unitPrice: convertUnitPrice(
              Number(dto.unitPrice),
              dto.unitOfMeasurementSelected,
              dto.unitOfMeasurementSelected,
              material.unitOfMeasurement as MaterialUnit,
              conversions,
            ),
          })
          .where(eq(inventoryTransactionItems.id, inventoryItem.id));
      }

      const allOrderItems = await tx
        .select({
          id: materialPurchaseOrderItems.id,
          materialCode: materialPurchaseOrderItems.materialCode,
          quantityOrdered: materialPurchaseOrderItems.quantityOrdered,
          unitPrice: materialPurchaseOrderItems.unitPrice,
          unitOfMeasurementSelected: materialPurchaseOrderItems.unitOfMeasurementSelected,
        })
        .from(materialPurchaseOrderItems)
        .where(eq(materialPurchaseOrderItems.materialPurchaseOrderId, orderId));

      const totalAmount = allOrderItems.reduce(
        (sum, row) => sum + Number(row.quantityOrdered) * Number(row.unitPrice),
        0,
      );
      const grandTotal = totalAmount + totalAmount * VAT_RATE;

      const paymentTerms = await tx
        .select({
          valueKind: materialPurchaseOrderPaymentTerms.valueKind,
          value: materialPurchaseOrderPaymentTerms.value,
        })
        .from(materialPurchaseOrderPaymentTerms)
        .where(eq(materialPurchaseOrderPaymentTerms.materialPurchaseOrderId, orderId));

      // Seeded / legacy orders may have no payment rows; only recheck coverage when terms exist.
      if (paymentTerms.length > 0) {
        this.assertPaymentTermsCoverTotal(
          paymentTerms.map((term) => ({
            valueKind: term.valueKind,
            value: term.value == null ? null : Number(term.value),
          })),
          grandTotal,
        );
      }

      await this.recomputeOrderCompletedAtFull(tx, orderId, allOrderItems);

      const [savedOrder] = await tx
        .update(materialPurchaseOrders)
        .set({
          totalAmount,
          updatedAt: new Date(),
        })
        .where(eq(materialPurchaseOrders.id, orderId))
        .returning();

      return {
        ...savedOrder,
        item: updatedItem,
        linkedReceiptCode: receiptItem
          ? (
              await tx
                .select({ code: materialPurchaseReceipts.code })
                .from(materialPurchaseReceipts)
                .where(eq(materialPurchaseReceipts.id, receiptItem.materialPurchaseReceiptId))
                .limit(1)
            )[0]?.code ?? null
          : null,
        linkedInventoryTransactionCode: inventoryTransaction?.code ?? null,
      };
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
        paymentTerms: {
          orderBy: [asc(materialPurchaseOrderPaymentTerms.sequenceOrder)],
        },
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
    const quotationLinkByItemId = await this.getQuotationLinksByItemId(
      order.items.map((item) => item.supplierQuotationItemId).filter((id): id is string => !!id),
    );

    return {
      ...order,
      items: order.items.map((item) => {
        const progress = progressByItemId.get(item.id);
        return {
          ...item,
          quantityReceived: progress?.quantityReceived ?? 0,
          quantityRemaining: progress?.quantityRemaining ?? Number(item.quantityOrdered),
          requisitionAllocations: allocationsByOrderItemId.get(item.id) ?? [],
          supplierQuotation: item.supplierQuotationItemId
            ? (quotationLinkByItemId.get(item.supplierQuotationItemId) ?? null)
            : null,
        };
      }),
    };
  }

  // ============================== PRIVATE METHODS ==============================

  private resolveDeliveryPeriodDays(
    deliveryTiming: CreateMaterialPurchaseOrderDto['deliveryTiming'],
    deliveryPeriodDays: number | null | undefined,
  ) {
    if (deliveryTiming === MPO_DELIVERY_TIMINGS.WITHIN_DAYS) {
      if (deliveryPeriodDays == null || !Number.isInteger(deliveryPeriodDays) || deliveryPeriodDays <= 0) {
        throw new BadRequestException(
          translate(
            'Enter a positive number of days when delivery is within a period.',
            'أدخل عدداً موجباً من الأيام عندما يكون التوريد خلال مدة.',
          ),
        );
      }
      return deliveryPeriodDays;
    }

    if (deliveryPeriodDays != null) {
      throw new BadRequestException(
        translate(
          'A day count is only allowed when delivery is within a number of days.',
          'عدد الأيام يُقبل فقط عندما يكون التوريد خلال عدد من الأيام.',
        ),
      );
    }

    return null;
  }

  private normalizePaymentTerms(terms: CreateMaterialPurchaseOrderPaymentTermDto[]) {
    const seenDeferred = new Set<string>();
    let advanceCount = 0;
    let onReceiptCount = 0;
    let remainderCount = 0;

    return terms.map((term) => {
      if (term.event === MPO_PAYMENT_EVENTS.ADVANCE) advanceCount += 1;
      if (term.event === MPO_PAYMENT_EVENTS.ON_RECEIPT) onReceiptCount += 1;
      if (term.valueKind === MPO_PAYMENT_VALUE_KINDS.REMAINDER) remainderCount += 1;

      if (advanceCount > 1) {
        throw new BadRequestException(
          translate('An order can have only one advance payment.', 'لا يمكن أن يحتوي الأمر على أكثر من دفعة مقدمة.'),
        );
      }
      if (onReceiptCount > 1) {
        throw new BadRequestException(
          translate('An order can have only one on-receipt payment.', 'لا يمكن أن يحتوي الأمر على أكثر من دفعة عند الاستلام.'),
        );
      }
      if (remainderCount > 1) {
        throw new BadRequestException(
          translate('An order can have only one remainder payment.', 'لا يمكن أن يحتوي الأمر على أكثر من دفعة للباقي.'),
        );
      }

      const offsetDays = needsPaymentOffset(term.event) ? (term.offsetDays ?? null) : null;
      if (!needsPaymentOffset(term.event) && term.offsetDays != null) {
        throw new BadRequestException(
          translate(
            'Advance and on-receipt payments do not take a day count.',
            'الدفعة المقدمة ودفعة الاستلام لا تأخذان عدد أيام.',
          ),
        );
      }
      if (needsPaymentOffset(term.event)) {
        if (offsetDays == null || offsetDays <= 0) {
          throw new BadRequestException(
            translate(
              'Enter a positive number of days for a deferred payment.',
              'أدخل عدداً موجباً من الأيام للدفعة الآجلة.',
            ),
          );
        }
        const key = `${term.event}:${offsetDays}`;
        if (seenDeferred.has(key)) {
          throw new BadRequestException(
            translate(
              'Two payments cannot share the same event and day count.',
              'لا يمكن أن تشترك دفعتان في نفس الحدث وعدد الأيام.',
            ),
          );
        }
        seenDeferred.add(key);
      }

      if (term.valueKind === MPO_PAYMENT_VALUE_KINDS.REMAINDER) {
        if (term.value != null) {
          throw new BadRequestException(
            translate('A remainder payment does not take an amount.', 'دفعة الباقي لا تأخذ قيمة.'),
          );
        }
        return { ...term, offsetDays, value: null };
      }

      const value = Number(term.value);
      if (term.valueKind === MPO_PAYMENT_VALUE_KINDS.PERCENTAGE && value > 100) {
        throw new BadRequestException(
          translate(
            'A percentage payment must be greater than 0 and at most 100.',
            'دفعة النسبة يجب أن تكون أكبر من صفر ولا تتجاوز 100.',
          ),
        );
      }

      return { ...term, offsetDays, value };
    });
  }

  private assertPaymentTermsCoverTotal(
    terms: { valueKind: CreateMaterialPurchaseOrderPaymentTermDto['valueKind']; value: number | null }[],
    totalAmount: number,
  ) {
    const totalScaled = toScaledAmount(totalAmount);
    let covered = 0;
    let pricedCount = 0;
    let hasRemainder = false;

    for (const term of terms) {
      if (term.valueKind === MPO_PAYMENT_VALUE_KINDS.REMAINDER) {
        hasRemainder = true;
        continue;
      }
      pricedCount += 1;
      if (term.valueKind === MPO_PAYMENT_VALUE_KINDS.PERCENTAGE) {
        covered += (totalAmount * Number(term.value)) / 100;
      } else {
        covered += Number(term.value);
      }
    }

    const coveredScaled = toScaledAmount(covered);

    if (hasRemainder) {
      if (pricedCount === 0) {
        throw new BadRequestException(
          translate(
            'A payment schedule cannot be only a remainder. Add the other slices first.',
            'لا يمكن أن تكون شروط السداد باقياً فقط. أضف الدفعات الأخرى أولاً.',
          ),
        );
      }
      if (coveredScaled >= totalScaled) {
        throw new BadRequestException(
          translate(
            'The remainder must be a positive leftover. Fixed amounts and percentages already cover the grand total.',
            'يجب أن يكون الباقي مبلغاً متبقياً موجباً. المبالغ الثابتة والنسب تغطي الإجمالي الكلي بالفعل.',
          ),
        );
      }
      return;
    }

    if (coveredScaled !== totalScaled) {
      throw new BadRequestException(
        translate(
          'Payment terms must cover 100% of the grand total, including VAT.',
          'يجب أن تغطي شروط السداد 100٪ من الإجمالي الكلي شاملاً ضريبة القيمة المضافة.',
        ),
      );
    }
  }

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

  private async assertSupplierQuotationLinks(
    supplierId: string,
    items: { materialCode: string; supplierQuotationItemId?: string | null }[],
  ) {
    const linked = items.filter((item) => item.supplierQuotationItemId);
    if (linked.length === 0) return;

    const ids = [...new Set(linked.map((item) => item.supplierQuotationItemId!))];
    const rows = await this.db
      .select({
        id: supplierQuotationItems.id,
        materialCode: supplierQuotationItems.materialCode,
        supplierId: supplierQuotations.supplierId,
        cancelledAt: requestForQuotations.cancelledAt,
      })
      .from(supplierQuotationItems)
      .innerJoin(supplierQuotations, eq(supplierQuotationItems.supplierQuotationId, supplierQuotations.id))
      .innerJoin(requestForQuotations, eq(supplierQuotations.requestForQuotationId, requestForQuotations.id))
      .where(inArray(supplierQuotationItems.id, ids));

    const byId = new Map(rows.map((row) => [row.id, row]));
    for (const item of linked) {
      const row = byId.get(item.supplierQuotationItemId!);
      if (!row) {
        throw new NotFoundException(translate('Supplier quotation line not found.', 'بند عرض سعر المورد غير موجود.'));
      }
      if (row.materialCode !== item.materialCode) {
        throw new BadRequestException(
          translate(
            `Quotation line material ${row.materialCode} does not match order line material ${item.materialCode}.`,
            `مادة بند عرض السعر ${row.materialCode} لا تطابق مادة بند أمر التوريد ${item.materialCode}.`,
          ),
        );
      }
      if (row.supplierId !== supplierId) {
        throw new BadRequestException(
          translate(
            'The quotation supplier must match the purchase order supplier.',
            'يجب أن يطابق مورد عرض السعر مورد أمر التوريد.',
          ),
        );
      }
      if (row.cancelledAt) {
        throw new BadRequestException(
          translate(
            'A purchase order line cannot use a price from a cancelled request for quotation.',
            'لا يمكن استخدام سعر من طلب عرض سعر ملغى في بند أمر التوريد.',
          ),
        );
      }
    }
  }

  private async getQuotationLinksByItemId(ids: string[]) {
    const links = new Map<string, { requestForQuotationId: string; requestForQuotationCode: string }>();
    if (ids.length === 0) return links;

    const rows = await this.db
      .select({
        id: supplierQuotationItems.id,
        requestForQuotationId: requestForQuotations.id,
        requestForQuotationCode: requestForQuotations.code,
      })
      .from(supplierQuotationItems)
      .innerJoin(supplierQuotations, eq(supplierQuotationItems.supplierQuotationId, supplierQuotations.id))
      .innerJoin(requestForQuotations, eq(supplierQuotations.requestForQuotationId, requestForQuotations.id))
      .where(inArray(supplierQuotationItems.id, ids));

    for (const row of rows) {
      links.set(row.id, {
        requestForQuotationId: row.requestForQuotationId,
        requestForQuotationCode: row.requestForQuotationCode,
      });
    }
    return links;
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

  private assertOrderIsEditable(order: { cancelledAt: Date | null; completedAt: Date | null; createdAt: Date }) {
    if (order.cancelledAt) {
      throw new BadRequestException(
        translate('A cancelled purchase order cannot be updated.', 'لا يمكن تحديث أمر توريد ملغى.'),
      );
    }
    if (order.completedAt) {
      throw new BadRequestException(
        translate('A completed purchase order cannot be updated.', 'لا يمكن تحديث أمر توريد مكتمل.'),
      );
    }
    if (Date.now() > order.createdAt.getTime() + MATERIAL_PURCHASE_ORDER_UPDATE_WINDOW_MS) {
      throw new BadRequestException(
        translate(
          'This purchase order can only be updated within one day of creation.',
          'يمكن تحديث أمر التوريد خلال يوم واحد فقط من إنشائه.',
        ),
      );
    }
  }

  private async assertNoReceiptsOrInvoices(tx: Tx, orderId: string) {
    const [receipt] = await tx
      .select({ id: materialPurchaseReceipts.id })
      .from(materialPurchaseReceipts)
      .where(eq(materialPurchaseReceipts.materialPurchaseOrderId, orderId))
      .limit(1);

    if (receipt) {
      throw new BadRequestException(
        translate(
          'A purchase order that already has a receipt cannot be updated.',
          'لا يمكن تحديث أمر توريد له سند استلام.',
        ),
      );
    }

    const [invoice] = await tx
      .select({ id: supplierInvoices.id })
      .from(supplierInvoices)
      .where(eq(supplierInvoices.materialPurchaseOrderId, orderId))
      .limit(1);

    if (invoice) {
      throw new BadRequestException(
        translate(
          'A purchase order that already has a supplier invoice cannot be updated.',
          'لا يمكن تحديث أمر توريد له فاتورة مورد.',
        ),
      );
    }
  }

  private async diffRequisitionAllocations(
    tx: Tx,
    desired: {
      materialPurchaseOrderItemId: string;
      materialPurchaseRequisitionItemId: string;
      quantityAllocated: number;
    }[],
    existing: {
      id: string;
      materialPurchaseOrderItemId: string;
      materialPurchaseRequisitionItemId: string;
      quantityAllocated: string | number;
    }[],
    activeOrderItemIds: Set<string>,
  ) {
    const existingForActive = existing.filter((row) => activeOrderItemIds.has(row.materialPurchaseOrderItemId));
    const keyOf = (orderItemId: string, requisitionItemId: string) => `${orderItemId}:${requisitionItemId}`;
    const desiredByKey = new Map(
      desired.map((row) => [keyOf(row.materialPurchaseOrderItemId, row.materialPurchaseRequisitionItemId), row]),
    );
    const existingByKey = new Map(
      existingForActive.map((row) => [keyOf(row.materialPurchaseOrderItemId, row.materialPurchaseRequisitionItemId), row]),
    );

    const toInsert = desired.filter(
      (row) => !existingByKey.has(keyOf(row.materialPurchaseOrderItemId, row.materialPurchaseRequisitionItemId)),
    );
    if (toInsert.length > 0) {
      await tx.insert(materialPurchaseOrderItemRequisitionItems).values(
        toInsert.map((row) => ({
          materialPurchaseOrderItemId: row.materialPurchaseOrderItemId,
          materialPurchaseRequisitionItemId: row.materialPurchaseRequisitionItemId,
          quantityAllocated: row.quantityAllocated,
        })),
      );
    }

    for (const row of desired) {
      const current = existingByKey.get(keyOf(row.materialPurchaseOrderItemId, row.materialPurchaseRequisitionItemId));
      if (!current || Number(current.quantityAllocated) === row.quantityAllocated) continue;
      await tx
        .update(materialPurchaseOrderItemRequisitionItems)
        .set({ quantityAllocated: row.quantityAllocated })
        .where(eq(materialPurchaseOrderItemRequisitionItems.id, current.id));
    }

    const toDeleteIds = existingForActive
      .filter((row) => !desiredByKey.has(keyOf(row.materialPurchaseOrderItemId, row.materialPurchaseRequisitionItemId)))
      .map((row) => row.id);
    if (toDeleteIds.length > 0) {
      await tx
        .delete(materialPurchaseOrderItemRequisitionItems)
        .where(inArray(materialPurchaseOrderItemRequisitionItems.id, toDeleteIds));
    }
  }

  private async diffPaymentTerms(
    tx: Tx,
    orderId: string,
    terms: {
      event: CreateMaterialPurchaseOrderPaymentTermDto['event'];
      offsetDays: number | null;
      valueKind: CreateMaterialPurchaseOrderPaymentTermDto['valueKind'];
      value: number | null;
    }[],
  ) {
    const existing = await tx
      .select()
      .from(materialPurchaseOrderPaymentTerms)
      .where(eq(materialPurchaseOrderPaymentTerms.materialPurchaseOrderId, orderId));
    const existingBySequence = new Map(existing.map((term) => [term.sequenceOrder, term]));
    const saved: (typeof existing)[number][] = [];

    for (let index = 0; index < terms.length; index++) {
      const term = terms[index];
      const sequenceOrder = index + 1;
      const current = existingBySequence.get(sequenceOrder);
      if (!current) {
        const [inserted] = await tx
          .insert(materialPurchaseOrderPaymentTerms)
          .values({
            materialPurchaseOrderId: orderId,
            sequenceOrder,
            event: term.event,
            offsetDays: term.offsetDays,
            valueKind: term.valueKind,
            value: term.value,
          })
          .returning();
        saved.push(inserted);
        continue;
      }

      const changed =
        current.event !== term.event ||
        current.offsetDays !== term.offsetDays ||
        current.valueKind !== term.valueKind ||
        !sameNullableNumber(current.value, term.value);

      if (!changed) {
        saved.push(current);
        continue;
      }

      const [updated] = await tx
        .update(materialPurchaseOrderPaymentTerms)
        .set({
          event: term.event,
          offsetDays: term.offsetDays,
          valueKind: term.valueKind,
          value: term.value,
        })
        .where(eq(materialPurchaseOrderPaymentTerms.id, current.id))
        .returning();
      saved.push(updated);
    }

    const staleIds = existing.filter((term) => term.sequenceOrder > terms.length).map((term) => term.id);
    if (staleIds.length > 0) {
      await tx.delete(materialPurchaseOrderPaymentTerms).where(inArray(materialPurchaseOrderPaymentTerms.id, staleIds));
    }

    return saved;
  }

  private async insertRequisitionAllocations(
    tx: Tx,
    items: CreateMaterialPurchaseOrderItemDto[],
    insertedItems: { id: string; materialCode: string }[],
    options?: { excludeOrderItemIds?: string[]; persist?: boolean },
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
            isPreGoLive: true,
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

    const excludeOrderItemIds = options?.excludeOrderItemIds?.filter(Boolean) ?? [];
    const requisitionFilter = inArray(
      materialPurchaseOrderItemRequisitionItems.materialPurchaseRequisitionItemId,
      requisitionItemIds,
    );
    const existingAllocations = await tx
      .select({
        materialPurchaseRequisitionItemId: materialPurchaseOrderItemRequisitionItems.materialPurchaseRequisitionItemId,
        totalAllocated: sql<string>`coalesce(sum(${materialPurchaseOrderItemRequisitionItems.quantityAllocated}), 0)`,
      })
      .from(materialPurchaseOrderItemRequisitionItems)
      .where(
        excludeOrderItemIds.length > 0
          ? and(
              requisitionFilter,
              notInArray(materialPurchaseOrderItemRequisitionItems.materialPurchaseOrderItemId, excludeOrderItemIds),
            )
          : requisitionFilter,
      )
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

      if (requisition.isPreGoLive) {
        throw new BadRequestException(
          translate(
            `Requisition ${requisition.code} is from the pre-go-live period and cannot be linked to a purchase order.`,
            `طلب الشراء ${requisition.code} من فترة ما قبل التشغيل ولا يمكن ربطه بأمر توريد.`,
          ),
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

    if (options?.persist !== false) {
      await tx.insert(materialPurchaseOrderItemRequisitionItems).values(
        allocationRows.map((row) => ({
          materialPurchaseOrderItemId: row.materialPurchaseOrderItemId,
          materialPurchaseRequisitionItemId: row.materialPurchaseRequisitionItemId,
          quantityAllocated: row.quantityAllocated,
        })),
      );
    }

    return allocationRows;
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

  private async recomputeOrderCompletedAtFull(
    tx: Tx,
    orderId: string,
    orderItems: {
      id: string;
      quantityOrdered: string | number;
      unitOfMeasurementSelected: MaterialUnit;
      materialCode: string;
    }[],
  ) {
    if (orderItems.length === 0) {
      await tx
        .update(materialPurchaseOrders)
        .set({ completedAt: null })
        .where(eq(materialPurchaseOrders.id, orderId));
      return;
    }

    const materialCodes = [...new Set(orderItems.map((item) => item.materialCode))];
    const materialRows = await tx.query.materials.findMany({
      where: inArray(materials.code, materialCodes),
      columns: { code: true, unitOfMeasurement: true },
      extras: materialUnitConversionsExtra,
    });
    const materialByCode = new Map(materialRows.map((row) => [row.code, row]));

    const orderItemIds = orderItems.map((item) => item.id);
    const receiptRows = await tx
      .select({
        materialPurchaseOrderItemId: materialPurchaseReceiptItems.materialPurchaseOrderItemId,
        unitOfMeasurementSelected: materialPurchaseReceiptItems.unitOfMeasurementSelected,
        quantityReceived: materialPurchaseReceiptItems.quantityReceived,
        quantityRejected: materialPurchaseReceiptItems.quantityRejected,
      })
      .from(materialPurchaseReceiptItems)
      .where(inArray(materialPurchaseReceiptItems.materialPurchaseOrderItemId, orderItemIds));

    const coveredBaseById = new Map<string, number>();
    for (const id of orderItemIds) coveredBaseById.set(id, 0);

    for (const row of receiptRows) {
      const orderItem = orderItems.find((item) => item.id === row.materialPurchaseOrderItemId);
      if (!orderItem) continue;
      const material = materialByCode.get(orderItem.materialCode);
      if (!material) continue;

      const conversions = (material.unitConversions ?? []) as UnitConversionRow[];
      const factor = resolveConversionFactor(
        row.unitOfMeasurementSelected as MaterialUnit,
        material.unitOfMeasurement as MaterialUnit,
        conversions,
      );
      const covered =
        toBaseQuantity(Number(row.quantityReceived), factor) + toBaseQuantity(Number(row.quantityRejected), factor);
      coveredBaseById.set(row.materialPurchaseOrderItemId, (coveredBaseById.get(row.materialPurchaseOrderItemId) ?? 0) + covered);
    }

    const fullyReceived = orderItems.every((orderItem) => {
      const material = materialByCode.get(orderItem.materialCode);
      if (!material) return false;
      const conversions = (material.unitConversions ?? []) as UnitConversionRow[];
      const orderedBase = toBaseQuantity(
        Number(orderItem.quantityOrdered),
        resolveConversionFactor(
          orderItem.unitOfMeasurementSelected,
          material.unitOfMeasurement as MaterialUnit,
          conversions,
        ),
      );
      const coveredBase = coveredBaseById.get(orderItem.id) ?? 0;
      return coveredBase + QTY_EPSILON >= orderedBase;
    });

    await tx
      .update(materialPurchaseOrders)
      .set({ completedAt: fullyReceived ? new Date() : null })
      .where(eq(materialPurchaseOrders.id, orderId));
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
