import { eq } from 'drizzle-orm';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DRIZZLE, type DrizzleDB } from 'src/database/database.constants';
import { contractItems, inventoryTransactions } from 'src/database/schema';
import { QueryParams } from 'src/utils/types';
import { translate } from 'src/utils/i18n/translate';
import { QueryBuilderService } from 'src/utils/services/query-builder.service';

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
    with: { materialPurchaseOrder: { columns: { id: true, legacyInvoiceNumber: true } } },
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
              with: {
                unitConversions: { columns: { id: true, unit: true, conversionFactorToBase: true } },
              },
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
