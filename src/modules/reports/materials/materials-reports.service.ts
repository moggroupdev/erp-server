import { Inject, Injectable } from '@nestjs/common';
import { and, asc, count, desc, eq, isNotNull, isNull, lte, sql } from 'drizzle-orm';
import { DRIZZLE, type DrizzleDB } from 'src/database/database.constants';
import { materialCategoryMains, materialCategorySubs, materials } from 'src/database/schema';
import { MATERIAL_TYPE_VALUES } from 'src/utils/constants';

const STOCK_STATUS_VALUES = ['out_of_stock', 'low_stock', 'in_stock', 'no_minimum_set'] as const;

type StockStatus = (typeof STOCK_STATUS_VALUES)[number];

const TOP_MATERIALS_LIMIT = 10;
const LOW_STOCK_LIMIT = 20;

@Injectable()
export class MaterialsReportsService {
  constructor(@Inject(DRIZZLE) private db: DrizzleDB) {}

  public async getInventorySummary() {
    const active = isNull(materials.deletedAt);
    const valueExpr = sql<number>`coalesce(${materials.quantity}, 0) * coalesce(${materials.unitCost}, 0)`;
    const openingValueExpr = sql<number>`coalesce(${materials.openingQuantity}, 0) * coalesce(${materials.openingUnitCost}, 0)`;

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

  // ============================== PRIVATE METHODS ==============================

  private async getOverview(
    active: ReturnType<typeof isNull>,
    valueExpr: ReturnType<typeof sql<number>>,
    openingValueExpr: ReturnType<typeof sql<number>>,
  ) {
    const [row] = await this.db
      .select({
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
      })
      .from(materials)
      .where(active);

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

  private async getByMaterialType(active: ReturnType<typeof isNull>, valueExpr: ReturnType<typeof sql<number>>) {
    const rows = await this.db
      .select({
        materialType: materials.materialType,
        count: count(),
        totalQuantity: sql<number>`coalesce(sum(coalesce(${materials.quantity}, 0)), 0)`,
        totalValue: sql<number>`coalesce(sum(${valueExpr}), 0)`,
      })
      .from(materials)
      .where(active)
      .groupBy(materials.materialType);

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

  private async getByMainCategory(active: ReturnType<typeof isNull>, valueExpr: ReturnType<typeof sql<number>>) {
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
      .where(active)
      .groupBy(materialCategoryMains.id, materialCategoryMains.title)
      .orderBy(desc(sql`coalesce(sum(${valueExpr}), 0)`));

    return rows.map((row) => ({
      mainCategoryId: row.mainCategoryId,
      mainCategoryTitle: row.mainCategoryTitle,
      count: Number(row.count),
      totalValue: Number(row.totalValue),
    }));
  }

  private async getStockStatus(active: ReturnType<typeof isNull>, valueExpr: ReturnType<typeof sql<number>>) {
    const statusExpr = sql<StockStatus>`
      case
        when coalesce(${materials.quantity}, 0) = 0 then 'out_of_stock'
        when ${materials.minimumStock} is null then 'no_minimum_set'
        when coalesce(${materials.quantity}, 0) <= ${materials.minimumStock} then 'low_stock'
        else 'in_stock'
      end
    `;

    const rows = await this.db
      .select({
        status: statusExpr,
        count: count(),
        totalValue: sql<number>`coalesce(sum(${valueExpr}), 0)`,
      })
      .from(materials)
      .where(active)
      .groupBy(statusExpr);

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
    active: ReturnType<typeof isNull>,
    valueExpr: ReturnType<typeof sql<number>>,
    topLimit: number,
  ) {
    const rows = await this.db
      .select({
        code: materials.code,
        title: materials.title,
        unit: materials.unit,
        quantity: materials.quantity,
        unitCost: materials.unitCost,
        value: valueExpr,
      })
      .from(materials)
      .where(active)
      .orderBy(desc(valueExpr))
      .limit(topLimit);

    return rows.map((row) => ({
      code: row.code,
      title: row.title,
      unit: row.unit,
      quantity: Number(row.quantity),
      unitCost: Number(row.unitCost),
      value: Number(row.value),
    }));
  }

  private async getLowStockMaterials(active: ReturnType<typeof isNull>, lowStockLimit: number) {
    const deficitExpr = sql<number>`coalesce(${materials.minimumStock}, 0) - coalesce(${materials.quantity}, 0)`;

    const rows = await this.db
      .select({
        code: materials.code,
        title: materials.title,
        quantity: materials.quantity,
        minimumStock: materials.minimumStock,
        deficit: deficitExpr,
      })
      .from(materials)
      .where(and(active, isNotNull(materials.minimumStock), lte(materials.quantity, materials.minimumStock)))
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
