import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, count, desc, eq, isNotNull, isNull, lte, sql, type SQL } from 'drizzle-orm';
import { DRIZZLE, type DrizzleDB } from 'src/database/database.constants';
import { materialCategoryMains, materialCategorySubs, materials } from 'src/database/schema';
import { MATERIAL_TYPE_VALUES } from 'src/utils/constants';
import { translate } from 'src/utils/i18n/translate';

const STOCK_STATUS_VALUES = ['out_of_stock', 'low_stock', 'in_stock'] as const;

type StockStatus = (typeof STOCK_STATUS_VALUES)[number];

const TOP_MATERIALS_LIMIT = 10;
const LOW_STOCK_LIMIT = 20;

@Injectable()
export class MaterialsReportsService {
  constructor(@Inject(DRIZZLE) private db: DrizzleDB) {}

  public async getInventorySummary() {
    const active = isNull(materials.deletedAt);
    const valueExpr = sql<number>`coalesce(${materials.quantity}, 0) * coalesce(${materials.unitPrice}, 0)`;
    const openingValueExpr = sql<number>`coalesce(${materials.openingQuantity}, 0) * coalesce(${materials.openingUnitPrice}, 0)`;

    const [overviewRow, byMaterialTypeRows, byMainCategoryRows, stockStatusRows, topMaterialsByValue, lowStockMaterials] =
      await Promise.all([
        this.getOverview(active, valueExpr, openingValueExpr),
        this.getByMaterialType(active, valueExpr),
        this.getByMainCategory(active, valueExpr),
        this.getStockStatus(active, valueExpr),
        this.getTopMaterialsByValue(active, valueExpr, TOP_MATERIALS_LIMIT),
        this.getLowStockMaterials(active, LOW_STOCK_LIMIT),
      ]);

    return {
      overview: overviewRow,
      byMaterialType: byMaterialTypeRows,
      byMainCategory: byMainCategoryRows,
      stockStatus: stockStatusRows,
      topMaterialsByValue,
      lowStockMaterials,
    };
  }

  public async getCategoryStats(mainCategoryId: string) {
    const [category] = await this.db
      .select({ id: materialCategoryMains.id, title: materialCategoryMains.title })
      .from(materialCategoryMains)
      .where(eq(materialCategoryMains.id, mainCategoryId))
      .limit(1);

    if (!category) {
      throw new NotFoundException(
        translate(
          `Material main category with ID ${mainCategoryId} does not exist.`,
          `لا توجد فئة مواد رئيسية بالمعرف ${mainCategoryId}.`,
        ),
      );
    }

    const scoped = and(isNull(materials.deletedAt), eq(materialCategorySubs.mainCategoryId, mainCategoryId))!;
    const valueExpr = sql<number>`coalesce(${materials.quantity}, 0) * coalesce(${materials.unitPrice}, 0)`;
    const openingValueExpr = sql<number>`coalesce(${materials.openingQuantity}, 0) * coalesce(${materials.openingUnitPrice}, 0)`;

    const [overview, byMaterialType, stockStatus, bySubCategory, topMaterialsByValue, lowStockMaterials] = await Promise.all(
      [
        this.getOverview(scoped, valueExpr, openingValueExpr, { joinSubs: true }),
        this.getByMaterialType(scoped, valueExpr, { joinSubs: true }),
        this.getStockStatus(scoped, valueExpr, { joinSubs: true }),
        this.getBySubCategory(scoped, valueExpr),
        this.getTopMaterialsByValue(scoped, valueExpr, TOP_MATERIALS_LIMIT, { joinSubs: true }),
        this.getLowStockMaterials(scoped, LOW_STOCK_LIMIT, { joinSubs: true }),
      ],
    );

    return {
      category,
      overview,
      byMaterialType,
      stockStatus,
      bySubCategory,
      topMaterialsByValue,
      lowStockMaterials,
    };
  }

  // ============================== PRIVATE METHODS ==============================

