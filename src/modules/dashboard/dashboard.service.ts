import { Inject, Injectable } from '@nestjs/common';
import { and, count, eq, isNotNull, isNull, or, sql, type SQL } from 'drizzle-orm';
import { DRIZZLE, type DrizzleDB } from 'src/database/database.constants';
import {
  customers,
  materialPurchaseOrders,
  materialPurchaseRequisitions,
  materials,
  products,
  supplierInvoices,
  suppliers,
} from 'src/database/schema';
import { APPROVAL_DECISIONS } from 'src/utils/constants';

function asNumber(value: unknown) {
  return Number(value ?? 0);
}

@Injectable()
export class DashboardService {
  constructor(@Inject(DRIZZLE) private db: DrizzleDB) {}

  async getQuickStats() {
    const [directory, catalog, procurement] = await Promise.all([
      this.getDirectory(),
      this.getCatalog(),
      this.getProcurement(),
    ]);

    return { directory, catalog, procurement };
  }

  private async getDirectory() {
    const [customerRow, supplierRow] = await Promise.all([
      this.countParty(customers),
      this.countParty(suppliers),
    ]);

    return {
      customers: customerRow,
      suppliers: supplierRow,
    };
  }

  private async countParty(table: typeof customers | typeof suppliers) {
    const [row] = await this.db
      .select({
        total: count(),
        blacklisted: sql<number>`count(*) filter (where ${table.blacklistedAt} is not null)`,
      })
      .from(table);

    return {
      total: asNumber(row?.total),
      blacklisted: asNumber(row?.blacklisted),
    };
  }

  private async getCatalog() {
    const activeMaterials = isNull(materials.deletedAt);
    const valueExpr = sql<number>`coalesce(${materials.quantity}, 0) * coalesce(${materials.unitPrice}, 0)`;

    const [materialRow, productRow] = await Promise.all([
      this.db
        .select({
          total: count(),
          inventoryValue: sql<number>`coalesce(sum(${valueExpr}), 0)`,
          outOfStock: sql<number>`count(*) filter (where coalesce(${materials.quantity}, 0) = 0)`,
          lowStock: sql<number>`count(*) filter (
            where ${materials.minimumStock} is not null
            and coalesce(${materials.quantity}, 0) > 0
            and coalesce(${materials.quantity}, 0) <= ${materials.minimumStock}
          )`,
        })
        .from(materials)
        .where(activeMaterials),
      this.db.select({ total: count() }).from(products).where(isNull(products.deletedAt)),
    ]);

    const materialsStats = materialRow[0];
    const productsStats = productRow[0];

    return {
      materials: {
        total: asNumber(materialsStats?.total),
        inventoryValue: asNumber(materialsStats?.inventoryValue),
        lowStock: asNumber(materialsStats?.lowStock),
        outOfStock: asNumber(materialsStats?.outOfStock),
      },
      products: {
        total: asNumber(productsStats?.total),
      },
    };
  }

  private async getProcurement() {
    const rejected = or(
      eq(materialPurchaseRequisitions.planningDecision, APPROVAL_DECISIONS.REJECTED),
      eq(materialPurchaseRequisitions.inventoryControlDecision, APPROVAL_DECISIONS.REJECTED),
      eq(materialPurchaseRequisitions.managerDecision, APPROVAL_DECISIONS.REJECTED),
    )!;
    const approved = and(
      eq(materialPurchaseRequisitions.planningDecision, APPROVAL_DECISIONS.APPROVED),
      eq(materialPurchaseRequisitions.inventoryControlDecision, APPROVAL_DECISIONS.APPROVED),
      eq(materialPurchaseRequisitions.managerDecision, APPROVAL_DECISIONS.APPROVED),
    )!;

    const [requisitionRow, orderRow, invoiceRow] = await Promise.all([
      this.db
        .select({
          total: count(),
          rejected: this.countWhere(rejected),
          approved: this.countWhere(approved),
        })
        .from(materialPurchaseRequisitions),
      this.db
        .select({
          open: this.countWhere(and(isNull(materialPurchaseOrders.cancelledAt), isNull(materialPurchaseOrders.completedAt))!),
          completed: this.countWhere(isNotNull(materialPurchaseOrders.completedAt)),
          cancelled: this.countWhere(isNotNull(materialPurchaseOrders.cancelledAt)),
        })
        .from(materialPurchaseOrders),
      this.db
        .select({
          count: count(),
          totalAmount: sql<number>`coalesce(sum(${supplierInvoices.totalAmount}), 0)`,
        })
        .from(supplierInvoices)
        .where(isNotNull(supplierInvoices.materialPurchaseOrderId)),
    ]);

    const requisitions = requisitionRow[0];
    const orders = orderRow[0];
    const invoices = invoiceRow[0];
    const rejectedCount = asNumber(requisitions?.rejected);
    const approvedCount = asNumber(requisitions?.approved);

    return {
      requisitions: {
        pending: asNumber(requisitions?.total) - rejectedCount - approvedCount,
        approved: approvedCount,
        rejected: rejectedCount,
      },
      purchaseOrders: {
        open: asNumber(orders?.open),
        completed: asNumber(orders?.completed),
        cancelled: asNumber(orders?.cancelled),
      },
      invoices: {
        count: asNumber(invoices?.count),
        totalAmount: asNumber(invoices?.totalAmount),
      },
    };
  }

  private countWhere(condition: SQL) {
    return sql<number>`count(*) filter (where ${condition})`;
  }
}
