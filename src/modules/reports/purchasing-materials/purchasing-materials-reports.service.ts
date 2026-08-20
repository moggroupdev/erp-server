import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, count, desc, eq, gte, isNull, lte, sql, type SQL } from 'drizzle-orm';
import { DRIZZLE, type DrizzleDB } from 'src/database/database.constants';
import { materialCategoryMains, materialCategorySubs, materialPurchaseOrderItems, materialPurchaseOrders } from 'src/database/schema';
import { materials } from 'src/database/schema';
import { suppliers } from 'src/database/schema';
import { translate } from 'src/utils/i18n/translate';

const VALID_GROUP_BY = ['month', 'quarter', 'year'] as const;
type GroupBy = (typeof VALID_GROUP_BY)[number];

const TOP_SUPPLIERS_LIMIT = 10;
const TOP_MATERIALS_LIMIT = 10;
const TOP_ORDERS_LIMIT = 10;

@Injectable()
export class PurchasingMaterialsReportsService {
  constructor(@Inject(DRIZZLE) private db: DrizzleDB) {}

  public async getSpendingSummary(params: { from?: string; to?: string; groupBy?: string }) {
    const groupBy = this.parseGroupBy(params.groupBy);
    const dateRange = this.buildDateRange(params.from, params.to);

    const [overview, byPeriod, bySupplier, byMaterial, byMainCategory, topOrders] = await Promise.all([
      this.getOverview(dateRange),
      this.getByPeriod(dateRange, groupBy),
      this.getBySupplier(dateRange, TOP_SUPPLIERS_LIMIT),
      this.getByMaterial(dateRange, TOP_MATERIALS_LIMIT),
      this.getByMainCategory(dateRange),
      this.getTopOrders(dateRange, TOP_ORDERS_LIMIT),
    ]);

    return { overview, byPeriod, bySupplier, byMaterial, byMainCategory, topOrders };
  }

  public async getPriceHistory(params: { materialCode: string; from?: string; to?: string }) {
    const [material] = await this.db
      .select({ code: materials.code, title: materials.title, unitOfMeasurement: materials.unitOfMeasurement })
      .from(materials)
      .where(eq(materials.code, params.materialCode))
      .limit(1);

    if (!material) {
      throw new NotFoundException(
        translate(
          `Material with code ${params.materialCode} does not exist.`,
          `لا توجد مادة بالرمز ${params.materialCode}.`,
        ),
      );
    }

    const dateRange = this.buildDateRange(params.from, params.to);
    const baseWhere = this.notCancelledWithDateRange(dateRange);

    const rows = await this.db
      .select({
        orderId: materialPurchaseOrders.id,
        orderCode: materialPurchaseOrders.code,
        orderDate: materialPurchaseOrders.createdAt,
        supplierId: suppliers.id,
        supplierName: suppliers.name,
        unitPrice: materialPurchaseOrderItems.unitPrice,
        quantityOrdered: materialPurchaseOrderItems.quantityOrdered,
      })
      .from(materialPurchaseOrderItems)
      .innerJoin(materialPurchaseOrders, eq(materialPurchaseOrderItems.materialPurchaseOrderId, materialPurchaseOrders.id))
      .innerJoin(suppliers, eq(materialPurchaseOrders.supplierId, suppliers.id))
      .where(and(baseWhere, eq(materialPurchaseOrderItems.materialCode, params.materialCode)))
      .orderBy(asc(materialPurchaseOrders.createdAt));

    const entries = rows.map((r) => ({
      orderId: r.orderId,
      orderCode: r.orderCode,
      orderDate: r.orderDate,
      supplierId: r.supplierId,
      supplierName: r.supplierName,
      unitPrice: Number(r.unitPrice),
      quantityOrdered: Number(r.quantityOrdered),
    }));

    const prices = entries.map((e) => e.unitPrice);
    const minPrice = prices.length > 0 ? Math.min(...prices) : 0;
    const maxPrice = prices.length > 0 ? Math.max(...prices) : 0;
    const avgPrice = prices.length > 0 ? prices.reduce((s, p) => s + p, 0) / prices.length : 0;
    const changePercentage =
      prices.length >= 2 && prices[0] !== 0 ? ((prices[prices.length - 1] - prices[0]) / prices[0]) * 100 : 0;

    return {
      material,
      entries,
      summary: { minPrice, maxPrice, avgPrice, changePercentage },
    };
  }

  // ============================== PRIVATE METHODS ==============================

  private parseGroupBy(value?: string): GroupBy {
    if (value && (VALID_GROUP_BY as readonly string[]).includes(value)) return value as GroupBy;
    return 'month';
  }

  private buildDateRange(from?: string, to?: string): { from?: Date; to?: Date } {
    return {
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
    };
  }

  private notCancelledWithDateRange(dateRange: { from?: Date; to?: Date }): SQL {
    const conditions: SQL[] = [isNull(materialPurchaseOrders.cancelledAt)];
    if (dateRange.from) conditions.push(gte(materialPurchaseOrders.createdAt, dateRange.from));
    if (dateRange.to) conditions.push(lte(materialPurchaseOrders.createdAt, dateRange.to));
    return and(...conditions)!;
  }

