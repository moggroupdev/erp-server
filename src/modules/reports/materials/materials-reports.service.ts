import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, count, desc, eq, gte, inArray, isNotNull, isNull, lte, ne, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { DRIZZLE, type DrizzleDB } from 'src/database/database.constants';
import {
  customers,
  legacyIssuePermitItems,
  legacyIssuePermits,
  materialCategoryMains,
  materialCategorySubs,
  materials,
  materialUnitConversions,
  users,
} from 'src/database/schema';
import type { MaterialUnitConversionSummary } from 'src/utils/extras/material-unit-conversions-extra';
import { getKnownConversionFactorToBase, resolveConversionFactor, toBaseQuantity } from 'src/utils/helpers/unit-conversion';
import {
  LEGACY_ISSUE_PERMIT_MAINTENANCE_ORDER_TYPE_VALUES,
  LEGACY_ISSUE_PERMIT_TYPE_VALUES,
  LEGACY_ISSUE_PERMIT_TYPES,
  MATERIAL_TYPE_VALUES,
  PRODUCTION_SUB_DEPARTMENT_VALUES,
} from 'src/utils/constants';
import { translate } from 'src/utils/i18n/translate';
import type { MaterialUnit } from 'src/utils/types';

const STOCK_STATUS_VALUES = ['out_of_stock', 'low_stock', 'in_stock'] as const;

type StockStatus = (typeof STOCK_STATUS_VALUES)[number];

const TOP_MATERIALS_LIMIT = 10;
const LOW_STOCK_LIMIT = 20;
const LEGACY_ISSUE_PERMIT_TOP_MATERIALS_LIMIT = 15;
const LEGACY_ISSUE_PERMIT_TOP_CUSTOMERS_LIMIT = 10;
const LEGACY_ISSUE_PERMIT_TOP_CREATORS_LIMIT = 10;
const LEGACY_ISSUE_PERMIT_NOTES_LIST_LIMIT = 30;

@Injectable()
export class MaterialsReportsService {
  constructor(@Inject(DRIZZLE) private db: DrizzleDB) {}

