import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, count, desc, eq, gte, inArray, isNotNull, isNull, lte, sql, type SQL } from 'drizzle-orm';
import { DRIZZLE, type DrizzleDB } from 'src/database/database.constants';
import {
  inventoryTransactions,
  materialCategoryMains,
  materialCategorySubs,
  materialPurchaseOrderItems,
  materialPurchaseOrders,
  materialPurchaseReceipts,
  materials,
  materialUnitConversions,
  suppliers,
} from 'src/database/schema';
import type { MaterialUnitConversionSummary } from 'src/utils/extras/material-unit-conversions-extra';
import { translate } from 'src/utils/i18n/translate';

const VALID_GROUP_BY = ['month', 'quarter', 'year'] as const;
type GroupBy = (typeof VALID_GROUP_BY)[number];

const TOP_SUPPLIERS_LIMIT = 10;
const TOP_MATERIALS_LIMIT = 10;
const TOP_ORDERS_LIMIT = 10;

const invoiceTotalPurchases = sql`coalesce(${materialPurchaseOrders.legacyInvoiceTotalPurchases}, 0)`;
const orderLinesTotal = sql`(
  select coalesce(sum(i.quantity_ordered * i.unit_price), 0)
  from material_purchase_order_items i
  where i.material_purchase_order_id = ${materialPurchaseOrders.id}
)`;
const allocatedInvoiceSpend = sql`${invoiceTotalPurchases} * (${materialPurchaseOrderItems.quantityOrdered} * ${materialPurchaseOrderItems.unitPrice}) / nullif(${orderLinesTotal}, 0)`;

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

  public async getCategoryStats(params: { mainCategoryId: string; from?: string; to?: string }) {
    const [category] = await this.db
      .select({ id: materialCategoryMains.id, title: materialCategoryMains.title })
      .from(materialCategoryMains)
      .where(eq(materialCategoryMains.id, params.mainCategoryId))
      .limit(1);

    if (!category) {
      throw new NotFoundException(
        translate(
          `Material main category with ID ${params.mainCategoryId} does not exist.`,
          `لا توجد فئة مواد رئيسية بالمعرف ${params.mainCategoryId}.`,
        ),
      );
    }

    const dateRange = this.buildDateRange(params.from, params.to);
    const scopedWhere = and(
      this.notCancelledWithDateRange(dateRange),
      eq(materialCategorySubs.mainCategoryId, params.mainCategoryId),
    )!;

    const [overview, categorySubCategories, categorySuppliers, categoryOrders, categoryMaterials] = await Promise.all([
      this.getCategoryOverview(scopedWhere),
      this.getCategoryBySubCategory(scopedWhere),
      this.getCategoryBySupplier(scopedWhere),
      this.getCategoryOrders(scopedWhere),
      this.getCategoryTopMaterials(scopedWhere),
    ]);

    return {
      category,
      overview,
      subCategories: categorySubCategories,
      suppliers: categorySuppliers,
      orders: categoryOrders,
      materials: categoryMaterials,
    };
  }

  public async getSupplierStats(params: { supplierId: string; from?: string; to?: string; groupBy?: string }) {
    const [supplier] = await this.db
      .select({ id: suppliers.id, code: suppliers.code, name: suppliers.name })
      .from(suppliers)
      .where(eq(suppliers.id, params.supplierId))
      .limit(1);

    if (!supplier) {
      throw new NotFoundException(
        translate(`Supplier with ID ${params.supplierId} does not exist.`, `لا يوجد مورد بالمعرف ${params.supplierId}.`),
      );
    }

    const groupBy = this.parseGroupBy(params.groupBy);
    const dateRange = this.buildDateRange(params.from, params.to);
    const scopedWhere = and(
      this.notCancelledWithDateRange(dateRange),
      eq(materialPurchaseOrders.supplierId, params.supplierId),
    )!;

    const [overview, byPeriod, supplierCategories, supplierSubCategories, supplierOrders, supplierMaterials] =
      await Promise.all([
        this.getSupplierOverview(scopedWhere),
        this.getSupplierByPeriod(scopedWhere, groupBy),
        this.getSupplierByMainCategory(scopedWhere),
        this.getSupplierBySubCategory(scopedWhere),
        this.getSupplierOrders(scopedWhere),
        this.getSupplierMaterials(scopedWhere),
      ]);

    return {
      supplier,
      overview,
      byPeriod,
      categories: supplierCategories,
      subCategories: supplierSubCategories,
      orders: supplierOrders,
      materials: supplierMaterials,
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
        totalSpend: sql<number>`coalesce(sum(case when ${materialPurchaseOrders.cancelledAt} is null then ${invoiceTotalPurchases} else 0 end), 0)`,
        totalOrders: sql<number>`count(*) filter (where ${materialPurchaseOrders.cancelledAt} is null)`,
        completedCount: sql<number>`count(*) filter (where ${materialPurchaseOrders.completedAt} is not null and ${materialPurchaseOrders.cancelledAt} is null)`,
        completedAmount: sql<number>`coalesce(sum(case when ${materialPurchaseOrders.completedAt} is not null and ${materialPurchaseOrders.cancelledAt} is null then ${invoiceTotalPurchases} else 0 end), 0)`,
        openCount: sql<number>`count(*) filter (where ${materialPurchaseOrders.completedAt} is null and ${materialPurchaseOrders.cancelledAt} is null)`,
        openAmount: sql<number>`coalesce(sum(case when ${materialPurchaseOrders.completedAt} is null and ${materialPurchaseOrders.cancelledAt} is null then ${invoiceTotalPurchases} else 0 end), 0)`,
        cancelledCount: sql<number>`count(*) filter (where ${materialPurchaseOrders.cancelledAt} is not null)`,
        cancelledAmount: sql<number>`coalesce(sum(case when ${materialPurchaseOrders.cancelledAt} is not null then ${invoiceTotalPurchases} else 0 end), 0)`,
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
        totalSpend: sql<number>`coalesce(sum(${invoiceTotalPurchases}), 0)`,
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
        totalSpend: sql<number>`coalesce(sum(${invoiceTotalPurchases}), 0)`,
        orderCount: count(),
      })
      .from(materialPurchaseOrders)
      .innerJoin(suppliers, eq(materialPurchaseOrders.supplierId, suppliers.id))
      .where(where)
      .groupBy(suppliers.id, suppliers.code, suppliers.name)
      .orderBy(desc(sql`coalesce(sum(${invoiceTotalPurchases}), 0)`))
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
        totalSpend: sql<number>`coalesce(sum(${allocatedInvoiceSpend}), 0)`,
        totalQuantity: sql<number>`coalesce(sum(${materialPurchaseOrderItems.quantityOrdered}), 0)`,
      })
      .from(materialPurchaseOrderItems)
      .innerJoin(materialPurchaseOrders, eq(materialPurchaseOrderItems.materialPurchaseOrderId, materialPurchaseOrders.id))
      .innerJoin(materials, eq(materialPurchaseOrderItems.materialCode, materials.code))
      .where(where)
      .groupBy(materialPurchaseOrderItems.materialCode, materials.title, materials.unitOfMeasurement)
      .orderBy(desc(sql`coalesce(sum(${allocatedInvoiceSpend}), 0)`))
      .limit(limit);

    const mapped = rows.map((r) => ({
      materialCode: r.materialCode,
      materialTitle: r.materialTitle,
      unitOfMeasurement: r.unitOfMeasurement,
      totalSpend: Number(r.totalSpend),
      totalQuantity: Number(r.totalQuantity),
      avgUnitPrice: Number(r.totalQuantity) > 0 ? Number(r.totalSpend) / Number(r.totalQuantity) : 0,
    }));

    return this.attachUnitConversions(mapped);
  }

  private async getByMainCategory(dateRange: { from?: Date; to?: Date }) {
    const where = this.notCancelledWithDateRange(dateRange);

    const rows = await this.db
      .select({
        mainCategoryId: materialCategoryMains.id,
        mainCategoryTitle: materialCategoryMains.title,
        materialCount: sql<number>`count(distinct ${materialPurchaseOrderItems.materialCode})`,
        totalQuantity: sql<number>`coalesce(sum(${materialPurchaseOrderItems.quantityOrdered}), 0)`,
        totalSpend: sql<number>`coalesce(sum(${allocatedInvoiceSpend}), 0)`,
      })
      .from(materialPurchaseOrderItems)
      .innerJoin(materialPurchaseOrders, eq(materialPurchaseOrderItems.materialPurchaseOrderId, materialPurchaseOrders.id))
      .innerJoin(materials, eq(materialPurchaseOrderItems.materialCode, materials.code))
      .innerJoin(materialCategorySubs, eq(materials.subCategoryId, materialCategorySubs.id))
      .innerJoin(materialCategoryMains, eq(materialCategorySubs.mainCategoryId, materialCategoryMains.id))
      .where(where)
      .groupBy(materialCategoryMains.id, materialCategoryMains.title)
      .orderBy(desc(sql`coalesce(sum(${allocatedInvoiceSpend}), 0)`));

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
        legacyInvoiceTotalPurchases: invoiceTotalPurchases,
        createdAt: materialPurchaseOrders.createdAt,
        completedAt: materialPurchaseOrders.completedAt,
      })
      .from(materialPurchaseOrders)
      .innerJoin(suppliers, eq(materialPurchaseOrders.supplierId, suppliers.id))
      .where(where)
      .orderBy(desc(invoiceTotalPurchases))
      .limit(limit);

    return rows.map((r) => ({
      orderId: r.orderId,
      orderCode: r.orderCode,
      legacyInvoiceNumber: r.legacyInvoiceNumber,
      supplierId: r.supplierId,
      supplierName: r.supplierName,
      legacyInvoiceTotalPurchases: Number(r.legacyInvoiceTotalPurchases),
      createdAt: r.createdAt,
      completedAt: r.completedAt,
    }));
  }

  private async getCategoryOverview(where: SQL) {
    const [row] = await this.db
      .select({
        totalSpend: sql<number>`coalesce(sum(${allocatedInvoiceSpend}), 0)`,
        totalOrders: sql<number>`count(distinct ${materialPurchaseOrders.id})`,
      })
      .from(materialPurchaseOrderItems)
      .innerJoin(materialPurchaseOrders, eq(materialPurchaseOrderItems.materialPurchaseOrderId, materialPurchaseOrders.id))
      .innerJoin(materials, eq(materialPurchaseOrderItems.materialCode, materials.code))
      .innerJoin(materialCategorySubs, eq(materials.subCategoryId, materialCategorySubs.id))
      .where(where);

    const totalSpend = Number(row?.totalSpend ?? 0);
    const totalOrders = Number(row?.totalOrders ?? 0);

    return {
      totalSpend,
      totalOrders,
      avgOrderValue: totalOrders > 0 ? totalSpend / totalOrders : 0,
    };
  }

  private async getCategoryBySubCategory(where: SQL) {
    const rows = await this.db
      .select({
        subCategoryId: materialCategorySubs.id,
        subCategoryTitle: materialCategorySubs.title,
        materialCount: sql<number>`count(distinct ${materialPurchaseOrderItems.materialCode})`,
        totalQuantity: sql<number>`coalesce(sum(${materialPurchaseOrderItems.quantityOrdered}), 0)`,
        totalSpend: sql<number>`coalesce(sum(${allocatedInvoiceSpend}), 0)`,
      })
      .from(materialPurchaseOrderItems)
      .innerJoin(materialPurchaseOrders, eq(materialPurchaseOrderItems.materialPurchaseOrderId, materialPurchaseOrders.id))
      .innerJoin(materials, eq(materialPurchaseOrderItems.materialCode, materials.code))
      .innerJoin(materialCategorySubs, eq(materials.subCategoryId, materialCategorySubs.id))
      .where(where)
      .groupBy(materialCategorySubs.id, materialCategorySubs.title)
      .orderBy(desc(sql`coalesce(sum(${allocatedInvoiceSpend}), 0)`));

    return rows.map((r) => ({
      subCategoryId: r.subCategoryId,
      subCategoryTitle: r.subCategoryTitle,
      materialCount: Number(r.materialCount),
      totalQuantity: Number(r.totalQuantity),
      totalSpend: Number(r.totalSpend),
    }));
  }

  private async getCategoryBySupplier(where: SQL) {
    const rows = await this.db
      .select({
        supplierId: suppliers.id,
        supplierCode: suppliers.code,
        supplierName: suppliers.name,
        totalSpend: sql<number>`coalesce(sum(${allocatedInvoiceSpend}), 0)`,
        orderCount: sql<number>`count(distinct ${materialPurchaseOrders.id})`,
      })
      .from(materialPurchaseOrderItems)
      .innerJoin(materialPurchaseOrders, eq(materialPurchaseOrderItems.materialPurchaseOrderId, materialPurchaseOrders.id))
      .innerJoin(suppliers, eq(materialPurchaseOrders.supplierId, suppliers.id))
      .innerJoin(materials, eq(materialPurchaseOrderItems.materialCode, materials.code))
      .innerJoin(materialCategorySubs, eq(materials.subCategoryId, materialCategorySubs.id))
      .where(where)
      .groupBy(suppliers.id, suppliers.code, suppliers.name)
      .orderBy(desc(sql`coalesce(sum(${allocatedInvoiceSpend}), 0)`));

    return rows.map((r) => ({
      supplierId: r.supplierId,
      supplierCode: r.supplierCode,
      supplierName: r.supplierName,
      totalSpend: Number(r.totalSpend),
      orderCount: Number(r.orderCount),
      avgOrderValue: Number(r.orderCount) > 0 ? Number(r.totalSpend) / Number(r.orderCount) : 0,
    }));
  }

  private async getCategoryOrders(where: SQL) {
    const rows = await this.db
      .select({
        orderId: materialPurchaseOrders.id,
        orderCode: materialPurchaseOrders.code,
        legacyInvoiceNumber: materialPurchaseOrders.legacyInvoiceNumber,
        legacyInvoiceIssuedAt: materialPurchaseOrders.legacyInvoiceIssuedAt,
        supplierId: suppliers.id,
        supplierName: suppliers.name,
        legacyInvoiceTotalPurchases: invoiceTotalPurchases,
        createdAt: materialPurchaseOrders.createdAt,
        completedAt: materialPurchaseOrders.completedAt,
      })
      .from(materialPurchaseOrderItems)
      .innerJoin(materialPurchaseOrders, eq(materialPurchaseOrderItems.materialPurchaseOrderId, materialPurchaseOrders.id))
      .innerJoin(suppliers, eq(materialPurchaseOrders.supplierId, suppliers.id))
      .innerJoin(materials, eq(materialPurchaseOrderItems.materialCode, materials.code))
      .innerJoin(materialCategorySubs, eq(materials.subCategoryId, materialCategorySubs.id))
      .where(where)
      .groupBy(
        materialPurchaseOrders.id,
        materialPurchaseOrders.code,
        materialPurchaseOrders.legacyInvoiceNumber,
        materialPurchaseOrders.legacyInvoiceIssuedAt,
        suppliers.id,
        suppliers.name,
        materialPurchaseOrders.legacyInvoiceTotalPurchases,
        materialPurchaseOrders.createdAt,
        materialPurchaseOrders.completedAt,
      )
      .orderBy(desc(materialPurchaseOrders.legacyInvoiceIssuedAt), desc(materialPurchaseOrders.createdAt));

    const orderIds = rows.map((r) => r.orderId);
    const legacyByOrderId = await this.getInventoryTransactionLegacyNumbersByOrderIds(orderIds);

    return rows.map((r) => ({
      orderId: r.orderId,
      orderCode: r.orderCode,
      legacyInvoiceNumber: r.legacyInvoiceNumber,
      legacyInvoiceIssuedAt: r.legacyInvoiceIssuedAt,
      supplierId: r.supplierId,
      supplierName: r.supplierName,
      legacyInvoiceTotalPurchases: Number(r.legacyInvoiceTotalPurchases),
      createdAt: r.createdAt,
      completedAt: r.completedAt,
      inventoryTransactionLegacyNumbers: legacyByOrderId.get(r.orderId) ?? [],
    }));
  }

  private async getInventoryTransactionLegacyNumbersByOrderIds(orderIds: string[]) {
    const legacyByOrderId = new Map<string, string[]>();
    if (orderIds.length === 0) return legacyByOrderId;

    const rows = await this.db
      .select({
        orderId: materialPurchaseReceipts.materialPurchaseOrderId,
        legacyNumber: inventoryTransactions.legacyNumber,
      })
      .from(materialPurchaseReceipts)
      .innerJoin(inventoryTransactions, eq(inventoryTransactions.materialPurchaseReceiptId, materialPurchaseReceipts.id))
      .where(and(inArray(materialPurchaseReceipts.materialPurchaseOrderId, orderIds), isNotNull(inventoryTransactions.legacyNumber)));

    for (const row of rows) {
      if (!row.legacyNumber) continue;
      const existing = legacyByOrderId.get(row.orderId) ?? [];
      if (!existing.includes(row.legacyNumber)) existing.push(row.legacyNumber);
      legacyByOrderId.set(row.orderId, existing);
    }

    return legacyByOrderId;
  }

  private async getCategoryTopMaterials(where: SQL) {
    const rows = await this.db
      .select({
        materialCode: materialPurchaseOrderItems.materialCode,
        materialTitle: materials.title,
        unitOfMeasurement: materials.unitOfMeasurement,
        totalSpend: sql<number>`coalesce(sum(${allocatedInvoiceSpend}), 0)`,
        totalQuantity: sql<number>`coalesce(sum(${materialPurchaseOrderItems.quantityOrdered}), 0)`,
      })
      .from(materialPurchaseOrderItems)
      .innerJoin(materialPurchaseOrders, eq(materialPurchaseOrderItems.materialPurchaseOrderId, materialPurchaseOrders.id))
      .innerJoin(materials, eq(materialPurchaseOrderItems.materialCode, materials.code))
      .innerJoin(materialCategorySubs, eq(materials.subCategoryId, materialCategorySubs.id))
      .where(where)
      .groupBy(materialPurchaseOrderItems.materialCode, materials.title, materials.unitOfMeasurement)
      .orderBy(desc(sql`coalesce(sum(${allocatedInvoiceSpend}), 0)`));

    const mapped = rows.map((r) => ({
      materialCode: r.materialCode,
      materialTitle: r.materialTitle,
      unitOfMeasurement: r.unitOfMeasurement,
      totalSpend: Number(r.totalSpend),
      totalQuantity: Number(r.totalQuantity),
      avgUnitPrice: Number(r.totalQuantity) > 0 ? Number(r.totalSpend) / Number(r.totalQuantity) : 0,
    }));

    return this.attachUnitConversions(mapped);
  }

  private async getSupplierOverview(where: SQL) {
    const [row] = await this.db
      .select({
        totalSpend: sql<number>`coalesce(sum(${invoiceTotalPurchases}), 0)`,
        totalOrders: count(),
      })
      .from(materialPurchaseOrders)
      .where(where);

    const totalSpend = Number(row?.totalSpend ?? 0);
    const totalOrders = Number(row?.totalOrders ?? 0);

    return {
      totalSpend,
      totalOrders,
      avgOrderValue: totalOrders > 0 ? totalSpend / totalOrders : 0,
    };
  }

  private async getSupplierByPeriod(where: SQL, groupBy: GroupBy) {
    const bucket = sql<string>`date_trunc('${sql.raw(groupBy)}', ${materialPurchaseOrders.createdAt})`;

    const rows = await this.db
      .select({
        period: bucket.as('period'),
        totalSpend: sql<number>`coalesce(sum(${invoiceTotalPurchases}), 0)`,
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

  private async getSupplierByMainCategory(where: SQL) {
    const rows = await this.db
      .select({
        mainCategoryId: materialCategoryMains.id,
        mainCategoryTitle: materialCategoryMains.title,
        materialCount: sql<number>`count(distinct ${materialPurchaseOrderItems.materialCode})`,
        totalQuantity: sql<number>`coalesce(sum(${materialPurchaseOrderItems.quantityOrdered}), 0)`,
        totalSpend: sql<number>`coalesce(sum(${allocatedInvoiceSpend}), 0)`,
      })
      .from(materialPurchaseOrderItems)
      .innerJoin(materialPurchaseOrders, eq(materialPurchaseOrderItems.materialPurchaseOrderId, materialPurchaseOrders.id))
      .innerJoin(materials, eq(materialPurchaseOrderItems.materialCode, materials.code))
      .innerJoin(materialCategorySubs, eq(materials.subCategoryId, materialCategorySubs.id))
      .innerJoin(materialCategoryMains, eq(materialCategorySubs.mainCategoryId, materialCategoryMains.id))
      .where(where)
      .groupBy(materialCategoryMains.id, materialCategoryMains.title)
      .orderBy(desc(sql`coalesce(sum(${allocatedInvoiceSpend}), 0)`));

    return rows.map((r) => ({
      mainCategoryId: r.mainCategoryId,
      mainCategoryTitle: r.mainCategoryTitle,
      materialCount: Number(r.materialCount),
      totalQuantity: Number(r.totalQuantity),
      totalSpend: Number(r.totalSpend),
    }));
  }

  private async getSupplierBySubCategory(where: SQL) {
    const rows = await this.db
      .select({
        mainCategoryId: materialCategoryMains.id,
        mainCategoryTitle: materialCategoryMains.title,
        subCategoryId: materialCategorySubs.id,
        subCategoryTitle: materialCategorySubs.title,
        materialCount: sql<number>`count(distinct ${materialPurchaseOrderItems.materialCode})`,
        totalQuantity: sql<number>`coalesce(sum(${materialPurchaseOrderItems.quantityOrdered}), 0)`,
        totalSpend: sql<number>`coalesce(sum(${allocatedInvoiceSpend}), 0)`,
      })
      .from(materialPurchaseOrderItems)
      .innerJoin(materialPurchaseOrders, eq(materialPurchaseOrderItems.materialPurchaseOrderId, materialPurchaseOrders.id))
      .innerJoin(materials, eq(materialPurchaseOrderItems.materialCode, materials.code))
      .innerJoin(materialCategorySubs, eq(materials.subCategoryId, materialCategorySubs.id))
      .innerJoin(materialCategoryMains, eq(materialCategorySubs.mainCategoryId, materialCategoryMains.id))
      .where(where)
      .groupBy(
        materialCategoryMains.id,
        materialCategoryMains.title,
        materialCategorySubs.id,
        materialCategorySubs.title,
      )
      .orderBy(desc(sql`coalesce(sum(${allocatedInvoiceSpend}), 0)`));

    return rows.map((r) => ({
      mainCategoryId: r.mainCategoryId,
      mainCategoryTitle: r.mainCategoryTitle,
      subCategoryId: r.subCategoryId,
      subCategoryTitle: r.subCategoryTitle,
      materialCount: Number(r.materialCount),
      totalQuantity: Number(r.totalQuantity),
      totalSpend: Number(r.totalSpend),
    }));
  }

  private async getSupplierOrders(where: SQL) {
    const rows = await this.db
      .select({
        orderId: materialPurchaseOrders.id,
        orderCode: materialPurchaseOrders.code,
        legacyInvoiceNumber: materialPurchaseOrders.legacyInvoiceNumber,
        legacyInvoiceIssuedAt: materialPurchaseOrders.legacyInvoiceIssuedAt,
        legacyInvoiceTotalPurchases: invoiceTotalPurchases,
        createdAt: materialPurchaseOrders.createdAt,
        completedAt: materialPurchaseOrders.completedAt,
      })
      .from(materialPurchaseOrders)
      .where(where)
      .orderBy(desc(materialPurchaseOrders.legacyInvoiceIssuedAt), desc(materialPurchaseOrders.createdAt));

    const orderIds = rows.map((r) => r.orderId);
    const legacyByOrderId = await this.getInventoryTransactionLegacyNumbersByOrderIds(orderIds);

    return rows.map((r) => ({
      orderId: r.orderId,
      orderCode: r.orderCode,
      legacyInvoiceNumber: r.legacyInvoiceNumber,
      legacyInvoiceIssuedAt: r.legacyInvoiceIssuedAt,
      legacyInvoiceTotalPurchases: Number(r.legacyInvoiceTotalPurchases),
      createdAt: r.createdAt,
      completedAt: r.completedAt,
      inventoryTransactionLegacyNumbers: legacyByOrderId.get(r.orderId) ?? [],
    }));
  }

  private async getSupplierMaterials(where: SQL) {
    const rows = await this.db
      .select({
        materialCode: materialPurchaseOrderItems.materialCode,
        materialTitle: materials.title,
        unitOfMeasurement: materials.unitOfMeasurement,
        totalSpend: sql<number>`coalesce(sum(${allocatedInvoiceSpend}), 0)`,
        totalQuantity: sql<number>`coalesce(sum(${materialPurchaseOrderItems.quantityOrdered}), 0)`,
      })
      .from(materialPurchaseOrderItems)
      .innerJoin(materialPurchaseOrders, eq(materialPurchaseOrderItems.materialPurchaseOrderId, materialPurchaseOrders.id))
      .innerJoin(materials, eq(materialPurchaseOrderItems.materialCode, materials.code))
      .where(where)
      .groupBy(materialPurchaseOrderItems.materialCode, materials.title, materials.unitOfMeasurement)
      .orderBy(desc(sql`coalesce(sum(${allocatedInvoiceSpend}), 0)`));

    const mapped = rows.map((r) => ({
      materialCode: r.materialCode,
      materialTitle: r.materialTitle,
      unitOfMeasurement: r.unitOfMeasurement,
      totalSpend: Number(r.totalSpend),
      totalQuantity: Number(r.totalQuantity),
      avgUnitPrice: Number(r.totalQuantity) > 0 ? Number(r.totalSpend) / Number(r.totalQuantity) : 0,
    }));

    return this.attachUnitConversions(mapped);
  }

  private async attachUnitConversions<T extends { materialCode: string }>(
    rows: T[],
  ): Promise<(T & { unitConversions: MaterialUnitConversionSummary[] })[]> {
    if (rows.length === 0) return [];

    const codes = [...new Set(rows.map((row) => row.materialCode))];
    const conversions = await this.db
      .select({
        id: materialUnitConversions.id,
        materialCode: materialUnitConversions.materialCode,
        unit: materialUnitConversions.unit,
        conversionFactorToBase: materialUnitConversions.conversionFactorToBase,
      })
      .from(materialUnitConversions)
      .where(inArray(materialUnitConversions.materialCode, codes));

    const byCode = new Map<string, MaterialUnitConversionSummary[]>();
    for (const conversion of conversions) {
      const list = byCode.get(conversion.materialCode) ?? [];
      list.push({
        id: conversion.id,
        unit: conversion.unit,
        conversionFactorToBase: Number(conversion.conversionFactorToBase),
      });
      byCode.set(conversion.materialCode, list);
    }

    return rows.map((row) => ({
      ...row,
      unitConversions: byCode.get(row.materialCode) ?? [],
    }));
  }
}
