import { eq, sql } from 'drizzle-orm';
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DRIZZLE, type DrizzleDB } from 'src/database/database.constants';
import {
  contractItems,
  inventoryTransactionItems,
  inventoryTransactions,
  materialPurchaseReceipts,
} from 'src/database/schema';
import { INVENTORY_TRANSACTION_TYPES } from 'src/utils/constants';
import { QueryParams, type MaterialUnit, type User } from 'src/utils/types';
import { translate } from 'src/utils/i18n/translate';
import { materialUnitConversionsExtra } from 'src/utils/extras/material-unit-conversions-extra';
import { convertUnitPrice } from 'src/utils/helpers/unit-conversion';
import { QueryBuilderService } from 'src/utils/services/query-builder.service';
import { CreateInventoryTransactionFromMaterialPurchaseReceiptDto } from './dto/create-inventory-transaction-from-material-purchase-receipt.dto';

/**
 * Source relations for get(). Nested `with` depth is capped at 2 levels because
 * Drizzle aliases the full path (e.g. inventoryTransactions_productionPlanItem_…)
 * and Postgres silently truncates identifiers past 63 chars, breaking deeper joins.
 * Contract for a production-plan source is loaded separately in getContractForUnit().
 *
 * Perf note: only one of these 5 source FKs is ever non-null (inv_tx_source_non_conflicting
 * check), but all 5 are still always joined here rather than checking which FK is set first.
 * A LEFT JOIN on a NULL FK is free (Postgres short-circuits, no index probe needed), whereas
 * "check first, then join" would add a second DB round-trip in the 4/5 cases that don't need it.
 * All join columns here are indexed (see inv_tx_*_idx), so the one real join is also cheap.
 */
const TRANSACTION_SOURCE_RELATIONS = {
  materialPurchaseReceipt: {
    columns: { id: true, code: true },
    with: { materialPurchaseOrder: { columns: { id: true, code: true } } },
  },
  outsourcingReceipt: {
    columns: { id: true, code: true },
    with: { outsourcingOrder: { columns: { id: true, code: true } } },
  },
  productionPlanItem: {
    columns: { id: true, productionStage: true },
    with: { productUnit: { columns: { id: true, serialNumber: true, contractItemId: true } } },
  },
  outsourcingOrder: { columns: { id: true, code: true } },
  maintenanceOrder: { columns: { id: true, code: true } },
} as const;

type UnitConversion = { unit: MaterialUnit; conversionFactorToBase: number };

@Injectable()
export class InventoryTransactionsService {
  constructor(
    @Inject(DRIZZLE) private db: DrizzleDB,
    private queryBuilderService: QueryBuilderService,
  ) {}

  public async list(queryParams: QueryParams) {
    return await this.queryBuilderService.execute(inventoryTransactions, queryParams, {
      filtering: true,
      searchableFields: ['code', 'legacyNumber', 'notes'],
      fieldLimiting: true,
      sorting: true,
      pagination: true,
    });
  }

  public async get(id: string) {
    const transaction = await this.db.query.inventoryTransactions.findFirst({
      where: eq(inventoryTransactions.id, id),
      with: {
        ...TRANSACTION_SOURCE_RELATIONS,
        createdBy: { columns: { id: true, name: true } },
        items: {
          with: {
            material: {
              columns: {
                code: true,
                title: true,
                materialType: true,
                unitOfMeasurement: true,
                subCategoryId: true,
                unitPrice: true,
              },
              extras: materialUnitConversionsExtra,
            },
          },
        },
      },
    });

    if (!transaction)
      throw new NotFoundException(
        translate(`Inventory transaction with ID ${id} does not exist.`, `لا توجد حركة مخزون بالمعرف ${id}.`),
      );

    const planItem = transaction.productionPlanItem;

    if (!planItem) return transaction;

    const contractItem = await this.getContractForUnit(planItem.productUnit.contractItemId);

    return { ...transaction, productionPlanItem: { ...planItem, productUnit: { ...planItem.productUnit, contractItem } } };
  }

  public async createFromMaterialPurchaseReceipt(
    receiptId: string,
    dto: CreateInventoryTransactionFromMaterialPurchaseReceiptDto,
    user: User,
  ) {
    const receipt = await this.db.query.materialPurchaseReceipts.findFirst({
      where: eq(materialPurchaseReceipts.id, receiptId),
      with: {
        inventoryTransactions: { columns: { id: true } },
        items: {
          with: {
            materialPurchaseOrderItem: {
              columns: {
                id: true,
                materialCode: true,
                unitOfMeasurementSelected: true,
                unitPrice: true,
              },
              with: {
                material: {
                  columns: { code: true, unitOfMeasurement: true },
                  extras: materialUnitConversionsExtra,
                },
              },
            },
          },
        },
      },
    });

    if (!receipt)
      throw new NotFoundException(
        translate(`Material purchase receipt with ID ${receiptId} does not exist.`, `لا يوجد إذن استلام مواد بالمعرف ${receiptId}.`),
      );

    if (receipt.inventoryTransactions.length > 0) {
      throw new BadRequestException(
        translate(
          'An inventory transaction already exists for this receipt.',
          'يوجد إذن مخزون بالفعل لهذا السند.',
        ),
      );
    }

    const acceptedItems = receipt.items.filter((item) => Number(item.quantityReceived) > 0);

    if (acceptedItems.length === 0) {
      throw new BadRequestException(
        translate(
          'Cannot create an inventory receipt when all accepted quantities are zero.',
          'لا يمكن إنشاء إذن إضافة عندما تكون كل الكميات المقبولة صفراً.',
        ),
      );
    }

    return await this.db.transaction(async (tx) => {
      const [transaction] = await tx
        .insert(inventoryTransactions)
        .values({
          code: sql`DEFAULT`,
          legacyNumber: dto.legacyNumber,
          transactionType: INVENTORY_TRANSACTION_TYPES.RECEIPT,
          materialPurchaseReceiptId: receipt.id,
          notes: receipt.notes,
          createdBy: user.id,
        })
        .returning({ id: inventoryTransactions.id, code: inventoryTransactions.code });

      await tx.insert(inventoryTransactionItems).values(
        acceptedItems.map((item) => {
          const orderItem = item.materialPurchaseOrderItem;
          const conversions = (orderItem.material.unitConversions ?? []) as UnitConversion[];

          return {
            transactionId: transaction.id,
            materialCode: orderItem.materialCode,
            unitOfMeasurementSelected: item.unitOfMeasurementSelected,
            quantity: Number(item.quantityReceived),
            unitPrice: convertUnitPrice(
              Number(orderItem.unitPrice),
              orderItem.unitOfMeasurementSelected,
              item.unitOfMeasurementSelected,
              orderItem.material.unitOfMeasurement,
              conversions,
            ),
          };
        }),
      );

      return transaction;
    });
  }

  // ========================= PRIVATE METHODS =========================

  private async getContractForUnit(contractItemId: string) {
    return (
      (await this.db.query.contractItems.findFirst({
        where: eq(contractItems.id, contractItemId),
        columns: { id: true },
        with: {
          contract: {
            columns: { id: true, code: true },
            with: { customer: { columns: { id: true, name: true } } },
          },
        },
      })) || null
    );
  }
}
