import { Inject, Injectable } from '@nestjs/common';
import { and, count, desc, eq, isNotNull, isNull, or, sql, type SQL, type AnyColumn } from 'drizzle-orm';
import { DRIZZLE, type DrizzleDB } from 'src/database/database.constants';
import {
  customers,
  legacyIssuePermits,
  materialPurchaseOrders,
  materialPurchaseRequisitions,
  materials,
  products,
  suppliers,
} from 'src/database/schema';
import { APPROVAL_DECISIONS } from 'src/utils/constants';

const DAY_MS = 24 * 60 * 60 * 1000;

function asNumber(value: unknown) {
  return Number(value ?? 0);
}

type PeriodKey = 'week' | 'month' | 'overall';

type PeriodCounts = Record<PeriodKey, number>;

@Injectable()
export class DashboardService {
  constructor(@Inject(DRIZZLE) private db: DrizzleDB) {}

  async getQuickStats() {
    const now = new Date();
    const weekStart = new Date(now.getTime() - 7 * DAY_MS);
    const monthStart = new Date(now.getTime() - 30 * DAY_MS);

    const [
      customersCreated,
      suppliersCreated,
      materialsCreated,
      productsCreated,
      requisitions,
      purchaseOrders,
      stock,
      recentLegacyIssuePermits,
    ] = await Promise.all([
      this.countCustomers(weekStart, monthStart),
      this.countSuppliers(weekStart, monthStart),
      this.countMaterials(weekStart, monthStart),
      this.countProducts(weekStart, monthStart),
      this.getRequisitions(weekStart, monthStart),
      this.getPurchaseOrders(weekStart, monthStart),
      this.getStock(),
      this.getRecentLegacyIssuePermits(),
    ]);

    const periods = (['week', 'month', 'overall'] as const).reduce(
      (acc, period) => {
        acc[period] = {
          customersCreated: customersCreated[period],
          suppliersCreated: suppliersCreated[period],
          materialsCreated: materialsCreated[period],
          productsCreated: productsCreated[period],
          requisitions: {
            pending: requisitions.pending[period],
            approved: requisitions.approved[period],
            rejected: requisitions.rejected[period],
          },
          purchaseOrders: {
            open: purchaseOrders.open[period],
            completed: purchaseOrders.completed[period],
            cancelled: purchaseOrders.cancelled[period],
          },
        };
        return acc;
      },
      {} as Record<PeriodKey, object>,
    );

    return { periods, stock, recentLegacyIssuePermits };
  }

  private periodCountFields(column: AnyColumn, weekStart: Date, monthStart: Date) {
    return {
      week: this.countSince(column, weekStart),
      month: this.countSince(column, monthStart),
      overall: count(),
    };
  }

  private toPeriodCounts(row: { week: unknown; month: unknown; overall: unknown } | undefined): PeriodCounts {
    return {
      week: asNumber(row?.week),
      month: asNumber(row?.month),
      overall: asNumber(row?.overall),
    };
  }

  private async countCustomers(weekStart: Date, monthStart: Date) {
    const [row] = await this.db.select(this.periodCountFields(customers.createdAt, weekStart, monthStart)).from(customers);
    return this.toPeriodCounts(row);
  }

  private async countSuppliers(weekStart: Date, monthStart: Date) {
    const [row] = await this.db.select(this.periodCountFields(suppliers.createdAt, weekStart, monthStart)).from(suppliers);
    return this.toPeriodCounts(row);
  }

  private async countMaterials(weekStart: Date, monthStart: Date) {
    const [row] = await this.db
      .select(this.periodCountFields(materials.createdAt, weekStart, monthStart))
      .from(materials)
      .where(isNull(materials.deletedAt));
    return this.toPeriodCounts(row);
  }

  private async countProducts(weekStart: Date, monthStart: Date) {
    const [row] = await this.db
      .select(this.periodCountFields(products.createdAt, weekStart, monthStart))
      .from(products)
      .where(isNull(products.deletedAt));
    return this.toPeriodCounts(row);
  }

  private async getRequisitions(weekStart: Date, monthStart: Date) {
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

    const [row] = await this.db
      .select({
        weekTotal: this.countSince(materialPurchaseRequisitions.createdAt, weekStart),
        monthTotal: this.countSince(materialPurchaseRequisitions.createdAt, monthStart),
        overallTotal: count(),
        weekRejected: this.countSince(materialPurchaseRequisitions.createdAt, weekStart, rejected),
        monthRejected: this.countSince(materialPurchaseRequisitions.createdAt, monthStart, rejected),
        overallRejected: this.countWhere(rejected),
        weekApproved: this.countSince(materialPurchaseRequisitions.createdAt, weekStart, approved),
        monthApproved: this.countSince(materialPurchaseRequisitions.createdAt, monthStart, approved),
        overallApproved: this.countWhere(approved),
      })
      .from(materialPurchaseRequisitions);

    return {
      pending: this.pendingCounts(row, 'Total', 'Rejected', 'Approved'),
      approved: this.pickPeriod(row, 'Approved'),
      rejected: this.pickPeriod(row, 'Rejected'),
    };
  }