  private allOrdersWithDateRange(dateRange: { from?: Date; to?: Date }): SQL | undefined {
    const conditions: SQL[] = [];
    if (dateRange.from) conditions.push(gte(materialPurchaseOrders.createdAt, dateRange.from));
    if (dateRange.to) conditions.push(lte(materialPurchaseOrders.createdAt, dateRange.to));
    return conditions.length > 0 ? and(...conditions) : undefined;
  }

  private async getOverview(dateRange: { from?: Date; to?: Date }) {
    const allWhere = this.allOrdersWithDateRange(dateRange);

    const [row] = await this.db
      .select({
        totalSpend: sql<number>`coalesce(sum(case when ${materialPurchaseOrders.cancelledAt} is null then ${materialPurchaseOrders.totalAmount} else 0 end), 0)`,
        totalOrders: sql<number>`count(*) filter (where ${materialPurchaseOrders.cancelledAt} is null)`,
        completedCount: sql<number>`count(*) filter (where ${materialPurchaseOrders.completedAt} is not null and ${materialPurchaseOrders.cancelledAt} is null)`,
        completedAmount: sql<number>`coalesce(sum(case when ${materialPurchaseOrders.completedAt} is not null and ${materialPurchaseOrders.cancelledAt} is null then ${materialPurchaseOrders.totalAmount} else 0 end), 0)`,
        openCount: sql<number>`count(*) filter (where ${materialPurchaseOrders.completedAt} is null and ${materialPurchaseOrders.cancelledAt} is null)`,
        openAmount: sql<number>`coalesce(sum(case when ${materialPurchaseOrders.completedAt} is null and ${materialPurchaseOrders.cancelledAt} is null then ${materialPurchaseOrders.totalAmount} else 0 end), 0)`,
        cancelledCount: sql<number>`count(*) filter (where ${materialPurchaseOrders.cancelledAt} is not null)`,
        cancelledAmount: sql<number>`coalesce(sum(case when ${materialPurchaseOrders.cancelledAt} is not null then ${materialPurchaseOrders.totalAmount} else 0 end), 0)`,
      })
      .from(materialPurchaseOrders)
      .where(allWhere);

    const totalSpend = Number(row?.totalSpend ?? 0);
    const totalOrders = Number(row?.totalOrders ?? 0);

    return {
      totalSpend,
      totalOrders,
      avgOrderValue: totalOrders > 0 ? totalSpend / totalOrders : 0,
      completedCount: Number(row?.completedCount ?? 0),
      completedAmount: Number(row?.completedAmount ?? 0),
      openCount: Number(row?.openCount ?? 0),
      openAmount: Number(row?.openAmount ?? 0),
      cancelledCount: Number(row?.cancelledCount ?? 0),
      cancelledAmount: Number(row?.cancelledAmount ?? 0),
    };
  }

  private async getByPeriod(dateRange: { from?: Date; to?: Date }, groupBy: GroupBy) {
    const where = this.notCancelledWithDateRange(dateRange);
    const bucket = sql<string>`date_trunc('${sql.raw(groupBy)}', ${materialPurchaseOrders.createdAt})`;

    const rows = await this.db
      .select({
        period: bucket.as('period'),
        totalSpend: sql<number>`coalesce(sum(${materialPurchaseOrders.totalAmount}), 0)`,
        orderCount: count(),
      })
      .from(materialPurchaseOrders)
      .where(where)
      .groupBy(sql`period`)
      .orderBy(sql`period`);

    return rows.map((r) => ({
      period: r.period,
      totalSpend: Number(r.totalSpend),
      orderCount: Number(r.orderCount),
      avgOrderValue: Number(r.orderCount) > 0 ? Number(r.totalSpend) / Number(r.orderCount) : 0,
    }));
  }

  private async getBySupplier(dateRange: { from?: Date; to?: Date }, limit: number) {
    const where = this.notCancelledWithDateRange(dateRange);

    const rows = await this.db
      .select({
        supplierId: suppliers.id,
        supplierCode: suppliers.code,
        supplierName: suppliers.name,
        totalSpend: sql<number>`coalesce(sum(${materialPurchaseOrders.totalAmount}), 0)`,
        orderCount: count(),
      })
      .from(materialPurchaseOrders)
      .innerJoin(suppliers, eq(materialPurchaseOrders.supplierId, suppliers.id))
      .where(where)
      .groupBy(suppliers.id, suppliers.code, suppliers.name)
      .orderBy(desc(sql`coalesce(sum(${materialPurchaseOrders.totalAmount}), 0)`))
      .limit(limit);

    return rows.map((r) => ({
      supplierId: r.supplierId,
      supplierCode: r.supplierCode,
      supplierName: r.supplierName,
      totalSpend: Number(r.totalSpend),
      orderCount: Number(r.orderCount),
      avgOrderValue: Number(r.orderCount) > 0 ? Number(r.totalSpend) / Number(r.orderCount) : 0,
    }));
  }

