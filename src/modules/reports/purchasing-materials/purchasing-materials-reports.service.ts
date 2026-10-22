import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, count, desc, eq, gte, inArray, isNotNull, isNull, lte, sql, type SQL } from 'drizzle-orm';
import { DRIZZLE, type DrizzleDB } from 'src/database/database.constants';
import {
  inventoryTransactions,
  materialCategoryMains,
  materialCategorySubs,
  materialPurchaseOrderItemRequisitionItems,
  materialPurchaseOrderItems,
  materialPurchaseOrders,
  materialPurchaseReceiptItems,
  materialPurchaseReceipts,
  materialPurchaseRequisitionItems,
  materialPurchaseRequisitions,
  materials,
  materialUnitConversions,
  suppliers,
} from 'src/database/schema';
import { APPROVAL_DECISIONS, PRICE_OUTLIER_CAUSES, PRODUCTION_SUB_DEPARTMENT_VALUES } from 'src/utils/constants';
import type { MaterialUnitConversionSummary } from 'src/utils/extras/material-unit-conversions-extra';
import { convertUnitPrice, resolveConversionFactor, toBaseQuantity } from 'src/utils/helpers/unit-conversion';
import { translate } from 'src/utils/i18n/translate';
import type { MaterialUnit, PriceOutlierCause, ProductionSubDepartment } from 'src/utils/types';

const VALID_GROUP_BY = ['month', 'quarter', 'year'] as const;
type GroupBy = (typeof VALID_GROUP_BY)[number];

const TOP_SUPPLIERS_LIMIT = 10;
const TOP_MATERIALS_LIMIT = 10;
const TOP_ORDERS_LIMIT = 10;

const PRICE_OUTLIER_NEIGHBOUR_WINDOW = 3;
const PRICE_OUTLIER_MIN_PRICED_LINES = 3;
const PRICE_OUTLIER_DEFAULT_THRESHOLD = 2;
const PRICE_OUTLIER_MIN_THRESHOLD = 1.5;
const PRICE_OUTLIER_RATIO_TOLERANCE = 0.1;
const PRICE_OUTLIER_DECIMAL_TYPO_FACTORS = [10, 100, 1000];

const invoiceTotalPurchases = sql`(
  select coalesce(sum(si.total_purchases), 0)
  from supplier_invoices si
  where si.material_purchase_order_id = ${materialPurchaseOrders.id}
)`;
const orderInvoiceNumbers = sql<(string | null)[]>`(
  select coalesce(array_agg(si.invoice_number order by si.issued_at desc nulls last, si.created_at desc), '{}')
  from supplier_invoices si
  where si.material_purchase_order_id = ${materialPurchaseOrders.id}
)`;
const orderLatestInvoiceIssuedAt = sql<Date | null>`(
  select max(si.issued_at)
  from supplier_invoices si
  where si.material_purchase_order_id = ${materialPurchaseOrders.id}
)`;
const orderHasInvoiceTotals = sql`exists (
  select 1
  from supplier_invoices si
  where si.material_purchase_order_id = ${materialPurchaseOrders.id}
    and si.total_purchases is not null
)`;
const orderLinesTotal = sql`(
  select coalesce(sum(i.quantity_ordered * i.unit_price), 0)
  from material_purchase_order_items i
  where i.material_purchase_order_id = ${materialPurchaseOrders.id}
)`;
const allocatedInvoiceSpend = sql`${invoiceTotalPurchases} * (${materialPurchaseOrderItems.quantityOrdered} * ${materialPurchaseOrderItems.unitPrice}) / nullif(${orderLinesTotal}, 0)`;

/** Convert a line's quantity_ordered into the material's base unit (1 when selected unit is base). */
const quantityOrderedInBase = sql`${materialPurchaseOrderItems.quantityOrdered} * coalesce(
  (
    select muc.conversion_factor_to_base
    from material_unit_conversions muc
    where muc.material_code = ${materialPurchaseOrderItems.materialCode}
      and muc.unit = ${materialPurchaseOrderItems.unitOfMeasurementSelected}
  ),
  case
    when ${materialPurchaseOrderItems.unitOfMeasurementSelected} = (
      select m.unit_of_measurement from materials m where m.code = ${materialPurchaseOrderItems.materialCode}
    ) then 1
    else null
  end
)`;

/** Convert a line's unit_price into price-per-base-unit. */
const unitPriceInBase = sql`${materialPurchaseOrderItems.unitPrice} / nullif(
  coalesce(
    (
      select muc.conversion_factor_to_base
      from material_unit_conversions muc
      where muc.material_code = ${materialPurchaseOrderItems.materialCode}
        and muc.unit = ${materialPurchaseOrderItems.unitOfMeasurementSelected}
    ),
    case
      when ${materialPurchaseOrderItems.unitOfMeasurementSelected} = (
        select m.unit_of_measurement from materials m where m.code = ${materialPurchaseOrderItems.materialCode}
      ) then 1
      else null
    end
  ),
  0
)`;