  private async getPurchaseOrders(weekStart: Date, monthStart: Date) {
    const open = and(isNull(materialPurchaseOrders.cancelledAt), isNull(materialPurchaseOrders.completedAt))!;
    const completed = isNotNull(materialPurchaseOrders.completedAt);
    const cancelled = isNotNull(materialPurchaseOrders.cancelledAt);

    const [row] = await this.db
      .select({
        weekOpen: this.countSince(materialPurchaseOrders.createdAt, weekStart, open),
        monthOpen: this.countSince(materialPurchaseOrders.createdAt, monthStart, open),
        overallOpen: this.countWhere(open),
        weekCompleted: this.countSince(materialPurchaseOrders.createdAt, weekStart, completed),
        monthCompleted: this.countSince(materialPurchaseOrders.createdAt, monthStart, completed),
        overallCompleted: this.countWhere(completed),
        weekCancelled: this.countSince(materialPurchaseOrders.createdAt, weekStart, cancelled),
        monthCancelled: this.countSince(materialPurchaseOrders.createdAt, monthStart, cancelled),
        overallCancelled: this.countWhere(cancelled),
      })
      .from(materialPurchaseOrders);

    return {
      open: this.pickPeriod(row, 'Open'),
      completed: this.pickPeriod(row, 'Completed'),
      cancelled: this.pickPeriod(row, 'Cancelled'),
    };
  }

  private async getStock() {
    const valueExpr = sql<number>`coalesce(${materials.quantity}, 0) * coalesce(${materials.unitPrice}, 0)`;
    const [row] = await this.db
      .select({
        inventoryValue: sql<number>`coalesce(sum(${valueExpr}), 0)`,
        outOfStock: sql<number>`count(*) filter (where coalesce(${materials.quantity}, 0) = 0)`,
        lowStock: sql<number>`count(*) filter (
          where coalesce(${materials.quantity}, 0) > 0
          and ${materials.minimumStock} is not null
          and coalesce(${materials.quantity}, 0) <= ${materials.minimumStock}
        )`,
        inStock: sql<number>`count(*) filter (
          where coalesce(${materials.quantity}, 0) > 0
          and (
            ${materials.minimumStock} is null
            or coalesce(${materials.quantity}, 0) > ${materials.minimumStock}
          )
        )`,
      })
      .from(materials)
      .where(isNull(materials.deletedAt));

    return {
      inventoryValue: asNumber(row?.inventoryValue),
      outOfStock: asNumber(row?.outOfStock),
      lowStock: asNumber(row?.lowStock),
      inStock: asNumber(row?.inStock),
    };
  }

  private async getRecentLegacyIssuePermits() {
    const rows = await this.db
      .select({
        id: legacyIssuePermits.id,
        issuePermitNumber: legacyIssuePermits.issuePermitNumber,
        date: legacyIssuePermits.date,
        productionSubDepartment: legacyIssuePermits.productionSubDepartment,
        isCancelled: legacyIssuePermits.isCancelled,
        contractNumber: legacyIssuePermits.contractNumber,
      })
      .from(legacyIssuePermits)
      .orderBy(desc(legacyIssuePermits.date))
      .limit(5);

    return rows.map((row) => ({
      id: row.id,
      issuePermitNumber: row.issuePermitNumber,
      date: row.date instanceof Date ? row.date.toISOString() : String(row.date),
      productionSubDepartment: row.productionSubDepartment,
      isCancelled: row.isCancelled,
      contractNumber: row.contractNumber,
    }));
  }

  private countSince(column: AnyColumn, since: Date, extra?: SQL) {
    if (extra) return sql<number>`count(*) filter (where ${column} >= ${since} and (${extra}))`;
    return sql<number>`count(*) filter (where ${column} >= ${since})`;
  }

  private countWhere(condition: SQL) {
    return sql<number>`count(*) filter (where ${condition})`;
  }

  private pickPeriod(row: Record<string, unknown> | undefined, suffix: string): PeriodCounts {
    return {
      week: asNumber(row?.[`week${suffix}`]),
      month: asNumber(row?.[`month${suffix}`]),
      overall: asNumber(row?.[`overall${suffix}`]),
    };
  }

  private pendingCounts(
    row: Record<string, unknown> | undefined,
    totalSuffix: string,
    rejectedSuffix: string,
    approvedSuffix: string,
  ): PeriodCounts {
    const total = this.pickPeriod(row, totalSuffix);
    const rejected = this.pickPeriod(row, rejectedSuffix);
    const approved = this.pickPeriod(row, approvedSuffix);

    return {
      week: total.week - rejected.week - approved.week,
      month: total.month - rejected.month - approved.month,
      overall: total.overall - rejected.overall - approved.overall,
    };
  }
}