  private async getByMaterial(dateRange: { from?: Date; to?: Date }, limit: number) {
    const where = this.notCancelledWithDateRange(dateRange);

    const rows = await this.db
      .select({
        materialCode: materialPurchaseOrderItems.materialCode,
        materialTitle: materials.title,
        unitOfMeasurement: materials.unitOfMeasurement,
        totalSpend: sql<number>`coalesce(sum(${materialPurchaseOrderItems.quantityOrdered} * ${materialPurchaseOrderItems.unitPrice}), 0)`,
        totalQuantity: sql<number>`coalesce(sum(${materialPurchaseOrderItems.quantityOrdered}), 0)`,
      })
      .from(materialPurchaseOrderItems)
      .innerJoin(materialPurchaseOrders, eq(materialPurchaseOrderItems.materialPurchaseOrderId, materialPurchaseOrders.id))
      .innerJoin(materials, eq(materialPurchaseOrderItems.materialCode, materials.code))
      .where(where)
      .groupBy(materialPurchaseOrderItems.materialCode, materials.title, materials.unitOfMeasurement)
      .orderBy(desc(sql`coalesce(sum(${materialPurchaseOrderItems.quantityOrdered} * ${materialPurchaseOrderItems.unitPrice}), 0)`))
      .limit(limit);

    return rows.map((r) => ({
      materialCode: r.materialCode,
      materialTitle: r.materialTitle,
      unitOfMeasurement: r.unitOfMeasurement,
      totalSpend: Number(r.totalSpend),
      totalQuantity: Number(r.totalQuantity),
      avgUnitPrice: Number(r.totalQuantity) > 0 ? Number(r.totalSpend) / Number(r.totalQuantity) : 0,
    }));
  }

  private async getByMainCategory(dateRange: { from?: Date; to?: Date }) {
    const where = this.notCancelledWithDateRange(dateRange);

    const rows = await this.db
      .select({
        mainCategoryId: materialCategoryMains.id,
        mainCategoryTitle: materialCategoryMains.title,
        materialCount: sql<number>`count(distinct ${materialPurchaseOrderItems.materialCode})`,
        totalQuantity: sql<number>`coalesce(sum(${materialPurchaseOrderItems.quantityOrdered}), 0)`,
        totalSpend: sql<number>`coalesce(sum(${materialPurchaseOrderItems.quantityOrdered} * ${materialPurchaseOrderItems.unitPrice}), 0)`,
      })
      .from(materialPurchaseOrderItems)
      .innerJoin(materialPurchaseOrders, eq(materialPurchaseOrderItems.materialPurchaseOrderId, materialPurchaseOrders.id))
      .innerJoin(materials, eq(materialPurchaseOrderItems.materialCode, materials.code))
      .innerJoin(materialCategorySubs, eq(materials.subCategoryId, materialCategorySubs.id))
      .innerJoin(materialCategoryMains, eq(materialCategorySubs.mainCategoryId, materialCategoryMains.id))
      .where(where)
      .groupBy(materialCategoryMains.id, materialCategoryMains.title)
      .orderBy(desc(sql`coalesce(sum(${materialPurchaseOrderItems.quantityOrdered} * ${materialPurchaseOrderItems.unitPrice}), 0)`));

    return rows.map((r) => ({
      mainCategoryId: r.mainCategoryId,
      mainCategoryTitle: r.mainCategoryTitle,
      materialCount: Number(r.materialCount),
      totalQuantity: Number(r.totalQuantity),
      totalSpend: Number(r.totalSpend),
    }));
  }

  private async getTopOrders(dateRange: { from?: Date; to?: Date }, limit: number) {
    const where = this.notCancelledWithDateRange(dateRange);

    const rows = await this.db
      .select({
        orderId: materialPurchaseOrders.id,
        orderCode: materialPurchaseOrders.code,
        legacyInvoiceNumber: materialPurchaseOrders.legacyInvoiceNumber,
        supplierId: suppliers.id,
        supplierName: suppliers.name,
        totalAmount: materialPurchaseOrders.totalAmount,
        createdAt: materialPurchaseOrders.createdAt,
        completedAt: materialPurchaseOrders.completedAt,
      })
      .from(materialPurchaseOrders)
      .innerJoin(suppliers, eq(materialPurchaseOrders.supplierId, suppliers.id))
      .where(where)
      .orderBy(desc(materialPurchaseOrders.totalAmount))
      .limit(limit);

    return rows.map((r) => ({
      orderId: r.orderId,
      orderCode: r.orderCode,
      legacyInvoiceNumber: r.legacyInvoiceNumber,
      supplierId: r.supplierId,
      supplierName: r.supplierName,
      totalAmount: Number(r.totalAmount),
      createdAt: r.createdAt,
      completedAt: r.completedAt,
    }));
  }
}