  private async getOverview(
    where: SQL,
    valueExpr: ReturnType<typeof sql<number>>,
    openingValueExpr: ReturnType<typeof sql<number>>,
    options?: { joinSubs?: boolean },
  ) {
    const selectFields = {
      totalMaterials: count(),
      totalInventoryValue: sql<number>`coalesce(sum(${valueExpr}), 0)`,
      totalOpeningValue: sql<number>`coalesce(sum(${openingValueExpr}), 0)`,
      outOfStockCount: sql<number>`count(*) filter (where coalesce(${materials.quantity}, 0) = 0)`,
      lowStockCount: sql<number>`count(*) filter (
          where ${materials.minimumStock} is not null
          and coalesce(${materials.quantity}, 0) > 0
          and coalesce(${materials.quantity}, 0) <= ${materials.minimumStock}
        )`,
      noMinimumStockCount: sql<number>`count(*) filter (where ${materials.minimumStock} is null)`,
    };

    const [row] = options?.joinSubs
      ? await this.db
          .select(selectFields)
          .from(materials)
          .innerJoin(materialCategorySubs, eq(materials.subCategoryId, materialCategorySubs.id))
          .where(where)
      : await this.db.select(selectFields).from(materials).where(where);

    const totalInventoryValue = Number(row?.totalInventoryValue ?? 0);
    const totalOpeningValue = Number(row?.totalOpeningValue ?? 0);
    const valueChangeAmount = totalInventoryValue - totalOpeningValue;
    const valueChangePercentage = totalOpeningValue === 0 ? 0 : (valueChangeAmount / totalOpeningValue) * 100;

    return {
      totalMaterials: Number(row?.totalMaterials ?? 0),
      totalInventoryValue,
      totalOpeningValue,
      valueChangeAmount,
      valueChangePercentage,
      outOfStockCount: Number(row?.outOfStockCount ?? 0),
      lowStockCount: Number(row?.lowStockCount ?? 0),
      noMinimumStockCount: Number(row?.noMinimumStockCount ?? 0),
    };
  }

  private async getByMaterialType(where: SQL, valueExpr: ReturnType<typeof sql<number>>, options?: { joinSubs?: boolean }) {
    const selectFields = {
      materialType: materials.materialType,
      count: count(),
      totalQuantity: sql<number>`coalesce(sum(coalesce(${materials.quantity}, 0)), 0)`,
      totalValue: sql<number>`coalesce(sum(${valueExpr}), 0)`,
    };

    const rows = options?.joinSubs
      ? await this.db
          .select(selectFields)
          .from(materials)
          .innerJoin(materialCategorySubs, eq(materials.subCategoryId, materialCategorySubs.id))
          .where(where)
          .groupBy(materials.materialType)
      : await this.db.select(selectFields).from(materials).where(where).groupBy(materials.materialType);

    const byKey = new Map(rows.map((r) => [r.materialType, r]));

    return MATERIAL_TYPE_VALUES.map((materialType) => {
      const row = byKey.get(materialType);
      return {
        materialType,
        count: Number(row?.count ?? 0),
        totalQuantity: Number(row?.totalQuantity ?? 0),
        totalValue: Number(row?.totalValue ?? 0),
      };
    });
  }

  private async getByMainCategory(where: SQL, valueExpr: ReturnType<typeof sql<number>>) {
    const rows = await this.db
      .select({
        mainCategoryId: materialCategoryMains.id,
        mainCategoryTitle: materialCategoryMains.title,
        count: count(),
        totalValue: sql<number>`coalesce(sum(${valueExpr}), 0)`,
      })
      .from(materials)
      .innerJoin(materialCategorySubs, eq(materials.subCategoryId, materialCategorySubs.id))
      .innerJoin(materialCategoryMains, eq(materialCategorySubs.mainCategoryId, materialCategoryMains.id))
      .where(where)
      .groupBy(materialCategoryMains.id, materialCategoryMains.title)
      .orderBy(desc(sql`coalesce(sum(${valueExpr}), 0)`));

    return rows.map((row) => ({
      mainCategoryId: row.mainCategoryId,
      mainCategoryTitle: row.mainCategoryTitle,
      count: Number(row.count),
      totalValue: Number(row.totalValue),
    }));
  }