  public async getInventorySummary() {
    const active = isNull(materials.deletedAt);
    const valueExpr = sql<number>`coalesce(${materials.quantity}, 0) * coalesce(${materials.unitPrice}, 0)`;
    const openingValueExpr = sql<number>`coalesce(${materials.openingQuantity}, 0) * coalesce(${materials.openingUnitPrice}, 0)`;

    const [
      overviewRow,
      byMaterialTypeRows,
      byMainCategoryRows,
      stockStatusRows,
      topMaterialsByValue,
      topMaterialsByQuantity,
      lowStockMaterials,
    ] = await Promise.all([
      this.getOverview(active, valueExpr, openingValueExpr),
      this.getByMaterialType(active, valueExpr),
      this.getByMainCategory(active, valueExpr),
      this.getStockStatus(active, valueExpr),
      this.getTopMaterialsByValue(active, valueExpr, TOP_MATERIALS_LIMIT),
      this.getTopMaterialsByQuantity(active, valueExpr, TOP_MATERIALS_LIMIT),
      this.getLowStockMaterials(active, LOW_STOCK_LIMIT),
    ]);

    return {
      overview: overviewRow,
      byMaterialType: byMaterialTypeRows,
      byMainCategory: byMainCategoryRows,
      stockStatus: stockStatusRows,
      topMaterialsByValue,
      topMaterialsByQuantity,
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

    const [
      overview,
      byMaterialType,
      stockStatus,
      bySubCategory,
      topMaterialsByValue,
      topMaterialsByQuantity,
      lowStockMaterials,
    ] = await Promise.all([
      this.getOverview(scoped, valueExpr, openingValueExpr, { joinSubs: true }),
      this.getByMaterialType(scoped, valueExpr, { joinSubs: true }),
      this.getStockStatus(scoped, valueExpr, { joinSubs: true }),
      this.getBySubCategory(scoped, valueExpr),
      this.getTopMaterialsByValue(scoped, valueExpr, TOP_MATERIALS_LIMIT, { joinSubs: true }),
      this.getTopMaterialsByQuantity(scoped, valueExpr, TOP_MATERIALS_LIMIT, { joinSubs: true }),
      this.getLowStockMaterials(scoped, LOW_STOCK_LIMIT, { joinSubs: true }),
    ]);

    return {
      category,
      overview,
      byMaterialType,
      stockStatus,
      bySubCategory,
      topMaterialsByValue,
      topMaterialsByQuantity,
      lowStockMaterials,
    };
  }

  public async getLegacyIssuePermitSummary(params: { from?: string; to?: string }) {
    const dateRange = this.buildDateRange(params.from, params.to);
    const permitConditions: SQL[] = [];
    if (dateRange.from) permitConditions.push(gte(legacyIssuePermits.date, dateRange.from));
    if (dateRange.to) permitConditions.push(lte(legacyIssuePermits.date, dateRange.to));
    const permitWhere = permitConditions.length > 0 ? and(...permitConditions) : undefined;

    const [
      overview,
      byPermitType,
      byProductionSubDepartment,
      byMaintenanceOrderType,
      byMonth,
      topCustomers,
      topCreators,
      dataQuality,
      headerNotes,
      lineNotes,
      topMaterials,
    ] = await Promise.all([
      this.getLegacyIssuePermitOverview(permitWhere),
      this.getLegacyIssuePermitByPermitType(permitWhere),
      this.getLegacyIssuePermitByProductionSubDepartment(permitWhere),
      this.getLegacyIssuePermitByMaintenanceOrderType(permitWhere),
      this.getLegacyIssuePermitByMonth(permitWhere),
      this.getLegacyIssuePermitTopCustomers(permitWhere),
      this.getLegacyIssuePermitTopCreators(permitWhere),
      this.getLegacyIssuePermitDataQuality(permitWhere),
      this.getLegacyIssuePermitHeaderNotes(permitWhere),
      this.getLegacyIssuePermitLineNotes(permitWhere),
      this.getLegacyIssuePermitTopMaterials(permitWhere),
    ]);

    return {
      overview,
      byPermitType,
      byProductionSubDepartment,
      byMaintenanceOrderType,
      byMonth,
      topMaterials,
      topCustomers,
      topCreators,
      dataQuality,
      headerNotes,
      lineNotes,
    };
  }

  private async getLegacyIssuePermitOverview(permitWhere: SQL | undefined) {
    const [permitRow] = await this.db
      .select({
        permitCount: count(),
        activePermitCount: sql<number>`count(*) filter (where ${legacyIssuePermits.isCancelled} = false)`,
        cancelledPermitCount: sql<number>`count(*) filter (where ${legacyIssuePermits.isCancelled} = true)`,
        permitsWithIssueOrder: sql<number>`count(*) filter (where ${legacyIssuePermits.issueOrderNumber} is not null)`,
        multipleCustomerPermitCount: sql<number>`count(*) filter (where ${legacyIssuePermits.hasMultipleCustomers} = true)`,
        distinctCustomerCount: sql<number>`count(distinct ${legacyIssuePermits.customerId})`,
        distinctCreatorCount: sql<number>`count(distinct ${legacyIssuePermits.creatorId})`,
        headerNoteCount: sql<number>`count(*) filter (
          where ${legacyIssuePermits.notes} is not null and btrim(${legacyIssuePermits.notes}) <> ''
        )`,
        minDate: sql<Date | null>`min(${legacyIssuePermits.date})`,
        maxDate: sql<Date | null>`max(${legacyIssuePermits.date})`,
      })
      .from(legacyIssuePermits)
      .where(permitWhere);

    const itemJoinWhere = permitWhere
      ? and(eq(legacyIssuePermitItems.issuePermitId, legacyIssuePermits.id), permitWhere)
      : eq(legacyIssuePermitItems.issuePermitId, legacyIssuePermits.id);

    const [itemRow] = await this.db
      .select({
        itemCount: count(),
        materialLineCount: sql<number>`count(*) filter (where ${legacyIssuePermitItems.materialCode} is not null)`,
        noteOnlyLineCount: sql<number>`count(*) filter (where ${legacyIssuePermitItems.materialCode} is null)`,
        lineNoteCount: sql<number>`count(*) filter (
          where ${legacyIssuePermitItems.notes} is not null and btrim(${legacyIssuePermitItems.notes}) <> ''
        )`,
        distinctMaterialCount: sql<number>`count(distinct ${legacyIssuePermitItems.materialCode})`,
      })
      .from(legacyIssuePermitItems)
      .innerJoin(legacyIssuePermits, eq(legacyIssuePermitItems.issuePermitId, legacyIssuePermits.id))
      .where(itemJoinWhere);

    const emptyPermitConditions: SQL[] = [
      sql`not exists (
        select 1 from ${legacyIssuePermitItems}
        where ${legacyIssuePermitItems.issuePermitId} = ${legacyIssuePermits.id}
      )`,
    ];
    if (permitWhere) emptyPermitConditions.push(permitWhere);

    const [emptyRow] = await this.db
      .select({ emptyPermitCount: count() })
      .from(legacyIssuePermits)
      .where(and(...emptyPermitConditions));

    return {
      permitCount: Number(permitRow?.permitCount ?? 0),
      activePermitCount: Number(permitRow?.activePermitCount ?? 0),
      cancelledPermitCount: Number(permitRow?.cancelledPermitCount ?? 0),
      itemCount: Number(itemRow?.itemCount ?? 0),
      materialLineCount: Number(itemRow?.materialLineCount ?? 0),
      noteOnlyLineCount: Number(itemRow?.noteOnlyLineCount ?? 0),
      emptyPermitCount: Number(emptyRow?.emptyPermitCount ?? 0),
      permitsWithIssueOrder: Number(permitRow?.permitsWithIssueOrder ?? 0),
      multipleCustomerPermitCount: Number(permitRow?.multipleCustomerPermitCount ?? 0),
      distinctMaterialCount: Number(itemRow?.distinctMaterialCount ?? 0),
      distinctCustomerCount: Number(permitRow?.distinctCustomerCount ?? 0),
      distinctCreatorCount: Number(permitRow?.distinctCreatorCount ?? 0),
      minDate: permitRow?.minDate ?? null,
      maxDate: permitRow?.maxDate ?? null,
      headerNoteCount: Number(permitRow?.headerNoteCount ?? 0),
      lineNoteCount: Number(itemRow?.lineNoteCount ?? 0),
    };
  }

  private async getLegacyIssuePermitByPermitType(permitWhere: SQL | undefined) {
    const rows = await this.db
      .select({
        permitType: legacyIssuePermits.permitType,
        permitCount: count(),
        cancelledCount: sql<number>`count(*) filter (where ${legacyIssuePermits.isCancelled} = true)`,
        headerNoteCount: sql<number>`count(*) filter (
          where ${legacyIssuePermits.notes} is not null and btrim(${legacyIssuePermits.notes}) <> ''
        )`,
      })
      .from(legacyIssuePermits)
      .where(permitWhere)
      .groupBy(legacyIssuePermits.permitType);

    const itemRows = await this.db
      .select({
        permitType: legacyIssuePermits.permitType,
        itemCount: count(),
      })
      .from(legacyIssuePermitItems)
      .innerJoin(legacyIssuePermits, eq(legacyIssuePermitItems.issuePermitId, legacyIssuePermits.id))
      .where(permitWhere)
      .groupBy(legacyIssuePermits.permitType);

    const byKey = new Map(
      rows.map((row) => [
        row.permitType,
        {
          permitCount: Number(row.permitCount),
          cancelledCount: Number(row.cancelledCount),
          headerNoteCount: Number(row.headerNoteCount),
          itemCount: 0,
        },
      ]),
    );
    for (const row of itemRows) {
      const existing = byKey.get(row.permitType) ?? {
        permitCount: 0,
        cancelledCount: 0,
        headerNoteCount: 0,
        itemCount: 0,
      };
      existing.itemCount = Number(row.itemCount);
      byKey.set(row.permitType, existing);
    }

    return LEGACY_ISSUE_PERMIT_TYPE_VALUES.map((permitType) => {
      const row = byKey.get(permitType);
      return {
        permitType,
        permitCount: row?.permitCount ?? 0,
        cancelledCount: row?.cancelledCount ?? 0,
        itemCount: row?.itemCount ?? 0,
        headerNoteCount: row?.headerNoteCount ?? 0,
      };
    });
  }

  private async getLegacyIssuePermitByProductionSubDepartment(permitWhere: SQL | undefined) {
    const rows = await this.db
      .select({
        productionSubDepartment: legacyIssuePermits.productionSubDepartment,
        permitCount: count(),
        cancelledCount: sql<number>`count(*) filter (where ${legacyIssuePermits.isCancelled} = true)`,
        headerNoteCount: sql<number>`count(*) filter (
          where ${legacyIssuePermits.notes} is not null and btrim(${legacyIssuePermits.notes}) <> ''
        )`,
      })
      .from(legacyIssuePermits)
      .where(permitWhere)
      .groupBy(legacyIssuePermits.productionSubDepartment);

    const itemRows = await this.db
      .select({
        productionSubDepartment: legacyIssuePermits.productionSubDepartment,
        itemCount: count(),
      })
      .from(legacyIssuePermitItems)
      .innerJoin(legacyIssuePermits, eq(legacyIssuePermitItems.issuePermitId, legacyIssuePermits.id))
      .where(permitWhere)
      .groupBy(legacyIssuePermits.productionSubDepartment);

    const byKey = new Map<
      string | null,
      { permitCount: number; cancelledCount: number; headerNoteCount: number; itemCount: number }
    >();
    for (const row of rows) {
      byKey.set(row.productionSubDepartment, {
        permitCount: Number(row.permitCount),
        cancelledCount: Number(row.cancelledCount),
        headerNoteCount: Number(row.headerNoteCount),
        itemCount: 0,
      });
    }
    for (const row of itemRows) {
      const existing = byKey.get(row.productionSubDepartment) ?? {
        permitCount: 0,
        cancelledCount: 0,
        headerNoteCount: 0,
        itemCount: 0,
      };
      existing.itemCount = Number(row.itemCount);
      byKey.set(row.productionSubDepartment, existing);
    }

    const known = PRODUCTION_SUB_DEPARTMENT_VALUES.map((productionSubDepartment) => {
      const row = byKey.get(productionSubDepartment);
      return {
        productionSubDepartment,
        permitCount: row?.permitCount ?? 0,
        cancelledCount: row?.cancelledCount ?? 0,
        itemCount: row?.itemCount ?? 0,
        headerNoteCount: row?.headerNoteCount ?? 0,
      };
    });

    const none = byKey.get(null);
    return [
      ...known,
      {
        productionSubDepartment: null,
        permitCount: none?.permitCount ?? 0,
        cancelledCount: none?.cancelledCount ?? 0,
        itemCount: none?.itemCount ?? 0,
        headerNoteCount: none?.headerNoteCount ?? 0,
      },
    ];
  }

  private async getLegacyIssuePermitByMaintenanceOrderType(permitWhere: SQL | undefined) {
    const maintenanceWhere = permitWhere
      ? and(eq(legacyIssuePermits.permitType, LEGACY_ISSUE_PERMIT_TYPES.MAINTENANCE_ORDER), permitWhere)
      : eq(legacyIssuePermits.permitType, LEGACY_ISSUE_PERMIT_TYPES.MAINTENANCE_ORDER);

    const rows = await this.db
      .select({
        maintenanceOrderType: legacyIssuePermits.maintenanceOrderType,
        permitCount: count(),
        cancelledCount: sql<number>`count(*) filter (where ${legacyIssuePermits.isCancelled} = true)`,
        headerNoteCount: sql<number>`count(*) filter (
          where ${legacyIssuePermits.notes} is not null and btrim(${legacyIssuePermits.notes}) <> ''
        )`,
      })
      .from(legacyIssuePermits)
      .where(maintenanceWhere)
      .groupBy(legacyIssuePermits.maintenanceOrderType);

    const itemRows = await this.db
      .select({
        maintenanceOrderType: legacyIssuePermits.maintenanceOrderType,
        itemCount: count(),
      })
      .from(legacyIssuePermitItems)
      .innerJoin(legacyIssuePermits, eq(legacyIssuePermitItems.issuePermitId, legacyIssuePermits.id))
      .where(maintenanceWhere)
      .groupBy(legacyIssuePermits.maintenanceOrderType);

    const byKey = new Map<
      string | null,
      { permitCount: number; cancelledCount: number; headerNoteCount: number; itemCount: number }
    >();
    for (const row of rows) {
      byKey.set(row.maintenanceOrderType, {
        permitCount: Number(row.permitCount),
        cancelledCount: Number(row.cancelledCount),
        headerNoteCount: Number(row.headerNoteCount),
        itemCount: 0,
      });
    }
    for (const row of itemRows) {
      const existing = byKey.get(row.maintenanceOrderType) ?? {
        permitCount: 0,
        cancelledCount: 0,
        headerNoteCount: 0,
        itemCount: 0,
      };
      existing.itemCount = Number(row.itemCount);
      byKey.set(row.maintenanceOrderType, existing);
    }

    const known = LEGACY_ISSUE_PERMIT_MAINTENANCE_ORDER_TYPE_VALUES.map((maintenanceOrderType) => {
      const row = byKey.get(maintenanceOrderType);
      return {
        maintenanceOrderType,
        permitCount: row?.permitCount ?? 0,
        cancelledCount: row?.cancelledCount ?? 0,
        itemCount: row?.itemCount ?? 0,
        headerNoteCount: row?.headerNoteCount ?? 0,
      };
    });

    const none = byKey.get(null);
    return [
      ...known,
      {
        maintenanceOrderType: null,
        permitCount: none?.permitCount ?? 0,
        cancelledCount: none?.cancelledCount ?? 0,
        itemCount: none?.itemCount ?? 0,
        headerNoteCount: none?.headerNoteCount ?? 0,
      },
    ];
  }

  private async getLegacyIssuePermitByMonth(permitWhere: SQL | undefined) {
    const monthExpr = sql<string>`to_char(${legacyIssuePermits.date}, 'YYYY-MM')`;

    const rows = await this.db
      .select({
        month: monthExpr,
        permitCount: count(),
        cancelledCount: sql<number>`count(*) filter (where ${legacyIssuePermits.isCancelled} = true)`,
      })
      .from(legacyIssuePermits)
      .where(permitWhere)
      .groupBy(monthExpr)
      .orderBy(asc(monthExpr));

    const itemRows = await this.db
      .select({
        month: monthExpr,
        itemCount: count(),
      })
      .from(legacyIssuePermitItems)
      .innerJoin(legacyIssuePermits, eq(legacyIssuePermitItems.issuePermitId, legacyIssuePermits.id))
      .where(permitWhere)
      .groupBy(monthExpr);

    const itemByMonth = new Map(itemRows.map((row) => [row.month, Number(row.itemCount)]));

    return rows.map((row) => ({
      month: row.month,
      permitCount: Number(row.permitCount),
      cancelledCount: Number(row.cancelledCount),
      itemCount: itemByMonth.get(row.month) ?? 0,
    }));
  }

  private async getLegacyIssuePermitTopCustomers(permitWhere: SQL | undefined) {
    const where = permitWhere
      ? and(isNotNull(legacyIssuePermits.customerId), permitWhere)
      : isNotNull(legacyIssuePermits.customerId);

    const rows = await this.db
      .select({
        customerId: customers.id,
        customerName: customers.name,
        permitCount: count(),
      })
      .from(legacyIssuePermits)
      .innerJoin(customers, eq(legacyIssuePermits.customerId, customers.id))
      .where(where)
      .groupBy(customers.id, customers.name)
      .orderBy(desc(count()), asc(customers.name))
      .limit(LEGACY_ISSUE_PERMIT_TOP_CUSTOMERS_LIMIT);

    return rows.map((row) => ({
      customerId: row.customerId,
      customerName: row.customerName,
      permitCount: Number(row.permitCount),
    }));
  }

  private async getLegacyIssuePermitTopCreators(permitWhere: SQL | undefined) {
    const rows = await this.db
      .select({
        creatorId: users.id,
        creatorName: users.name,
        permitCount: count(),
      })
      .from(legacyIssuePermits)
      .innerJoin(users, eq(legacyIssuePermits.creatorId, users.id))
      .where(permitWhere)
      .groupBy(users.id, users.name)
      .orderBy(desc(count()), asc(users.name))
      .limit(LEGACY_ISSUE_PERMIT_TOP_CREATORS_LIMIT);

    return rows.map((row) => ({
      creatorId: row.creatorId,
      creatorName: row.creatorName,
      permitCount: Number(row.permitCount),
    }));
  }

  private async getLegacyIssuePermitDataQuality(permitWhere: SQL | undefined) {
    const contractReviewWhere = permitWhere
      ? and(eq(legacyIssuePermits.permitType, LEGACY_ISSUE_PERMIT_TYPES.CONTRACT_REVIEW), permitWhere)
      : eq(legacyIssuePermits.permitType, LEGACY_ISSUE_PERMIT_TYPES.CONTRACT_REVIEW);

    const maintenanceWhere = permitWhere
      ? and(eq(legacyIssuePermits.permitType, LEGACY_ISSUE_PERMIT_TYPES.MAINTENANCE_ORDER), permitWhere)
      : eq(legacyIssuePermits.permitType, LEGACY_ISSUE_PERMIT_TYPES.MAINTENANCE_ORDER);

    const customerScopedWhere = permitWhere
      ? and(
          inArray(legacyIssuePermits.permitType, [
            LEGACY_ISSUE_PERMIT_TYPES.CONTRACT_REVIEW,
            LEGACY_ISSUE_PERMIT_TYPES.MAINTENANCE_ORDER,
          ]),
          permitWhere,
        )
      : inArray(legacyIssuePermits.permitType, [
          LEGACY_ISSUE_PERMIT_TYPES.CONTRACT_REVIEW,
          LEGACY_ISSUE_PERMIT_TYPES.MAINTENANCE_ORDER,
        ]);

    const [
      [contractMissingNumber],
      [maintenanceMissingNumber],
      [maintenanceMissingType],
      [missingCustomer],
      missingConversionCount,
    ] = await Promise.all([
      this.db
        .select({ count: count() })
        .from(legacyIssuePermits)
        .where(and(contractReviewWhere, isNull(legacyIssuePermits.contractNumber))),
      this.db
        .select({ count: count() })
        .from(legacyIssuePermits)
        .where(and(maintenanceWhere, isNull(legacyIssuePermits.maintenanceOrderNumber))),
      this.db
        .select({ count: count() })
        .from(legacyIssuePermits)
        .where(and(maintenanceWhere, isNull(legacyIssuePermits.maintenanceOrderType))),
      this.db
        .select({ count: count() })
        .from(legacyIssuePermits)
        .where(
          and(
            customerScopedWhere,
            isNull(legacyIssuePermits.customerId),
            eq(legacyIssuePermits.hasMultipleCustomers, false),
          ),
        ),
      this.countLegacyIssuePermitMissingConversions(permitWhere),
    ]);

    return [
      {
        code: 'contract_review_missing_contract_number' as const,
        count: Number(contractMissingNumber?.count ?? 0),
        caption: {
          en: 'Contract review permits without a contract number.',
          ar: 'أذونات مراجعة العقود بدون رقم عقد.',
        },
      },
      {
        code: 'maintenance_order_missing_order_number' as const,
        count: Number(maintenanceMissingNumber?.count ?? 0),
        caption: {
          en: 'Maintenance order permits without an order number.',
          ar: 'أذونات أوامر الصيانة بدون رقم أمر.',
        },
      },
      {
        code: 'maintenance_order_missing_order_type' as const,
        count: Number(maintenanceMissingType?.count ?? 0),
        caption: {
          en: 'Maintenance order permits without an order type.',
          ar: 'أذونات أوامر الصيانة بدون نوع أمر.',
        },
      },
      {
        code: 'customer_scoped_missing_customer' as const,
        count: Number(missingCustomer?.count ?? 0),
        caption: {
          en: 'Contract review or maintenance permits with no customer and not marked as multiple customers.',
          ar: 'أذونات مراجعة عقود أو صيانة بدون عميل وغير مميزة بعدة عملاء.',
        },
      },
      {
        code: 'material_lines_missing_conversion' as const,
        count: missingConversionCount,
        caption: {
          en: 'Material lines that cannot convert to the material base unit.',
          ar: 'بنود مواد لا يمكن تحويل كميتها إلى الوحدة الأساسية للمادة.',
        },
      },
    ];
  }

  private async countLegacyIssuePermitMissingConversions(permitWhere: SQL | undefined): Promise<number> {
    const itemWhere = permitWhere
      ? and(isNotNull(legacyIssuePermitItems.materialCode), permitWhere)
      : isNotNull(legacyIssuePermitItems.materialCode);

    const rows = await this.db
      .select({
        materialCode: legacyIssuePermitItems.materialCode,
        unitOfMeasurementSelected: legacyIssuePermitItems.unitOfMeasurementSelected,
        quantity: legacyIssuePermitItems.quantity,
        unitOfMeasurement: materials.unitOfMeasurement,
      })
      .from(legacyIssuePermitItems)
      .innerJoin(legacyIssuePermits, eq(legacyIssuePermitItems.issuePermitId, legacyIssuePermits.id))
      .innerJoin(materials, eq(legacyIssuePermitItems.materialCode, materials.code))
      .where(itemWhere);

    if (rows.length === 0) return 0;

    const withConversions = await this.attachUnitConversions(
      rows.map((row) => ({ ...row, materialCode: row.materialCode! })),
    );

    let missing = 0;
    for (const row of withConversions) {
      const lineUnit = row.unitOfMeasurementSelected as MaterialUnit | null;
      const quantity = row.quantity == null ? null : Number(row.quantity);
      const baseUnit = row.unitOfMeasurement as MaterialUnit;
      const conversions = row.unitConversions.map((c) => ({
        unit: c.unit as MaterialUnit,
        conversionFactorToBase: c.conversionFactorToBase,
      }));
      const canConvert =
        quantity != null && lineUnit != null && this.canConvertEnteredUnitToBase(lineUnit, baseUnit, conversions);
      if (!canConvert) missing += 1;
    }
    return missing;
  }

  private async getLegacyIssuePermitHeaderNotes(permitWhere: SQL | undefined) {
    const where = permitWhere
      ? and(isNotNull(legacyIssuePermits.notes), ne(sql`btrim(${legacyIssuePermits.notes})`, ''), permitWhere)
      : and(isNotNull(legacyIssuePermits.notes), ne(sql`btrim(${legacyIssuePermits.notes})`, ''));

    const rows = await this.db
      .select({
        id: legacyIssuePermits.id,
        issuePermitNumber: legacyIssuePermits.issuePermitNumber,
        date: legacyIssuePermits.date,
        permitType: legacyIssuePermits.permitType,
        notes: legacyIssuePermits.notes,
      })
      .from(legacyIssuePermits)
      .where(where)
      .orderBy(desc(legacyIssuePermits.date), desc(legacyIssuePermits.createdAt))
      .limit(LEGACY_ISSUE_PERMIT_NOTES_LIST_LIMIT);

    return rows.map((row) => ({
      id: row.id,
      issuePermitNumber: row.issuePermitNumber,
      date: row.date,
      permitType: row.permitType,
      notes: row.notes!,
    }));
  }

  private async getLegacyIssuePermitLineNotes(permitWhere: SQL | undefined) {
    const where = permitWhere
      ? and(isNotNull(legacyIssuePermitItems.notes), ne(sql`btrim(${legacyIssuePermitItems.notes})`, ''), permitWhere)
      : and(isNotNull(legacyIssuePermitItems.notes), ne(sql`btrim(${legacyIssuePermitItems.notes})`, ''));

    const rows = await this.db
      .select({
        itemId: legacyIssuePermitItems.id,
        issuePermitId: legacyIssuePermits.id,
        issuePermitNumber: legacyIssuePermits.issuePermitNumber,
        date: legacyIssuePermits.date,
        materialCode: legacyIssuePermitItems.materialCode,
        notes: legacyIssuePermitItems.notes,
      })
      .from(legacyIssuePermitItems)
      .innerJoin(legacyIssuePermits, eq(legacyIssuePermitItems.issuePermitId, legacyIssuePermits.id))
      .where(where)
      .orderBy(desc(legacyIssuePermits.date), asc(legacyIssuePermitItems.sequenceOrder))
      .limit(LEGACY_ISSUE_PERMIT_NOTES_LIST_LIMIT);

    return rows.map((row) => ({
      itemId: row.itemId,
      issuePermitId: row.issuePermitId,
      issuePermitNumber: row.issuePermitNumber,
      date: row.date,
      materialCode: row.materialCode,
      notes: row.notes!,
    }));
  }

  private async getLegacyIssuePermitTopMaterials(permitWhere: SQL | undefined) {
    const itemWhere = permitWhere
      ? and(isNotNull(legacyIssuePermitItems.materialCode), permitWhere)
      : isNotNull(legacyIssuePermitItems.materialCode);

    const rows = await this.db
      .select({
        materialCode: legacyIssuePermitItems.materialCode,
        materialTitle: materials.title,
        unitOfMeasurement: materials.unitOfMeasurement,
        unitOfMeasurementSelected: legacyIssuePermitItems.unitOfMeasurementSelected,
        quantity: legacyIssuePermitItems.quantity,
        isCancelled: legacyIssuePermits.isCancelled,
      })
      .from(legacyIssuePermitItems)
      .innerJoin(legacyIssuePermits, eq(legacyIssuePermitItems.issuePermitId, legacyIssuePermits.id))
      .innerJoin(materials, eq(legacyIssuePermitItems.materialCode, materials.code))
      .where(itemWhere);

    if (rows.length === 0) return [];

    const withConversions = await this.attachUnitConversions(
      rows.map((row) => ({ ...row, materialCode: row.materialCode! })),
    );

    type Acc = {
      materialCode: string;
      materialTitle: string;
      unitOfMeasurement: MaterialUnit;
      unitConversions: MaterialUnitConversionSummary[];
      lineCount: number;
      issuedQuantityInBase: number;
      cancelledQuantityInBase: number;
      missingConversionCount: number;
    };

    const byCode = new Map<string, Acc>();

    for (const row of withConversions) {
      const baseUnit = row.unitOfMeasurement as MaterialUnit;
      const conversions = row.unitConversions.map((c) => ({
        unit: c.unit as MaterialUnit,
        conversionFactorToBase: c.conversionFactorToBase,
      }));
      const existing = byCode.get(row.materialCode) ?? {
        materialCode: row.materialCode,
        materialTitle: row.materialTitle,
        unitOfMeasurement: baseUnit,
        unitConversions: row.unitConversions,
        lineCount: 0,
        issuedQuantityInBase: 0,
        cancelledQuantityInBase: 0,
        missingConversionCount: 0,
      };

      existing.lineCount += 1;

      const lineUnit = row.unitOfMeasurementSelected as MaterialUnit | null;
      const quantity = row.quantity == null ? null : Number(row.quantity);
      const canConvert =
        quantity != null && lineUnit != null && this.canConvertEnteredUnitToBase(lineUnit, baseUnit, conversions);

      if (!canConvert || quantity == null || lineUnit == null) {
        existing.missingConversionCount += 1;
      } else {
        const quantityInBase = toBaseQuantity(quantity, resolveConversionFactor(lineUnit, baseUnit, conversions));
        if (row.isCancelled) existing.cancelledQuantityInBase += quantityInBase;
        else existing.issuedQuantityInBase += quantityInBase;
      }

      byCode.set(row.materialCode, existing);
    }

    return [...byCode.values()]
      .sort((a, b) => b.lineCount - a.lineCount || a.materialTitle.localeCompare(b.materialTitle))
      .slice(0, LEGACY_ISSUE_PERMIT_TOP_MATERIALS_LIMIT)
      .map((row) => ({
        materialCode: row.materialCode,
        materialTitle: row.materialTitle,
        unitOfMeasurement: row.unitOfMeasurement,
        unitConversions: row.unitConversions,
        lineCount: row.lineCount,
        issuedQuantityInBase: row.issuedQuantityInBase,
        cancelledQuantityInBase: row.cancelledQuantityInBase,
        missingConversionCount: row.missingConversionCount,
      }));
  }

  public async getIssuePermitHistory(params: { materialCode: string; from?: string; to?: string }) {
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
    const conditions: SQL[] = [eq(legacyIssuePermitItems.materialCode, params.materialCode)];
    if (dateRange.from) conditions.push(gte(legacyIssuePermits.date, dateRange.from));
    if (dateRange.to) conditions.push(lte(legacyIssuePermits.date, dateRange.to));

    const creator = alias(users, 'lip_creator');

    const rows = await this.db
      .select({
        issuePermitItemId: legacyIssuePermitItems.id,
        issuePermitId: legacyIssuePermits.id,
        issuePermitNumber: legacyIssuePermits.issuePermitNumber,
        date: legacyIssuePermits.date,
        productionSubDepartment: legacyIssuePermits.productionSubDepartment,
        creatorId: legacyIssuePermits.creatorId,
        creatorName: creator.name,
        permitType: legacyIssuePermits.permitType,
        contractNumber: legacyIssuePermits.contractNumber,
        maintenanceOrderNumber: legacyIssuePermits.maintenanceOrderNumber,
        maintenanceOrderType: legacyIssuePermits.maintenanceOrderType,
        hasMultipleCustomers: legacyIssuePermits.hasMultipleCustomers,
        unitOfMeasurementSelected: legacyIssuePermitItems.unitOfMeasurementSelected,
        quantity: legacyIssuePermitItems.quantity,
        isCancelled: legacyIssuePermits.isCancelled,
        notes: legacyIssuePermitItems.notes,
      })
      .from(legacyIssuePermitItems)
      .innerJoin(legacyIssuePermits, eq(legacyIssuePermitItems.issuePermitId, legacyIssuePermits.id))
      .innerJoin(creator, eq(legacyIssuePermits.creatorId, creator.id))
      .where(and(...conditions))
      .orderBy(asc(legacyIssuePermits.date));

    const [materialWithConversions] = await this.attachUnitConversions([{ ...material, materialCode: material.code }]);
    const conversions = materialWithConversions.unitConversions.map((row) => ({
      unit: row.unit as MaterialUnit,
      conversionFactorToBase: row.conversionFactorToBase,
    }));
    const baseUnit = material.unitOfMeasurement as MaterialUnit;

    let issuedQuantity = 0;
    let cancelledQuantity = 0;
    let missingConversionCount = 0;
    const permitIds = new Set<string>();

    const entries = rows.map((row) => {
      permitIds.add(row.issuePermitId);

      const lineUnit = row.unitOfMeasurementSelected as MaterialUnit | null;
      const quantity = row.quantity == null ? null : Number(row.quantity);
      const canConvert =
        quantity != null && lineUnit != null && this.canConvertEnteredUnitToBase(lineUnit, baseUnit, conversions);
      const quantityInBase =
        canConvert && quantity != null && lineUnit != null
          ? toBaseQuantity(quantity, resolveConversionFactor(lineUnit, baseUnit, conversions))
          : null;

      if (quantityInBase == null) {
        missingConversionCount += 1;
      } else if (row.isCancelled) {
        cancelledQuantity += quantityInBase;
      } else {
        issuedQuantity += quantityInBase;
      }

      return {
        issuePermitItemId: row.issuePermitItemId,
        issuePermitId: row.issuePermitId,
        issuePermitNumber: row.issuePermitNumber,
        date: row.date,
        productionSubDepartment: row.productionSubDepartment,
        creatorId: row.creatorId,
        creatorName: row.creatorName,
        permitType: row.permitType,
        contractNumber: row.contractNumber,
        maintenanceOrderNumber: row.maintenanceOrderNumber,
        maintenanceOrderType: row.maintenanceOrderType,
        hasMultipleCustomers: row.hasMultipleCustomers,
        unitOfMeasurementSelected: lineUnit,
        quantity,
        quantityInBase,
        isCancelled: row.isCancelled,
        status: row.isCancelled ? ('cancelled' as const) : ('issued' as const),
        notes: row.notes,
      };
    });

    return {
      material: {
        code: materialWithConversions.code,
        title: materialWithConversions.title,
        unitOfMeasurement: materialWithConversions.unitOfMeasurement,
        unitConversions: materialWithConversions.unitConversions,
      },
      entries,
      summary: {
        lineCount: entries.length,
        permitCount: permitIds.size,
        issuedQuantity,
        cancelledQuantity,
        missingConversionCount,
      },
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

  private async getTopMaterialsByQuantity(
    where: SQL,
    valueExpr: ReturnType<typeof sql<number>>,
    topLimit: number,
    options?: { joinSubs?: boolean },
  ) {
    const quantityExpr = sql<number>`coalesce(${materials.quantity}, 0)`;
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
          .orderBy(desc(quantityExpr), asc(materials.title))
          .limit(topLimit)
      : await this.db
          .select(selectFields)
          .from(materials)
          .where(where)
          .orderBy(desc(quantityExpr), asc(materials.title))
          .limit(topLimit);

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

  private buildDateRange(from?: string, to?: string): { from?: Date; to?: Date } {
    return {
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
    };
  }

  private canConvertEnteredUnitToBase(
    selectedUnit: MaterialUnit,
    baseUnit: MaterialUnit,
    unitConversions: { unit: MaterialUnit; conversionFactorToBase: number }[],
  ): boolean {
    if (selectedUnit === baseUnit) return true;
    if (unitConversions.some((row) => row.unit === selectedUnit)) return true;
    return getKnownConversionFactorToBase(selectedUnit, baseUnit, unitConversions) != null;
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
        unit: conversion.unit as MaterialUnit,
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