type PriceOutlierSourceRow = {
  itemId: string;
  materialCode: string;
  materialTitle: string;
  orderId: string;
  orderCode: string;
  orderDate: Date;
  supplierId: string;
  supplierName: string;
  invoiceNumbers: (string | null)[] | null;
  enteredUnit: MaterialUnit;
  enteredUnitPrice: unknown;
  unitPriceInBase: unknown;
};

function toInvoiceNumbers(value: (string | null)[] | null | undefined): string[] {
  return (value ?? []).filter((n): n is string => n != null);
}

function toFinitePositiveNumber(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function ratioMatchesExpected(ratio: number, expected: number, tolerance = PRICE_OUTLIER_RATIO_TOLERANCE): boolean {
  if (!(expected > 0) || !(ratio > 0)) return false;
  return Math.abs(ratio - expected) / expected <= tolerance;
}

function classifyPriceOutlierCause(ratio: number, conversionFactors: number[]): PriceOutlierCause {
  for (const factor of PRICE_OUTLIER_DECIMAL_TYPO_FACTORS) {
    if (ratioMatchesExpected(ratio, factor) || ratioMatchesExpected(ratio, 1 / factor)) {
      return PRICE_OUTLIER_CAUSES.DECIMAL_TYPO;
    }
  }

  for (const factor of conversionFactors) {
    if (ratioMatchesExpected(ratio, factor) || ratioMatchesExpected(ratio, 1 / factor)) {
      return PRICE_OUTLIER_CAUSES.UNIT_MISMATCH;
    }
  }

  return PRICE_OUTLIER_CAUSES.SPIKE;
}

function toMissingConversionFlag(row: PriceOutlierSourceRow) {
  return {
    itemId: row.itemId,
    materialCode: row.materialCode,
    materialTitle: row.materialTitle,
    orderId: row.orderId,
    orderCode: row.orderCode,
    orderDate: row.orderDate,
    supplierId: row.supplierId,
    supplierName: row.supplierName,
    invoiceNumbers: toInvoiceNumbers(row.invoiceNumbers),
    enteredUnit: row.enteredUnit,
    enteredUnitPrice: Number(row.enteredUnitPrice),
    referenceMedian: null,
    ratio: null,
    cause: PRICE_OUTLIER_CAUSES.MISSING_CONVERSION,
    severity: Number.POSITIVE_INFINITY,
  };
}

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
        unitPrice: unitPriceInBase,
        quantityOrdered: quantityOrderedInBase,
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

    const [materialWithConversions] = await this.attachUnitConversions([{ ...material, materialCode: material.code }]);

    return {
      material: {
        code: materialWithConversions.code,
        title: materialWithConversions.title,
        unitOfMeasurement: materialWithConversions.unitOfMeasurement,
        unitConversions: materialWithConversions.unitConversions,
      },
      entries,
      summary: { minPrice, maxPrice, avgPrice, changePercentage },
    };
  }

  public async getPriceOutliers(params: { from?: string; to?: string; threshold?: string }) {
    const threshold = this.parsePriceOutlierThreshold(params.threshold);
    const dateRange = this.buildDateRange(params.from, params.to);

    const rows = await this.db
      .select({
        itemId: materialPurchaseOrderItems.id,
        materialCode: materialPurchaseOrderItems.materialCode,
        materialTitle: materials.title,
        orderId: materialPurchaseOrders.id,
        orderCode: materialPurchaseOrders.code,
        orderDate: materialPurchaseOrders.createdAt,
        supplierId: suppliers.id,
        supplierName: suppliers.name,
        invoiceNumbers: orderInvoiceNumbers,
        enteredUnit: materialPurchaseOrderItems.unitOfMeasurementSelected,
        enteredUnitPrice: materialPurchaseOrderItems.unitPrice,
        unitPriceInBase,
      })
      .from(materialPurchaseOrderItems)
      .innerJoin(materialPurchaseOrders, eq(materialPurchaseOrderItems.materialPurchaseOrderId, materialPurchaseOrders.id))
      .innerJoin(suppliers, eq(materialPurchaseOrders.supplierId, suppliers.id))
      .innerJoin(materials, eq(materialPurchaseOrderItems.materialCode, materials.code))
      .where(isNull(materialPurchaseOrders.cancelledAt))
      .orderBy(asc(materialPurchaseOrderItems.materialCode), asc(materialPurchaseOrders.createdAt));

    const conversionsByCode = await this.loadConversionFactorsByMaterial(
      rows.map((row) => row.materialCode),
    );

    type FlaggedRow = {
      itemId: string;
      materialCode: string;
      materialTitle: string;
      orderId: string;
      orderCode: string;
      orderDate: Date;
      supplierId: string;
      supplierName: string;
      invoiceNumbers: string[];
      enteredUnit: MaterialUnit;
      enteredUnitPrice: number;
      referenceMedian: number | null;
      ratio: number | null;
      cause: PriceOutlierCause;
      severity: number;
    };

    const flagged: FlaggedRow[] = [];
    let index = 0;

    while (index < rows.length) {
      const materialCode = rows[index].materialCode;
      const groupStart = index;
      while (index < rows.length && rows[index].materialCode === materialCode) index += 1;
      const group = rows.slice(groupStart, index);

      const priced: { row: (typeof rows)[number]; price: number }[] = [];

      for (const row of group) {
        const price = toFinitePositiveNumber(row.unitPriceInBase);
        if (price == null) {
          flagged.push(toMissingConversionFlag(row));
          continue;
        }
        priced.push({ row, price });
      }

      if (priced.length < PRICE_OUTLIER_MIN_PRICED_LINES) continue;

      const conversionFactors = conversionsByCode.get(materialCode) ?? [];

      for (let i = 0; i < priced.length; i += 1) {
        const neighbours = priced
          .slice(Math.max(0, i - PRICE_OUTLIER_NEIGHBOUR_WINDOW), i)
          .concat(priced.slice(i + 1, i + 1 + PRICE_OUTLIER_NEIGHBOUR_WINDOW))
          .map((item) => item.price);

        if (neighbours.length === 0) continue;

        const referenceMedian = median(neighbours);
        if (referenceMedian == null || referenceMedian <= 0) continue;

        const { row, price } = priced[i];
        const ratio = price / referenceMedian;
        if (!Number.isFinite(ratio) || ratio <= 0) continue;
        if (ratio < threshold && ratio > 1 / threshold) continue;

        const enteredUnitPrice = toFinitePositiveNumber(row.enteredUnitPrice);
        if (enteredUnitPrice == null) continue;

        flagged.push({
          itemId: row.itemId,
          materialCode: row.materialCode,
          materialTitle: row.materialTitle,
          orderId: row.orderId,
          orderCode: row.orderCode,
          orderDate: row.orderDate,
          supplierId: row.supplierId,
          supplierName: row.supplierName,
          invoiceNumbers: toInvoiceNumbers(row.invoiceNumbers),
          enteredUnit: row.enteredUnit,
          enteredUnitPrice,
          // Median is computed in base units, then expressed in this line's entered unit.
          referenceMedian: referenceMedian * (enteredUnitPrice / price),
          ratio,
          cause: classifyPriceOutlierCause(ratio, conversionFactors),
          severity: Math.abs(Math.log10(ratio)),
        });
      }
    }

    const inRange = flagged.filter((row) => {
      if (dateRange.from && row.orderDate < dateRange.from) return false;
      if (dateRange.to && row.orderDate > dateRange.to) return false;
      return true;
    });

    inRange.sort((a, b) => b.severity - a.severity || b.orderDate.getTime() - a.orderDate.getTime());

    const byCause: Record<PriceOutlierCause, number> = {
      decimal_typo: 0,
      unit_mismatch: 0,
      spike: 0,
      missing_conversion: 0,
    };
    const materialsAffected = new Set<string>();
    for (const row of inRange) {
      byCause[row.cause] += 1;
      materialsAffected.add(row.materialCode);
    }

    return {
      summary: {
        flaggedCount: inRange.length,
        materialsAffected: materialsAffected.size,
        byCause,
      },
      rows: inRange.map(({ severity: _severity, ...row }) => row),
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

  public async getSubCategoryStats(params: { subCategoryId: string; from?: string; to?: string }) {
    const [subCategory] = await this.db
      .select({
        id: materialCategorySubs.id,
        title: materialCategorySubs.title,
        mainCategoryId: materialCategoryMains.id,
        mainCategoryTitle: materialCategoryMains.title,
      })
      .from(materialCategorySubs)
      .innerJoin(materialCategoryMains, eq(materialCategorySubs.mainCategoryId, materialCategoryMains.id))
      .where(eq(materialCategorySubs.id, params.subCategoryId))
      .limit(1);

    if (!subCategory) {
      throw new NotFoundException(
        translate(
          `Material subcategory with ID ${params.subCategoryId} does not exist.`,
          `لا توجد فئة مواد فرعية بالمعرف ${params.subCategoryId}.`,
        ),
      );
    }

    const dateRange = this.buildDateRange(params.from, params.to);
    const scopedWhere = and(
      this.notCancelledWithDateRange(dateRange),
      eq(materials.subCategoryId, params.subCategoryId),
    )!;

    const [overview, categorySuppliers, categoryOrders, categoryMaterials] = await Promise.all([
      this.getCategoryOverview(scopedWhere),
      this.getCategoryBySupplier(scopedWhere),
      this.getCategoryOrders(scopedWhere),
      this.getCategoryTopMaterials(scopedWhere),
    ]);

    return {
      subCategory,
      overview,
      suppliers: categorySuppliers,
      orders: categoryOrders,
      materials: categoryMaterials,
    };
  }

  public async getTotalAmountMismatches(params: { from?: string; to?: string }) {
    const dateRange = this.buildDateRange(params.from, params.to);
    const dateWhere = this.notCancelledWithDateRange(dateRange);
    const absoluteDifference = sql`abs(${materialPurchaseOrders.totalAmount} - ${invoiceTotalPurchases})`;
    const mismatchCondition = sql`${orderHasInvoiceTotals} and ${absoluteDifference} >= greatest(abs(${materialPurchaseOrders.totalAmount}), abs(${invoiceTotalPurchases})) * 0.01`;

    const [mismatchRows, missingInvoiceTotalRows] = await Promise.all([
      this.db
        .select({
          orderId: materialPurchaseOrders.id,
          orderCode: materialPurchaseOrders.code,
          invoiceNumbers: orderInvoiceNumbers,
          supplierId: suppliers.id,
          supplierName: suppliers.name,
          calculatedTotalAmount: materialPurchaseOrders.totalAmount,
          invoiceTotalPurchases: invoiceTotalPurchases,
          createdAt: materialPurchaseOrders.createdAt,
          completedAt: materialPurchaseOrders.completedAt,
        })
        .from(materialPurchaseOrders)
        .innerJoin(suppliers, eq(materialPurchaseOrders.supplierId, suppliers.id))
        .where(and(dateWhere, mismatchCondition))
        .orderBy(desc(absoluteDifference), desc(materialPurchaseOrders.createdAt)),
      this.db
        .select({
          orderId: materialPurchaseOrders.id,
          orderCode: materialPurchaseOrders.code,
          invoiceNumbers: orderInvoiceNumbers,
          supplierId: suppliers.id,
          supplierName: suppliers.name,
          calculatedTotalAmount: materialPurchaseOrders.totalAmount,
          createdAt: materialPurchaseOrders.createdAt,
          completedAt: materialPurchaseOrders.completedAt,
        })
        .from(materialPurchaseOrders)
        .innerJoin(suppliers, eq(materialPurchaseOrders.supplierId, suppliers.id))
        .where(
          and(
            dateWhere,
            isNotNull(materialPurchaseOrders.completedAt),
            sql`not ${orderHasInvoiceTotals}`,
          ),
        )
        .orderBy(desc(materialPurchaseOrders.completedAt), desc(materialPurchaseOrders.createdAt)),
    ]);

    const orders = mismatchRows.map((r) => {
      const calculatedTotalAmount = Number(r.calculatedTotalAmount);
      const invoiceTotalPurchasesValue = Number(r.invoiceTotalPurchases);
      return {
        orderId: r.orderId,
        orderCode: r.orderCode,
        invoiceNumbers: (r.invoiceNumbers ?? []).filter((n): n is string => n != null),
        supplierId: r.supplierId,
        supplierName: r.supplierName,
        calculatedTotalAmount,
        invoiceTotalPurchases: invoiceTotalPurchasesValue,
        difference: calculatedTotalAmount - invoiceTotalPurchasesValue,
        createdAt: r.createdAt,
        completedAt: r.completedAt,
      };
    });

    const completedWithoutInvoiceTotal = missingInvoiceTotalRows.map((r) => ({
      orderId: r.orderId,
      orderCode: r.orderCode,
      invoiceNumbers: (r.invoiceNumbers ?? []).filter((n): n is string => n != null),
      supplierId: r.supplierId,
      supplierName: r.supplierName,
      calculatedTotalAmount: Number(r.calculatedTotalAmount),
      createdAt: r.createdAt,
      completedAt: r.completedAt!,
    }));

    const mismatchCount = orders.length;
    const totalCalculatedAmount = orders.reduce((sum, row) => sum + row.calculatedTotalAmount, 0);
    const totalInvoicePurchases = orders.reduce((sum, row) => sum + row.invoiceTotalPurchases, 0);
    const totalDifference = orders.reduce((sum, row) => sum + Math.abs(row.difference), 0);
    const missingInvoiceTotalCount = completedWithoutInvoiceTotal.length;
    const missingInvoiceTotalCalculatedAmount = completedWithoutInvoiceTotal.reduce(
      (sum, row) => sum + row.calculatedTotalAmount,
      0,
    );

    return {
      overview: {
        mismatchCount,
        totalCalculatedAmount,
        totalInvoicePurchases,
        totalDifference,
        missingInvoiceTotalCount,
        missingInvoiceTotalCalculatedAmount,
      },
      orders,
      completedWithoutInvoiceTotal,
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

  public async getRequisitionFollowUp(params: {
    productionSubDepartment: string;
    from?: string;
    to?: string;
  }) {
    const productionSubDepartment = params.productionSubDepartment?.trim();
    if (
      !productionSubDepartment ||
      !(PRODUCTION_SUB_DEPARTMENT_VALUES as readonly string[]).includes(productionSubDepartment)
    ) {
      throw new BadRequestException(
        translate(
          'A valid production sub-department is required.',
          'قسم الإنتاج الفرعي صالح مطلوب.',
        ),
      );
    }

    const dept = productionSubDepartment as ProductionSubDepartment;
    const dateRange = this.buildDateRange(params.from, params.to);
    const conditions: SQL[] = [
      eq(materialPurchaseRequisitions.productionSubDepartment, dept),
      eq(materialPurchaseRequisitions.planningDecision, APPROVAL_DECISIONS.APPROVED),
      eq(materialPurchaseRequisitions.inventoryControlDecision, APPROVAL_DECISIONS.APPROVED),
      eq(materialPurchaseRequisitions.managerDecision, APPROVAL_DECISIONS.APPROVED),
    ];
    if (dateRange.from) conditions.push(gte(materialPurchaseRequisitions.createdAt, dateRange.from));
    if (dateRange.to) conditions.push(lte(materialPurchaseRequisitions.createdAt, dateRange.to));

    const rows = await this.db
      .select({
        requisitionItemId: materialPurchaseRequisitionItems.id,
        requisitionId: materialPurchaseRequisitions.id,
        requisitionCode: materialPurchaseRequisitions.code,
        requisitionNotes: materialPurchaseRequisitions.notes,
        itemNotes: materialPurchaseRequisitionItems.notes,
        materialCode: materialPurchaseRequisitionItems.materialCode,
        materialTitle: materials.title,
        unitOfMeasurement: materials.unitOfMeasurement,
        unitOfMeasurementSelected: materialPurchaseRequisitionItems.unitOfMeasurementSelected,
        quantityRequested: materialPurchaseRequisitionItems.quantityRequested,
        createdAt: materialPurchaseRequisitions.createdAt,
      })
      .from(materialPurchaseRequisitionItems)
      .innerJoin(
        materialPurchaseRequisitions,
        eq(materialPurchaseRequisitionItems.materialPurchaseRequisitionId, materialPurchaseRequisitions.id),
      )
      .innerJoin(materials, eq(materialPurchaseRequisitionItems.materialCode, materials.code))
      .where(and(...conditions))
      .orderBy(desc(materialPurchaseRequisitions.createdAt), asc(materialPurchaseRequisitionItems.materialCode));

    if (rows.length === 0) {
      return {
        productionSubDepartment: dept,
        items: [],
        totals: { requestedValue: 0, orderedValue: 0, receivedValue: 0 },
        missingPriceCount: 0,
      };
    }

    const requisitionItemIds = rows.map((row) => row.requisitionItemId);
    const materialCodes = [...new Set(rows.map((row) => row.materialCode))];

    const [conversionRows, lastPurchaseByCode, allocationRows] = await Promise.all([
      this.db
        .select({
          materialCode: materialUnitConversions.materialCode,
          unit: materialUnitConversions.unit,
          conversionFactorToBase: materialUnitConversions.conversionFactorToBase,
        })
        .from(materialUnitConversions)
        .where(inArray(materialUnitConversions.materialCode, materialCodes)),
      this.getLastPurchasePriceByMaterialCode(materialCodes),
      this.db
        .select({
          requisitionItemId: materialPurchaseOrderItemRequisitionItems.materialPurchaseRequisitionItemId,
          orderItemId: materialPurchaseOrderItemRequisitionItems.materialPurchaseOrderItemId,
          quantityAllocated: materialPurchaseOrderItemRequisitionItems.quantityAllocated,
          orderItemUnit: materialPurchaseOrderItems.unitOfMeasurementSelected,
          orderItemMaterialCode: materialPurchaseOrderItems.materialCode,
        })
        .from(materialPurchaseOrderItemRequisitionItems)
        .innerJoin(
          materialPurchaseOrderItems,
          eq(materialPurchaseOrderItemRequisitionItems.materialPurchaseOrderItemId, materialPurchaseOrderItems.id),
        )
        .innerJoin(materialPurchaseOrders, eq(materialPurchaseOrderItems.materialPurchaseOrderId, materialPurchaseOrders.id))
        .where(
          and(
            inArray(materialPurchaseOrderItemRequisitionItems.materialPurchaseRequisitionItemId, requisitionItemIds),
            isNull(materialPurchaseOrders.cancelledAt),
          ),
        ),
    ]);

    const conversionsByCode = new Map<string, { unit: MaterialUnit; conversionFactorToBase: number }[]>();
    for (const row of conversionRows) {
      const list = conversionsByCode.get(row.materialCode) ?? [];
      list.push({ unit: row.unit as MaterialUnit, conversionFactorToBase: Number(row.conversionFactorToBase) });
      conversionsByCode.set(row.materialCode, list);
    }

    const orderedQtyByRequisitionItemId = new Map<string, number>();
    const allocationsByOrderItemId = new Map<
      string,
      { requisitionItemId: string; quantityAllocated: number; materialCode: string; orderItemUnit: MaterialUnit }[]
    >();

    for (const row of allocationRows) {
      const qty = Number(row.quantityAllocated);
      orderedQtyByRequisitionItemId.set(
        row.requisitionItemId,
        (orderedQtyByRequisitionItemId.get(row.requisitionItemId) ?? 0) + qty,
      );

      const list = allocationsByOrderItemId.get(row.orderItemId) ?? [];
      list.push({
        requisitionItemId: row.requisitionItemId,
        quantityAllocated: qty,
        materialCode: row.orderItemMaterialCode,
        orderItemUnit: row.orderItemUnit as MaterialUnit,
      });
      allocationsByOrderItemId.set(row.orderItemId, list);
    }

    const orderItemIds = [...allocationsByOrderItemId.keys()];
    const acceptedBaseByOrderItemId = new Map<string, number>();

    if (orderItemIds.length > 0) {
      const receiptRows = await this.db
        .select({
          orderItemId: materialPurchaseReceiptItems.materialPurchaseOrderItemId,
          unitOfMeasurementSelected: materialPurchaseReceiptItems.unitOfMeasurementSelected,
          quantityReceived: materialPurchaseReceiptItems.quantityReceived,
          materialCode: materialPurchaseOrderItems.materialCode,
        })
        .from(materialPurchaseReceiptItems)
        .innerJoin(
          materialPurchaseOrderItems,
          eq(materialPurchaseReceiptItems.materialPurchaseOrderItemId, materialPurchaseOrderItems.id),
        )
        .where(inArray(materialPurchaseReceiptItems.materialPurchaseOrderItemId, orderItemIds));

      const baseUnitByCode = new Map(rows.map((row) => [row.materialCode, row.unitOfMeasurement as MaterialUnit]));

      for (const receipt of receiptRows) {
        const baseUnit = baseUnitByCode.get(receipt.materialCode);
        if (!baseUnit) continue;
        const conversions = conversionsByCode.get(receipt.materialCode) ?? [];
        const factor = resolveConversionFactor(
          receipt.unitOfMeasurementSelected as MaterialUnit,
          baseUnit,
          conversions,
        );
        const acceptedBase = toBaseQuantity(Number(receipt.quantityReceived), factor);
        acceptedBaseByOrderItemId.set(
          receipt.orderItemId,
          (acceptedBaseByOrderItemId.get(receipt.orderItemId) ?? 0) + acceptedBase,
        );
      }
    }

    const receivedBaseByRequisitionItemId = new Map<string, number>();
    const baseUnitByCode = new Map(rows.map((row) => [row.materialCode, row.unitOfMeasurement as MaterialUnit]));
    const rowByRequisitionItemId = new Map(rows.map((row) => [row.requisitionItemId, row]));

    for (const [orderItemId, allocations] of allocationsByOrderItemId) {
      const acceptedBase = acceptedBaseByOrderItemId.get(orderItemId) ?? 0;
      if (acceptedBase <= 0) continue;

      let totalAllocatedBase = 0;
      const allocatedBases: { requisitionItemId: string; allocatedBase: number }[] = [];

      for (const allocation of allocations) {
        const baseUnit = baseUnitByCode.get(allocation.materialCode);
        if (!baseUnit) continue;
        const reqRow = rowByRequisitionItemId.get(allocation.requisitionItemId);
        if (!reqRow) continue;
        const conversions = conversionsByCode.get(allocation.materialCode) ?? [];
        const reqFactor = resolveConversionFactor(
          reqRow.unitOfMeasurementSelected as MaterialUnit,
          baseUnit,
          conversions,
        );
        const allocatedBase = toBaseQuantity(allocation.quantityAllocated, reqFactor);
        totalAllocatedBase += allocatedBase;
        allocatedBases.push({ requisitionItemId: allocation.requisitionItemId, allocatedBase });
      }

      if (totalAllocatedBase <= 0) continue;

      for (const { requisitionItemId, allocatedBase } of allocatedBases) {
        const share = allocatedBase / totalAllocatedBase;
        receivedBaseByRequisitionItemId.set(
          requisitionItemId,
          (receivedBaseByRequisitionItemId.get(requisitionItemId) ?? 0) + share * acceptedBase,
        );
      }
    }

    let requestedValue = 0;
    let orderedValue = 0;
    let receivedValue = 0;

    const items = rows.map((row) => {
      const baseUnit = row.unitOfMeasurement as MaterialUnit;
      const lineUnit = row.unitOfMeasurementSelected as MaterialUnit;
      const conversions = conversionsByCode.get(row.materialCode) ?? [];
      const lineFactor = resolveConversionFactor(lineUnit, baseUnit, conversions);
      const quantityRequested = Number(row.quantityRequested);
      const quantityOrdered = orderedQtyByRequisitionItemId.get(row.requisitionItemId) ?? 0;
      const receivedBase = receivedBaseByRequisitionItemId.get(row.requisitionItemId) ?? 0;
      const quantityReceivedRaw = lineFactor === 0 ? receivedBase : receivedBase / lineFactor;
      const quantityReceived = Math.min(quantityRequested, Math.max(0, quantityReceivedRaw));

      const lastPurchase = lastPurchaseByCode.get(row.materialCode);
      const lastPurchasePrice =
        lastPurchase != null
          ? convertUnitPrice(lastPurchase.unitPrice, lastPurchase.purchaseUnit, lineUnit, baseUnit, conversions)
          : null;

      const requestedLineValue = lastPurchasePrice != null ? quantityRequested * lastPurchasePrice : null;
      const orderedLineValue = lastPurchasePrice != null ? quantityOrdered * lastPurchasePrice : null;
      const receivedLineValue = lastPurchasePrice != null ? quantityReceived * lastPurchasePrice : null;

      if (requestedLineValue != null) requestedValue += requestedLineValue;
      if (orderedLineValue != null) orderedValue += orderedLineValue;
      if (receivedLineValue != null) receivedValue += receivedLineValue;

      return {
        requisitionItemId: row.requisitionItemId,
        requisitionId: row.requisitionId,
        requisitionCode: row.requisitionCode,
        materialCode: row.materialCode,
        materialTitle: row.materialTitle,
        unitOfMeasurementSelected: lineUnit,
        quantityRequested,
        quantityOrdered,
        quantityReceived,
        lastPurchasePrice,
        requestedValue: requestedLineValue,
        orderedValue: orderedLineValue,
        receivedValue: receivedLineValue,
        notes: row.itemNotes?.trim() || row.requisitionNotes || null,
      };
    });

    return {
      productionSubDepartment: dept,
      items,
      totals: { requestedValue, orderedValue, receivedValue },
      missingPriceCount: items.filter((item) => item.lastPurchasePrice == null).length,
    };
  }

  // ============================== PRIVATE METHODS ==============================

  private async getLastPurchasePriceByMaterialCode(materialCodes: string[]) {
    const uniqueCodes = [...new Set(materialCodes)];
    if (uniqueCodes.length === 0) {
      return new Map<string, { unitPrice: number; purchaseUnit: MaterialUnit }>();
    }

    const purchaseRows = await this.db
      .selectDistinctOn([materialPurchaseOrderItems.materialCode], {
        materialCode: materialPurchaseOrderItems.materialCode,
        unitPrice: materialPurchaseOrderItems.unitPrice,
        unitOfMeasurementSelected: materialPurchaseOrderItems.unitOfMeasurementSelected,
      })
      .from(materialPurchaseOrderItems)
      .innerJoin(materialPurchaseOrders, eq(materialPurchaseOrderItems.materialPurchaseOrderId, materialPurchaseOrders.id))
      .where(and(inArray(materialPurchaseOrderItems.materialCode, uniqueCodes), isNull(materialPurchaseOrders.cancelledAt)))
      .orderBy(materialPurchaseOrderItems.materialCode, desc(materialPurchaseOrders.createdAt));

    return new Map(
      purchaseRows.map((row) => [
        row.materialCode,
        {
          unitPrice: Number(row.unitPrice),
          purchaseUnit: row.unitOfMeasurementSelected as MaterialUnit,
        },
      ]),
    );
  }

  private parseGroupBy(value?: string): GroupBy {
    if (value && (VALID_GROUP_BY as readonly string[]).includes(value)) return value as GroupBy;
    return 'month';
  }

  private parsePriceOutlierThreshold(value?: string): number {
    if (value == null || value === '') return PRICE_OUTLIER_DEFAULT_THRESHOLD;
    const n = Number(value);
    if (!Number.isFinite(n) || n < PRICE_OUTLIER_MIN_THRESHOLD) {
      throw new BadRequestException(
        translate(
          `Threshold must be a number of at least ${PRICE_OUTLIER_MIN_THRESHOLD}.`,
          `يجب أن يكون حد الحساسية رقما لا يقل عن ${PRICE_OUTLIER_MIN_THRESHOLD}.`,
        ),
      );
    }
    return n;
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
        totalQuantity: sql<number>`coalesce(sum(${quantityOrderedInBase}), 0)`,
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
        totalQuantity: sql<number>`coalesce(sum(${quantityOrderedInBase}), 0)`,
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
        invoiceNumbers: orderInvoiceNumbers,
        supplierId: suppliers.id,
        supplierName: suppliers.name,
        invoiceTotalPurchases: invoiceTotalPurchases,
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
      invoiceNumbers: (r.invoiceNumbers ?? []).filter((n): n is string => n != null),
      supplierId: r.supplierId,
      supplierName: r.supplierName,
      invoiceTotalPurchases: Number(r.invoiceTotalPurchases),
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
        totalQuantity: sql<number>`coalesce(sum(${quantityOrderedInBase}), 0)`,
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
        invoiceNumbers: orderInvoiceNumbers,
        invoiceIssuedAt: orderLatestInvoiceIssuedAt,
        supplierId: suppliers.id,
        supplierName: suppliers.name,
        invoiceTotalPurchases: invoiceTotalPurchases,
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
        suppliers.id,
        suppliers.name,
        materialPurchaseOrders.createdAt,
        materialPurchaseOrders.completedAt,
      )
      .orderBy(desc(orderLatestInvoiceIssuedAt), desc(materialPurchaseOrders.createdAt));

    const orderIds = rows.map((r) => r.orderId);
    const legacyByOrderId = await this.getInventoryTransactionLegacyNumbersByOrderIds(orderIds);

    return rows.map((r) => ({
      orderId: r.orderId,
      orderCode: r.orderCode,
      invoiceNumbers: (r.invoiceNumbers ?? []).filter((n): n is string => n != null),
      invoiceIssuedAt: r.invoiceIssuedAt,
      supplierId: r.supplierId,
      supplierName: r.supplierName,
      invoiceTotalPurchases: Number(r.invoiceTotalPurchases),
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
        totalQuantity: sql<number>`coalesce(sum(${quantityOrderedInBase}), 0)`,
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
        totalQuantity: sql<number>`coalesce(sum(${quantityOrderedInBase}), 0)`,
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
        totalQuantity: sql<number>`coalesce(sum(${quantityOrderedInBase}), 0)`,
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
        invoiceNumbers: orderInvoiceNumbers,
        invoiceIssuedAt: orderLatestInvoiceIssuedAt,
        invoiceTotalPurchases: invoiceTotalPurchases,
        createdAt: materialPurchaseOrders.createdAt,
        completedAt: materialPurchaseOrders.completedAt,
      })
      .from(materialPurchaseOrders)
      .where(where)
      .orderBy(desc(orderLatestInvoiceIssuedAt), desc(materialPurchaseOrders.createdAt));

    const orderIds = rows.map((r) => r.orderId);
    const legacyByOrderId = await this.getInventoryTransactionLegacyNumbersByOrderIds(orderIds);

    return rows.map((r) => ({
      orderId: r.orderId,
      orderCode: r.orderCode,
      invoiceNumbers: (r.invoiceNumbers ?? []).filter((n): n is string => n != null),
      invoiceIssuedAt: r.invoiceIssuedAt,
      invoiceTotalPurchases: Number(r.invoiceTotalPurchases),
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
        totalQuantity: sql<number>`coalesce(sum(${quantityOrderedInBase}), 0)`,
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

  private async loadConversionFactorsByMaterial(materialCodes: string[]): Promise<Map<string, number[]>> {
    const codes = [...new Set(materialCodes.filter(Boolean))];
    const byCode = new Map<string, number[]>();
    if (codes.length === 0) return byCode;

    const conversions = await this.db
      .select({
        materialCode: materialUnitConversions.materialCode,
        conversionFactorToBase: materialUnitConversions.conversionFactorToBase,
      })
      .from(materialUnitConversions)
      .where(inArray(materialUnitConversions.materialCode, codes));

    for (const conversion of conversions) {
      const factor = toFinitePositiveNumber(conversion.conversionFactorToBase);
      if (factor == null || Math.abs(factor - 1) < 0.001) continue;
      const list = byCode.get(conversion.materialCode) ?? [];
      list.push(factor);
      byCode.set(conversion.materialCode, list);
    }

    return byCode;
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