  private async getBySubCategory(where: SQL, valueExpr: ReturnType<typeof sql<number>>) {
    const rows = await this.db
      .select({
        subCategoryId: materialCategorySubs.id,
        subCategoryTitle: materialCategorySubs.title,
        count: count(),
        totalValue: sql<number>`coalesce(sum(${valueExpr}), 0)`,
      })
      .from(materials)
      .innerJoin(materialCategorySubs, eq(materials.subCategoryId, materialCategorySubs.id))
      .where(where)
      .groupBy(materialCategorySubs.id, materialCategorySubs.title)
      .orderBy(desc(sql`coalesce(sum(${valueExpr}), 0)`));

    return rows.map((row) => ({
      subCategoryId: row.subCategoryId,
      subCategoryTitle: row.subCategoryTitle,
      count: Number(row.count),
      totalValue: Number(row.totalValue),
    }));
  }

  private async getStockStatus(where: SQL, valueExpr: ReturnType<typeof sql<number>>, options?: { joinSubs?: boolean }) {
    const statusExpr = sql<StockStatus>`
      case
        when coalesce(${materials.quantity}, 0) = 0 then 'out_of_stock'
        when ${materials.minimumStock} is not null
          and coalesce(${materials.quantity}, 0) <= ${materials.minimumStock} then 'low_stock'
        else 'in_stock'
      end
    `;

    const selectFields = {
      status: statusExpr,
      count: count(),
      totalValue: sql<number>`coalesce(sum(${valueExpr}), 0)`,
    };

    const rows = options?.joinSubs
      ? await this.db
          .select(selectFields)
          .from(materials)
          .innerJoin(materialCategorySubs, eq(materials.subCategoryId, materialCategorySubs.id))
          .where(where)
          .groupBy(statusExpr)
      : await this.db.select(selectFields).from(materials).where(where).groupBy(statusExpr);

    const byKey = new Map(rows.map((r) => [r.status, r]));

    return STOCK_STATUS_VALUES.map((status) => {
      const row = byKey.get(status);
      return {
        status,
        count: Number(row?.count ?? 0),
        totalValue: Number(row?.totalValue ?? 0),
      };
    });
  }

  private async getTopMaterialsByValue(
    where: SQL,
    valueExpr: ReturnType<typeof sql<number>>,
    topLimit: number,
    options?: { joinSubs?: boolean },
  ) {
    const selectFields = {
      code: materials.code,
      title: materials.title,
      unitOfMeasurement: materials.unitOfMeasurement,
      quantity: materials.quantity,
      unitPrice: materials.unitPrice,
      value: valueExpr,
    };

    const rows = options?.joinSubs
      ? await this.db
          .select(selectFields)
          .from(materials)
          .innerJoin(materialCategorySubs, eq(materials.subCategoryId, materialCategorySubs.id))
          .where(where)
          .orderBy(desc(valueExpr))
          .limit(topLimit)
      : await this.db.select(selectFields).from(materials).where(where).orderBy(desc(valueExpr)).limit(topLimit);

    return rows.map((row) => ({
      code: row.code,
      title: row.title,
      unitOfMeasurement: row.unitOfMeasurement,
      quantity: Number(row.quantity),
      unitPrice: Number(row.unitPrice),
      value: Number(row.value),
    }));
  }

  private async getLowStockMaterials(where: SQL, lowStockLimit: number, options?: { joinSubs?: boolean }) {
    const deficitExpr = sql<number>`coalesce(${materials.minimumStock}, 0) - coalesce(${materials.quantity}, 0)`;
    const selectFields = {
      code: materials.code,
      title: materials.title,
      quantity: materials.quantity,
      minimumStock: materials.minimumStock,
      deficit: deficitExpr,
    };
    const lowStockWhere = and(where, isNotNull(materials.minimumStock), lte(materials.quantity, materials.minimumStock));

    const rows = options?.joinSubs
      ? await this.db
          .select(selectFields)
          .from(materials)
          .innerJoin(materialCategorySubs, eq(materials.subCategoryId, materialCategorySubs.id))
          .where(lowStockWhere)
          .orderBy(desc(deficitExpr), asc(materials.title))
          .limit(lowStockLimit)
      : await this.db
          .select(selectFields)
          .from(materials)
          .where(lowStockWhere)
          .orderBy(desc(deficitExpr), asc(materials.title))
          .limit(lowStockLimit);

    return rows.map((row) => ({
      code: row.code,
      title: row.title,
      quantity: Number(row.quantity),
      minimumStock: Number(row.minimumStock),
      deficit: Number(row.deficit),
    }));
  }
}
