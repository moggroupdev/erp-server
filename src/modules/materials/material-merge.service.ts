import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DRIZZLE, type DrizzleDB } from 'src/database/database.constants';
import {
  materials,
  materialUnitConversions,
  manufacturedMaterialBoms,
  productStandardBoms,
  materialPurchaseRequisitionItems,
  inventoryTransactionItems,
  legacyIssuePermitItems,
  maintenanceOrderMaterials,
  outsourcingOrderItems,
} from 'src/database/schema';
import { type MaterialType, type MaterialUnit, type User } from 'src/utils/types';
import { translate } from 'src/utils/i18n/translate';
import { MergeMaterialDto } from './dto/merge-material.dto';

const ID_PRINT_LIMIT = 20;

type MaterialRow = {
  code: string;
  title: string;
  legacyCode: string | null;
  materialType: MaterialType;
  unitOfMeasurement: MaterialUnit;
  quantity: number;
  unitPrice: number;
  openingQuantity: number | null;
  openingUnitPrice: number | null;
  minimumStock: number | null;
  marketUnitPrice: number | null;
  marketUnitPriceSetAt: Date | null;
  marketUnitPriceSetBy: string | null;
  marketManufacturingCost: number | null;
  marketManufacturingCostSetAt: Date | null;
  marketManufacturingCostSetBy: string | null;
  deletedAt: Date | null;
  deletedBy: string | null;
  createdBy: string;
};

type ConversionRow = {
  id: string;
  unit: MaterialUnit;
  conversionFactorToBase: number;
};

type ConversionDrop = { kind: 'drop'; id: string; unit: string; reason: string };
type ConversionRepoint = { kind: 'repoint'; id: string; unit: string; oldFactor: number; newFactor: number };
type ConversionAction = ConversionDrop | ConversionRepoint;

type ConversionPlan = {
  actions: ConversionAction[];
  addRemovedBase: boolean;
  resultingUnits: Set<string>;
  factorMismatches: string[];
};

type MaterialFigures = {
  quantity: number;
  unitPrice: number;
  openingQuantity: number | null;
  openingUnitPrice: number | null;
  minimumStock: number | null;
  marketUnitPrice: number | null;
  marketManufacturingCost: number | null;
};

type ReferenceCount = {
  key: string;
  count: number;
};

type Collision = { labelEn: string; labelAr: string; ids: string[] };

type ScanResult = {
  refCounts: ReferenceCount[];
  mmBomRowCount: number;
  usedUnits: MaterialUnit[];
  collisions: Collision[];
  unrecognizedUnits: MaterialUnit[];
};

type MaterialSummary = {
  code: string;
  title: string;
  legacyCode: string | null;
  materialType: MaterialType;
  unitOfMeasurement: MaterialUnit;
  deletedAt: Date | null;
  conversions: { id: string; unit: MaterialUnit; conversionFactorToBase: number }[];
};

export type MaterialMergePreview = {
  kept: MaterialSummary;
  removed: MaterialSummary;
  factor: number | null;
  conversionPlan: {
    actions: ConversionAction[];
    addRemovedBase: boolean;
  } | null;
  referenceCounts: ReferenceCount[];
  figuresBefore: MaterialFigures | null;
  figuresAfter: MaterialFigures | null;
  legacyCodeWarning: string | null;
  blockers: string[];
  canMerge: boolean;
};

type PreparedMerge = {
  kept: MaterialRow;
  removed: MaterialRow;
  keptConversions: ConversionRow[];
  removedConversions: ConversionRow[];
  factor: number | null;
  conversionPlan: ConversionPlan | null;
  scan: ScanResult | null;
  figuresBefore: MaterialFigures | null;
  figuresAfter: MaterialFigures | null;
  legacyCodeWarning: string | null;
  blockers: string[];
};

const UNIT_SCAN_TARGETS: { table: string; materialColumn: string; unitColumn: string }[] = [
  { table: 'inventory_transaction_items', materialColumn: 'material_code', unitColumn: 'unit_of_measurement_selected' },
  { table: 'material_purchase_requisition_items', materialColumn: 'material_code', unitColumn: 'unit_of_measurement_selected' },
  { table: 'material_purchase_order_items', materialColumn: 'material_code', unitColumn: 'unit_of_measurement_selected' },
  { table: 'request_for_quotation_items', materialColumn: 'material_code', unitColumn: 'unit_of_measurement_selected' },
  { table: 'supplier_quotation_items', materialColumn: 'material_code', unitColumn: 'unit_of_measurement_selected' },
  { table: 'legacy_issue_permit_items', materialColumn: 'material_code', unitColumn: 'unit_of_measurement_selected' },
  { table: 'maintenance_order_materials', materialColumn: 'material_code', unitColumn: 'unit_of_measurement_selected' },
  { table: 'outsourcing_order_items', materialColumn: 'manufactured_material_code', unitColumn: 'unit_of_measurement_selected' },
  { table: 'product_standard_boms', materialColumn: 'material_code', unitColumn: 'unit_of_measurement_selected' },
  { table: 'manufactured_material_boms', materialColumn: 'material_code', unitColumn: 'unit_of_measurement_selected' },
];

/** Hardcoded material FK inventory for merge. Keep in sync with scripts/others/merge-materials.ts (see AGENTS.md). */
@Injectable()
export class MaterialMergeService {
  constructor(@Inject(DRIZZLE) private db: DrizzleDB) {}

  public async preview(keepCode: string, removeCode: string): Promise<MaterialMergePreview> {
    const prepared = await this.prepare(keepCode, removeCode.trim(), this.db);
    return this.toPreviewResponse(prepared);
  }

  public async merge(keepCode: string, dto: MergeMaterialDto, user: User) {
    const removeCode = dto.removeCode.trim();
    if (dto.confirmationCode.trim() !== removeCode) {
      throw new BadRequestException(
        translate(
          'Confirmation code does not match the material code to remove.',
          'رمز التأكيد لا يطابق كود المادة المراد إزالتها.',
        ),
      );
    }

    return await this.db.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL statement_timeout = 0`);
      await tx.execute(sql`SET LOCAL idle_in_transaction_session_timeout = 0`);

      const prepared = await this.prepare(keepCode, removeCode, tx);
      if (prepared.blockers.length > 0) {
        throw new ConflictException(prepared.blockers.join(' '));
      }

      const { kept, removed, factor, conversionPlan, scan } = prepared;
      if (!factor || !conversionPlan || !scan) {
        throw new ConflictException(
          translate('Merge cannot proceed.', 'لا يمكن متابعة الدمج.'),
        );
      }

      await this.runMerge(tx, keepCode, removeCode, kept, removed, factor, conversionPlan, scan, user.id);

      const [updated] = await tx.select().from(materials).where(eq(materials.code, keepCode)).limit(1);
      return updated;
    });
  }

  // ============================== PREPARE / PREVIEW ==============================

  private async prepare(keepCode: string, removeCode: string, db: DrizzleDB): Promise<PreparedMerge> {
    const blockers: string[] = [];

    if (keepCode === removeCode) {
      blockers.push(
        translate('Keep and remove must be different codes.', 'يجب أن يكون كود الإبقاء وكود الإزالة مختلفين.'),
      );
    }

    const kept = await this.loadMaterial(db, keepCode);
    if (!kept) {
      throw new NotFoundException(
        translate(`Material with code ${keepCode} does not exist.`, `لا توجد مادة بالكود ${keepCode}.`),
      );
    }

    const removed = await this.loadMaterial(db, removeCode);
    if (!removed) {
      blockers.push(
        translate(`Removed material ${removeCode} was not found.`, `المادة المراد إزالتها ${removeCode} غير موجودة.`),
      );
      return {
        kept,
        removed: this.emptyMaterial(removeCode),
        keptConversions: [],
        removedConversions: [],
        factor: null,
        conversionPlan: null,
        scan: null,
        figuresBefore: this.toFigures(kept),
        figuresAfter: null,
        legacyCodeWarning: null,
        blockers,
      };
    }

    if (kept.deletedAt) {
      blockers.push(
        translate(
          `Kept material ${keepCode} is soft-deleted. Choose a live material to keep.`,
          `المادة المُبقاء عليها ${keepCode} محذوفة. اختر مادة نشطة للإبقاء عليها.`,
        ),
      );
    }

    if (kept.materialType !== removed.materialType) {
      blockers.push(
        translate(
          `Material type mismatch: keep=${kept.materialType}, remove=${removed.materialType}.`,
          `اختلاف نوع المادة: الإبقاء=${kept.materialType}، الإزالة=${removed.materialType}.`,
        ),
      );
    }

    const keptConversions = await this.loadConversions(db, keepCode);
    const removedConversions = await this.loadConversions(db, removeCode);

    let factor: number | null = null;
    let conversionPlan: ConversionPlan | null = null;
    let scan: ScanResult | null = null;
    let figuresAfter: MaterialFigures | null = null;

    const legacyCodeWarning = removed.legacyCode
      ? translate(
          `Removed material has legacy code "${removed.legacyCode}". Re-running materials seed may recreate this duplicate.`,
          `المادة المراد إزالتها لها كود قديم "${removed.legacyCode}". إعادة تشغيل بذرة المواد قد تعيد إنشاء هذا التكرار.`,
        )
      : null;

    if (blockers.length === 0 || (kept.materialType === removed.materialType && !kept.deletedAt && keepCode !== removeCode)) {
      try {
        factor = this.resolveFactor(kept, removed, keptConversions, removedConversions);
      } catch (error) {
        blockers.push(error instanceof Error ? error.message : String(error));
      }
    }

    if (factor != null) {
      conversionPlan = this.planConversions(kept, removed, keptConversions, removedConversions, factor);

      if (conversionPlan.factorMismatches.length > 0) {
        blockers.push(
          translate(
            `Kept and removed materials define the same alternate unit with different factors: ${conversionPlan.factorMismatches.join('; ')}.`,
            `المادتان تعرّفان نفس الوحدة البديلة بعوامل تحويل مختلفة: ${conversionPlan.factorMismatches.join('; ')}.`,
          ),
        );
      }

      scan = await this.scanReferences(db, keepCode, removeCode, conversionPlan);

      if (scan.unrecognizedUnits.length > 0) {
        blockers.push(
          translate(
            `Removed material lines use units that the kept material would not recognize after merge: ${scan.unrecognizedUnits.join(', ')}.`,
            `بنود المادة المراد إزالتها تستخدم وحدات لن تتعرّف عليها المادة المُبقاء بعد الدمج: ${scan.unrecognizedUnits.join(', ')}.`,
          ),
        );
      }

      const liveCollisions = scan.collisions.filter((row) => row.ids.length > 0);
      for (const collision of liveCollisions) {
        blockers.push(
          translate(
            `${collision.labelEn}: ${this.formatIdList(collision.ids)}`,
            `${collision.labelAr}: ${this.formatIdList(collision.ids)}`,
          ),
        );
      }

      figuresAfter = this.mergedMaterialFields(kept, removed, factor);
    }

    return {
      kept,
      removed,
      keptConversions,
      removedConversions,
      factor,
      conversionPlan,
      scan,
      figuresBefore: this.toFigures(kept),
      figuresAfter,
      legacyCodeWarning,
      blockers,
    };
  }

  private toPreviewResponse(prepared: PreparedMerge): MaterialMergePreview {
    return {
      kept: this.toSummary(prepared.kept, prepared.keptConversions),
      removed: this.toSummary(prepared.removed, prepared.removedConversions),
      factor: prepared.factor,
      conversionPlan: prepared.conversionPlan
        ? {
            actions: prepared.conversionPlan.actions,
            addRemovedBase: prepared.conversionPlan.addRemovedBase,
          }
        : null,
      referenceCounts: (prepared.scan?.refCounts ?? []).filter((row) => row.count > 0),
      figuresBefore: prepared.figuresBefore,
      figuresAfter: prepared.figuresAfter,
      legacyCodeWarning: prepared.legacyCodeWarning,
      blockers: prepared.blockers,
      canMerge: prepared.blockers.length === 0,
    };
  }

  private toSummary(material: MaterialRow, conversions: ConversionRow[]): MaterialSummary {
    return {
      code: material.code,
      title: material.title,
      legacyCode: material.legacyCode,
      materialType: material.materialType,
      unitOfMeasurement: material.unitOfMeasurement,
      deletedAt: material.deletedAt,
      conversions: conversions.map((row) => ({
        id: row.id,
        unit: row.unit,
        conversionFactorToBase: row.conversionFactorToBase,
      })),
    };
  }

  private toFigures(material: MaterialRow): MaterialFigures {
    return {
      quantity: material.quantity,
      unitPrice: material.unitPrice,
      openingQuantity: material.openingQuantity,
      openingUnitPrice: material.openingUnitPrice,
      minimumStock: material.minimumStock,
      marketUnitPrice: material.marketUnitPrice,
      marketManufacturingCost: material.marketManufacturingCost,
    };
  }

  private emptyMaterial(code: string): MaterialRow {
    return {
      code,
      title: '',
      legacyCode: null,
      materialType: 'raw_materials',
      unitOfMeasurement: 'count',
      quantity: 0,
      unitPrice: 0,
      openingQuantity: null,
      openingUnitPrice: null,
      minimumStock: null,
      marketUnitPrice: null,
      marketUnitPriceSetAt: null,
      marketUnitPriceSetBy: null,
      marketManufacturingCost: null,
      marketManufacturingCostSetAt: null,
      marketManufacturingCostSetBy: null,
      deletedAt: null,
      deletedBy: null,
      createdBy: '',
    };
  }

  // ============================== LOAD / MATH ==============================

  private async loadMaterial(db: DrizzleDB, code: string): Promise<MaterialRow | undefined> {
    const [row] = await db
      .select({
        code: materials.code,
        title: materials.title,
        legacyCode: materials.legacyCode,
        materialType: materials.materialType,
        unitOfMeasurement: materials.unitOfMeasurement,
        quantity: materials.quantity,
        unitPrice: materials.unitPrice,
        openingQuantity: materials.openingQuantity,
        openingUnitPrice: materials.openingUnitPrice,
        minimumStock: materials.minimumStock,
        marketUnitPrice: materials.marketUnitPrice,
        marketUnitPriceSetAt: materials.marketUnitPriceSetAt,
        marketUnitPriceSetBy: materials.marketUnitPriceSetBy,
        marketManufacturingCost: materials.marketManufacturingCost,
        marketManufacturingCostSetAt: materials.marketManufacturingCostSetAt,
        marketManufacturingCostSetBy: materials.marketManufacturingCostSetBy,
        deletedAt: materials.deletedAt,
        deletedBy: materials.deletedBy,
        createdBy: materials.createdBy,
      })
      .from(materials)
      .where(eq(materials.code, code))
      .limit(1);

    return row;
  }

  private async loadConversions(db: DrizzleDB, materialCode: string): Promise<ConversionRow[]> {
    const rows = await db
      .select({
        id: materialUnitConversions.id,
        unit: materialUnitConversions.unit,
        conversionFactorToBase: materialUnitConversions.conversionFactorToBase,
      })
      .from(materialUnitConversions)
      .where(eq(materialUnitConversions.materialCode, materialCode));

    return rows.map((row) => ({
      id: row.id,
      unit: row.unit,
      conversionFactorToBase: this.toNumber(row.conversionFactorToBase, `conversion factor for ${row.unit}`),
    }));
  }

  private resolveFactor(
    kept: MaterialRow,
    removed: MaterialRow,
    keptConversions: ConversionRow[],
    removedConversions: ConversionRow[],
  ): number {
    if (kept.unitOfMeasurement === removed.unitOfMeasurement) return 1;

    const fromKept = keptConversions.find((row) => row.unit === removed.unitOfMeasurement);
    if (fromKept) {
      const factor = this.round6(fromKept.conversionFactorToBase);
      if (factor <= 0) {
        throw new Error(
          translate(
            `Kept material conversion for unit "${removed.unitOfMeasurement}" is not a positive factor (${fromKept.conversionFactorToBase}).`,
            `عامل تحويل المادة المُبقاء للوحدة "${removed.unitOfMeasurement}" ليس موجباً (${fromKept.conversionFactorToBase}).`,
          ),
        );
      }
      return factor;
    }

    const fromRemoved = removedConversions.find((row) => row.unit === kept.unitOfMeasurement);
    if (fromRemoved && fromRemoved.conversionFactorToBase > 0) {
      const factor = this.round6(1 / fromRemoved.conversionFactorToBase);
      if (factor <= 0) {
        throw new Error(
          translate(
            `Inverse of removed material conversion for unit "${kept.unitOfMeasurement}" is not a positive factor.`,
            `مقلوب عامل تحويل المادة المراد إزالتها للوحدة "${kept.unitOfMeasurement}" ليس موجباً.`,
          ),
        );
      }
      return factor;
    }

    throw new Error(
      translate(
        `Base units differ (keep=${kept.unitOfMeasurement}, remove=${removed.unitOfMeasurement}) and no conversion factor was found. Add a conversion on the kept material for "${removed.unitOfMeasurement}", or on the removed material for "${kept.unitOfMeasurement}".`,
        `وحدات القياس الأساسية مختلفة (الإبقاء=${kept.unitOfMeasurement}، الإزالة=${removed.unitOfMeasurement}) ولم يُعثر على عامل تحويل. أضف تحويلاً على المادة المُبقاء للوحدة "${removed.unitOfMeasurement}"، أو على المادة المراد إزالتها للوحدة "${kept.unitOfMeasurement}".`,
      ),
    );
  }

  private planConversions(
    kept: MaterialRow,
    removed: MaterialRow,
    keptConversions: ConversionRow[],
    removedConversions: ConversionRow[],
    factor: number,
  ): ConversionPlan {
    const keptByUnit = new Map(keptConversions.map((row) => [row.unit, row]));
    const actions: ConversionAction[] = [];
    const factorMismatches: string[] = [];

    for (const conv of removedConversions) {
      const newFactor = this.round6(conv.conversionFactorToBase * factor);

      if (conv.unit === kept.unitOfMeasurement) {
        actions.push({ kind: 'drop', id: conv.id, unit: conv.unit, reason: 'equals kept base unit' });
        continue;
      }

      const existing = keptByUnit.get(conv.unit);
      if (existing) {
        if (this.factorsEqual(existing.conversionFactorToBase, newFactor)) {
          actions.push({
            kind: 'drop',
            id: conv.id,
            unit: conv.unit,
            reason: 'kept already has the same factor',
          });
        } else {
          factorMismatches.push(`${conv.unit}: kept=${existing.conversionFactorToBase}, merged=${newFactor}`);
        }
        continue;
      }

      if (newFactor <= 0) {
        factorMismatches.push(`${conv.unit}: merged factor ${newFactor} is not positive`);
        continue;
      }

      actions.push({
        kind: 'repoint',
        id: conv.id,
        unit: conv.unit,
        oldFactor: conv.conversionFactorToBase,
        newFactor,
      });
    }

    const resultingUnits = new Set<string>([kept.unitOfMeasurement, ...keptConversions.map((row) => row.unit)]);
    for (const action of actions) {
      if (action.kind === 'repoint') resultingUnits.add(action.unit);
    }

    let addRemovedBase = false;
    if (kept.unitOfMeasurement !== removed.unitOfMeasurement && !resultingUnits.has(removed.unitOfMeasurement)) {
      addRemovedBase = true;
      resultingUnits.add(removed.unitOfMeasurement);
    }

    return { actions, addRemovedBase, resultingUnits, factorMismatches };
  }

  private mergeQtyPrice(
    keptQty: number | null,
    keptPrice: number | null,
    removedQty: number | null,
    removedPrice: number | null,
    factor: number,
  ): { quantity: number; unitPrice: number } {
    const kq = keptQty ?? 0;
    const rq = (removedQty ?? 0) * factor;
    const total = kq + rq;
    const kp = keptPrice ?? 0;
    const rp = factor === 0 ? 0 : (removedPrice ?? 0) / factor;
    return {
      quantity: this.round6(total),
      unitPrice: total === 0 ? this.round6(kp) : this.round6((kq * kp + rq * rp) / total),
    };
  }

  private mergedMaterialFields(kept: MaterialRow, removed: MaterialRow, factor: number): MaterialFigures & {
    marketUnitPriceSetAt: Date | null;
    marketUnitPriceSetBy: string | null;
    marketManufacturingCostSetAt: Date | null;
    marketManufacturingCostSetBy: string | null;
  } {
    const stock = this.mergeQtyPrice(kept.quantity, kept.unitPrice, removed.quantity, removed.unitPrice, factor);

    const hasOpening = kept.openingQuantity != null || removed.openingQuantity != null;
    const opening = hasOpening
      ? this.mergeQtyPrice(kept.openingQuantity, kept.openingUnitPrice, removed.openingQuantity, removed.openingUnitPrice, factor)
      : null;

    const minimumStock =
      kept.minimumStock != null
        ? kept.minimumStock
        : removed.minimumStock != null
          ? this.round6(removed.minimumStock * factor)
          : null;

    const keepMarket = kept.marketUnitPrice != null;
    const marketUnitPrice = keepMarket
      ? kept.marketUnitPrice
      : removed.marketUnitPrice != null
        ? this.round6(removed.marketUnitPrice / factor)
        : null;

    const keepMarketMfg = kept.marketManufacturingCost != null;
    const marketManufacturingCost = keepMarketMfg
      ? kept.marketManufacturingCost
      : removed.marketManufacturingCost != null
        ? this.round6(removed.marketManufacturingCost / factor)
        : null;

    return {
      quantity: stock.quantity,
      unitPrice: stock.unitPrice,
      openingQuantity: opening ? opening.quantity : kept.openingQuantity,
      openingUnitPrice: opening ? opening.unitPrice : kept.openingUnitPrice,
      minimumStock,
      marketUnitPrice,
      marketUnitPriceSetAt: keepMarket ? kept.marketUnitPriceSetAt : removed.marketUnitPriceSetAt,
      marketUnitPriceSetBy: keepMarket ? kept.marketUnitPriceSetBy : removed.marketUnitPriceSetBy,
      marketManufacturingCost,
      marketManufacturingCostSetAt: keepMarketMfg
        ? kept.marketManufacturingCostSetAt
        : removed.marketManufacturingCostSetAt,
      marketManufacturingCostSetBy: keepMarketMfg
        ? kept.marketManufacturingCostSetBy
        : removed.marketManufacturingCostSetBy,
    };
  }

  // ============================== SCAN ==============================

  private async scanReferences(
    db: DrizzleDB,
    keep: string,
    remove: string,
    conversionPlan: ConversionPlan,
  ): Promise<ScanResult> {
    const [
      unitConversions,
      ownMmBomLines,
      componentOfMmBoms,
      productBomLines,
      purchaseRequisitions,
      purchaseOrders,
      inventoryTransactions,
      legacyIssuePermits,
      maintenanceOrders,
      outsourcingOrders,
      requestForQuotations,
      supplierQuotations,
      mmBomRowCount,
    ] = await Promise.all([
      this.countSql(db, sql`SELECT count(*)::int AS count FROM material_unit_conversions WHERE material_code = ${remove}`),
      this.countSql(
        db,
        sql`SELECT count(*)::int AS count FROM manufactured_material_boms WHERE manufactured_material_code = ${remove}`,
      ),
      this.countSql(db, sql`SELECT count(*)::int AS count FROM manufactured_material_boms WHERE material_code = ${remove}`),
      this.countSql(db, sql`SELECT count(*)::int AS count FROM product_standard_boms WHERE material_code = ${remove}`),
      this.countSql(
        db,
        sql`SELECT count(*)::int AS count FROM material_purchase_requisition_items WHERE material_code = ${remove}`,
      ),
      this.countSql(db, sql`SELECT count(*)::int AS count FROM material_purchase_order_items WHERE material_code = ${remove}`),
      this.countSql(db, sql`SELECT count(*)::int AS count FROM inventory_transaction_items WHERE material_code = ${remove}`),
      this.countSql(db, sql`SELECT count(*)::int AS count FROM legacy_issue_permit_items WHERE material_code = ${remove}`),
      this.countSql(db, sql`SELECT count(*)::int AS count FROM maintenance_order_materials WHERE material_code = ${remove}`),
      this.countSql(
        db,
        sql`SELECT count(*)::int AS count FROM outsourcing_order_items WHERE manufactured_material_code = ${remove}`,
      ),
      this.countSql(db, sql`SELECT count(*)::int AS count FROM request_for_quotation_items WHERE material_code = ${remove}`),
      this.countSql(db, sql`SELECT count(*)::int AS count FROM supplier_quotation_items WHERE material_code = ${remove}`),
      this.countSql(
        db,
        sql`SELECT count(*)::int AS count FROM manufactured_material_boms WHERE manufactured_material_code = ${remove} OR material_code = ${remove}`,
      ),
    ]);

    const refCounts: ReferenceCount[] = [
      { key: 'unitConversions', count: unitConversions },
      { key: 'ownMmBomLines', count: ownMmBomLines },
      { key: 'componentOfMmBoms', count: componentOfMmBoms },
      { key: 'productBomLines', count: productBomLines },
      { key: 'purchaseRequisitions', count: purchaseRequisitions },
      { key: 'purchaseOrders', count: purchaseOrders },
      { key: 'inventoryTransactions', count: inventoryTransactions },
      { key: 'legacyIssuePermits', count: legacyIssuePermits },
      { key: 'maintenanceOrders', count: maintenanceOrders },
      { key: 'outsourcingOrders', count: outsourcingOrders },
      { key: 'requestForQuotations', count: requestForQuotations },
      { key: 'supplierQuotations', count: supplierQuotations },
    ];

    const usedUnits = [
      ...new Set(
        (
          await Promise.all(
            UNIT_SCAN_TARGETS.map((target) =>
              this.collectUnitsSql(db, target.table, target.materialColumn, target.unitColumn, remove),
            ),
          )
        ).flat(),
      ),
    ];

    const collisions: Collision[] = [
      {
        labelEn: 'Same purchase order has both materials',
        labelAr: 'نفس أمر التوريد يحتوي على المادتين',
        ids: await this.collisionParentIds(
          db,
          sql`
            SELECT mpo.code AS parent_id
            FROM material_purchase_order_items k
            INNER JOIN material_purchase_order_items r
              ON r.material_purchase_order_id = k.material_purchase_order_id
            INNER JOIN material_purchase_orders mpo
              ON mpo.id = k.material_purchase_order_id
            WHERE k.material_code = ${keep} AND r.material_code = ${remove}
          `,
        ),
      },
      {
        labelEn: 'Same requisition has both materials',
        labelAr: 'نفس طلب الشراء يحتوي على المادتين',
        ids: await this.collisionParentIds(
          db,
          sql`
            SELECT mprq.code AS parent_id
            FROM material_purchase_requisition_items k
            INNER JOIN material_purchase_requisition_items r
              ON r.material_purchase_requisition_id = k.material_purchase_requisition_id
            INNER JOIN material_purchase_requisitions mprq
              ON mprq.id = k.material_purchase_requisition_id
            WHERE k.material_code = ${keep} AND r.material_code = ${remove}
          `,
        ),
      },
      {
        labelEn: 'Same RFQ has both materials',
        labelAr: 'نفس طلب عرض الأسعار يحتوي على المادتين',
        ids: await this.collisionParentIds(
          db,
          sql`
            SELECT rfq.code AS parent_id
            FROM request_for_quotation_items k
            INNER JOIN request_for_quotation_items r
              ON r.request_for_quotation_id = k.request_for_quotation_id
            INNER JOIN request_for_quotations rfq
              ON rfq.id = k.request_for_quotation_id
            WHERE k.material_code = ${keep} AND r.material_code = ${remove}
          `,
        ),
      },
      {
        labelEn: 'Same maintenance order has both materials',
        labelAr: 'نفس أمر الصيانة يحتوي على المادتين',
        ids: await this.collisionParentIds(
          db,
          sql`
            SELECT mo.code AS parent_id
            FROM maintenance_order_materials k
            INNER JOIN maintenance_order_materials r
              ON r.maintenance_order_id = k.maintenance_order_id
            INNER JOIN maintenance_orders mo
              ON mo.id = k.maintenance_order_id
            WHERE k.material_code = ${keep} AND r.material_code = ${remove}
          `,
        ),
      },
      {
        labelEn: 'Same outsourcing order has both materials',
        labelAr: 'نفس أمر التصنيع الخارجي يحتوي على المادتين',
        ids: await this.collisionParentIds(
          db,
          sql`
            SELECT oso.code AS parent_id
            FROM outsourcing_order_items k
            INNER JOIN outsourcing_order_items r
              ON r.outsourcing_order_id = k.outsourcing_order_id
            INNER JOIN outsourcing_orders oso
              ON oso.id = k.outsourcing_order_id
            WHERE k.manufactured_material_code = ${keep} AND r.manufactured_material_code = ${remove}
          `,
        ),
      },
      {
        labelEn: 'Same product BOM dimension already has both materials',
        labelAr: 'نفس بُعد قائمة مواد المنتج يحتوي بالفعل على المادتين',
        ids: await this.collisionParentIds(
          db,
          sql`
            SELECT k.product_dimension_id::text AS parent_id
            FROM product_standard_boms k
            INNER JOIN product_standard_boms r
              ON r.product_dimension_id = k.product_dimension_id
              AND r.production_sub_department IS NOT DISTINCT FROM k.production_sub_department
            WHERE k.material_code = ${keep} AND r.material_code = ${remove}
          `,
        ),
      },
      {
        labelEn: 'Same manufactured-material BOM already has both as components',
        labelAr: 'نفس وصفة المادة المصنّعة تحتوي بالفعل على المادتين كمكونات',
        ids: await this.collisionParentIds(
          db,
          sql`
            SELECT k.manufactured_material_code AS parent_id
            FROM manufactured_material_boms k
            INNER JOIN manufactured_material_boms r
              ON r.manufactured_material_code = k.manufactured_material_code
            WHERE k.material_code = ${keep} AND r.material_code = ${remove}
          `,
        ),
      },
      {
        labelEn: 'Both materials are parents of the same manufactured-material BOM component',
        labelAr: 'كلتا المادتين أبوان لنفس مكوّن في وصفة مادة مصنّعة',
        ids: await this.collisionParentIds(
          db,
          sql`
            SELECT k.material_code AS parent_id
            FROM manufactured_material_boms k
            INNER JOIN manufactured_material_boms r
              ON r.material_code = k.material_code
            WHERE k.manufactured_material_code = ${keep} AND r.manufactured_material_code = ${remove}
          `,
        ),
      },
      {
        labelEn: 'Merge would create a self-reference in manufactured-material BOMs',
        labelAr: 'الدمج سينشئ مرجعاً ذاتياً في وصفات المواد المصنّعة',
        ids: await this.collisionParentIds(
          db,
          sql`
            SELECT id::text AS parent_id
            FROM manufactured_material_boms
            WHERE (manufactured_material_code = ${keep} AND material_code = ${remove})
               OR (manufactured_material_code = ${remove} AND material_code = ${keep})
               OR (manufactured_material_code = ${remove} AND material_code = ${remove})
          `,
        ),
      },
    ];

    const unrecognizedUnits = usedUnits.filter((unit) => !conversionPlan.resultingUnits.has(unit));

    return { refCounts, mmBomRowCount, usedUnits, collisions, unrecognizedUnits };
  }

  // ============================== WRITE ==============================

  private async runMerge(
    tx: DrizzleDB,
    keep: string,
    remove: string,
    kept: MaterialRow,
    removed: MaterialRow,
    factor: number,
    conversionPlan: ConversionPlan,
    scan: ScanResult,
    createdBy: string,
  ): Promise<void> {
    await tx
      .update(productStandardBoms)
      .set({ unitOfMeasurementSelected: removed.unitOfMeasurement })
      .where(and(eq(productStandardBoms.materialCode, remove), isNull(productStandardBoms.unitOfMeasurementSelected)));

    await tx
      .update(manufacturedMaterialBoms)
      .set({ unitOfMeasurementSelected: removed.unitOfMeasurement })
      .where(
        and(eq(manufacturedMaterialBoms.materialCode, remove), isNull(manufacturedMaterialBoms.unitOfMeasurementSelected)),
      );

    const dropIds = conversionPlan.actions.filter((action) => action.kind === 'drop').map((action) => action.id);
    if (dropIds.length > 0) {
      const deleted = await tx
        .delete(materialUnitConversions)
        .where(inArray(materialUnitConversions.id, dropIds))
        .returning({ id: materialUnitConversions.id });
      this.expectUpdated('material_unit_conversions (drop)', dropIds.length, deleted.length);
    }

    const repoints = conversionPlan.actions.filter((action): action is ConversionRepoint => action.kind === 'repoint');
    for (const action of repoints) {
      const updated = await tx
        .update(materialUnitConversions)
        .set({
          materialCode: keep,
          conversionFactorToBase: action.newFactor,
        })
        .where(eq(materialUnitConversions.id, action.id))
        .returning({ id: materialUnitConversions.id });
      this.expectUpdated(`material_unit_conversions ${action.unit}`, 1, updated.length);
    }

    if (conversionPlan.addRemovedBase) {
      await tx.insert(materialUnitConversions).values({
        materialCode: keep,
        unit: removed.unitOfMeasurement,
        conversionFactorToBase: factor,
        createdBy,
      });
    }

    const countByKey = (key: string) => scan.refCounts.find((row) => row.key === key)?.count ?? 0;

    const mmBomUpdated = this.executeRows(
      await tx.execute(sql`
        UPDATE manufactured_material_boms
        SET
          material_code = CASE WHEN material_code = ${remove} THEN ${keep} ELSE material_code END,
          manufactured_material_code = CASE WHEN manufactured_material_code = ${remove} THEN ${keep} ELSE manufactured_material_code END
        WHERE material_code = ${remove} OR manufactured_material_code = ${remove}
        RETURNING id
      `),
    );
    this.expectUpdated('manufactured_material_boms', scan.mmBomRowCount, mmBomUpdated.length);

    const simpleUpdates: { key: string; name: string; run: () => Promise<{ id: string }[]> }[] = [
      {
        key: 'productBomLines',
        name: 'product_standard_boms',
        run: () =>
          tx
            .update(productStandardBoms)
            .set({ materialCode: keep })
            .where(eq(productStandardBoms.materialCode, remove))
            .returning({ id: productStandardBoms.id }),
      },
      {
        key: 'purchaseRequisitions',
        name: 'material_purchase_requisition_items',
        run: () =>
          tx
            .update(materialPurchaseRequisitionItems)
            .set({ materialCode: keep })
            .where(eq(materialPurchaseRequisitionItems.materialCode, remove))
            .returning({ id: materialPurchaseRequisitionItems.id }),
      },
      {
        key: 'inventoryTransactions',
        name: 'inventory_transaction_items',
        run: () =>
          tx
            .update(inventoryTransactionItems)
            .set({ materialCode: keep })
            .where(eq(inventoryTransactionItems.materialCode, remove))
            .returning({ id: inventoryTransactionItems.id }),
      },
      {
        key: 'legacyIssuePermits',
        name: 'legacy_issue_permit_items',
        run: () =>
          tx
            .update(legacyIssuePermitItems)
            .set({ materialCode: keep })
            .where(eq(legacyIssuePermitItems.materialCode, remove))
            .returning({ id: legacyIssuePermitItems.id }),
      },
      {
        key: 'maintenanceOrders',
        name: 'maintenance_order_materials',
        run: () =>
          tx
            .update(maintenanceOrderMaterials)
            .set({ materialCode: keep })
            .where(eq(maintenanceOrderMaterials.materialCode, remove))
            .returning({ id: maintenanceOrderMaterials.id }),
      },
      {
        key: 'outsourcingOrders',
        name: 'outsourcing_order_items',
        run: () =>
          tx
            .update(outsourcingOrderItems)
            .set({ manufacturedMaterialCode: keep })
            .where(eq(outsourcingOrderItems.manufacturedMaterialCode, remove))
            .returning({ id: outsourcingOrderItems.id }),
      },
    ];

    for (const target of simpleUpdates) {
      const updated = await target.run();
      this.expectUpdated(target.name, countByKey(target.key), updated.length);
    }

    const rfqiExpected = countByKey('requestForQuotations');
    const sqiExpected = countByKey('supplierQuotations');
    const mpoiExpected = countByKey('purchaseOrders');

    if (rfqiExpected + sqiExpected + mpoiExpected > 0) {
      let cteRows: Record<string, unknown>[];
      try {
        cteRows = this.executeRows(
          await tx.execute(sql`
            WITH rfqi AS (
              UPDATE request_for_quotation_items
              SET material_code = ${keep}
              WHERE material_code = ${remove}
              RETURNING id
            ),
            sqi AS (
              UPDATE supplier_quotation_items
              SET material_code = ${keep}
              WHERE material_code = ${remove}
              RETURNING id
            ),
            mpoi AS (
              UPDATE material_purchase_order_items
              SET material_code = ${keep}
              WHERE material_code = ${remove}
              RETURNING id
            )
            SELECT
              (SELECT count(*)::int FROM rfqi) AS rfqi_count,
              (SELECT count(*)::int FROM sqi) AS sqi_count,
              (SELECT count(*)::int FROM mpoi) AS mpoi_count
          `),
        );
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        throw new ConflictException(
          translate(
            `Composite FK update failed for request_for_quotation_items / supplier_quotation_items / material_purchase_order_items. ${message}`,
            `فشل تحديث المفتاح المركب لبنود طلبات عروض الأسعار / عروض الموردين / أوامر التوريد. ${message}`,
          ),
        );
      }

      const cte = cteRows[0] ?? {};
      this.expectUpdated('request_for_quotation_items', rfqiExpected, this.toCount(cte.rfqi_count ?? 0));
      this.expectUpdated('supplier_quotation_items', sqiExpected, this.toCount(cte.sqi_count ?? 0));
      this.expectUpdated('material_purchase_order_items', mpoiExpected, this.toCount(cte.mpoi_count ?? 0));
    }

    const merged = this.mergedMaterialFields(kept, removed, factor);
    const keptUpdated = await tx
      .update(materials)
      .set({
        quantity: merged.quantity,
        unitPrice: merged.unitPrice,
        openingQuantity: merged.openingQuantity,
        openingUnitPrice: merged.openingUnitPrice,
        minimumStock: merged.minimumStock,
        marketUnitPrice: merged.marketUnitPrice,
        marketUnitPriceSetAt: merged.marketUnitPriceSetAt,
        marketUnitPriceSetBy: merged.marketUnitPriceSetBy,
        marketManufacturingCost: merged.marketManufacturingCost,
        marketManufacturingCostSetAt: merged.marketManufacturingCostSetAt,
        marketManufacturingCostSetBy: merged.marketManufacturingCostSetBy,
      })
      .where(eq(materials.code, keep))
      .returning({ code: materials.code });
    this.expectUpdated('materials (kept figures)', 1, keptUpdated.length);

    const deleted = await tx.delete(materials).where(eq(materials.code, remove)).returning({ code: materials.code });
    this.expectUpdated('materials (delete removed)', 1, deleted.length);

    const remaining = await this.countRemaining(tx, remove);
    const leftover = remaining.filter((row) => row.count > 0);
    if (leftover.length > 0) {
      const details = leftover.map((row) => `${row.key}=${row.count}`).join(', ');
      throw new ConflictException(
        translate(
          `Post-merge verification failed: ${details} still reference ${remove}.`,
          `فشل التحقق بعد الدمج: ${details} ما زالت تشير إلى ${remove}.`,
        ),
      );
    }
  }

  private async countRemaining(db: DrizzleDB, remove: string): Promise<ReferenceCount[]> {
    const [
      unitConversions,
      ownMmBomLines,
      componentOfMmBoms,
      productBomLines,
      purchaseRequisitions,
      purchaseOrders,
      inventoryTransactions,
      legacyIssuePermits,
      maintenanceOrders,
      outsourcingOrders,
      requestForQuotations,
      supplierQuotations,
    ] = await Promise.all([
      this.countSql(db, sql`SELECT count(*)::int AS count FROM material_unit_conversions WHERE material_code = ${remove}`),
      this.countSql(
        db,
        sql`SELECT count(*)::int AS count FROM manufactured_material_boms WHERE manufactured_material_code = ${remove}`,
      ),
      this.countSql(db, sql`SELECT count(*)::int AS count FROM manufactured_material_boms WHERE material_code = ${remove}`),
      this.countSql(db, sql`SELECT count(*)::int AS count FROM product_standard_boms WHERE material_code = ${remove}`),
      this.countSql(
        db,
        sql`SELECT count(*)::int AS count FROM material_purchase_requisition_items WHERE material_code = ${remove}`,
      ),
      this.countSql(db, sql`SELECT count(*)::int AS count FROM material_purchase_order_items WHERE material_code = ${remove}`),
      this.countSql(db, sql`SELECT count(*)::int AS count FROM inventory_transaction_items WHERE material_code = ${remove}`),
      this.countSql(db, sql`SELECT count(*)::int AS count FROM legacy_issue_permit_items WHERE material_code = ${remove}`),
      this.countSql(db, sql`SELECT count(*)::int AS count FROM maintenance_order_materials WHERE material_code = ${remove}`),
      this.countSql(
        db,
        sql`SELECT count(*)::int AS count FROM outsourcing_order_items WHERE manufactured_material_code = ${remove}`,
      ),
      this.countSql(db, sql`SELECT count(*)::int AS count FROM request_for_quotation_items WHERE material_code = ${remove}`),
      this.countSql(db, sql`SELECT count(*)::int AS count FROM supplier_quotation_items WHERE material_code = ${remove}`),
    ]);

    return [
      { key: 'unitConversions', count: unitConversions },
      { key: 'ownMmBomLines', count: ownMmBomLines },
      { key: 'componentOfMmBoms', count: componentOfMmBoms },
      { key: 'productBomLines', count: productBomLines },
      { key: 'purchaseRequisitions', count: purchaseRequisitions },
      { key: 'purchaseOrders', count: purchaseOrders },
      { key: 'inventoryTransactions', count: inventoryTransactions },
      { key: 'legacyIssuePermits', count: legacyIssuePermits },
      { key: 'maintenanceOrders', count: maintenanceOrders },
      { key: 'outsourcingOrders', count: outsourcingOrders },
      { key: 'requestForQuotations', count: requestForQuotations },
      { key: 'supplierQuotations', count: supplierQuotations },
    ];
  }

  // ============================== HELPERS ==============================

  private expectUpdated(name: string, expected: number, actual: number): void {
    if (actual !== expected) {
      throw new ConflictException(
        translate(
          `${name}: expected to update ${expected} row(s), actually updated ${actual}.`,
          `${name}: المتوقع تحديث ${expected} صف(وف)، تم تحديث ${actual}.`,
        ),
      );
    }
  }

  private async countSql(db: DrizzleDB, query: ReturnType<typeof sql>): Promise<number> {
    const rows = this.executeRows(await db.execute(query));
    return this.toCount(rows[0]?.count);
  }

  private async collectUnitsSql(
    db: DrizzleDB,
    table: string,
    materialColumn: string,
    unitColumn: string,
    code: string,
  ): Promise<MaterialUnit[]> {
    const rows = this.executeRows(
      await db.execute(sql`
        SELECT DISTINCT ${sql.raw(unitColumn)} AS unit
        FROM ${sql.raw(table)}
        WHERE ${sql.raw(materialColumn)} = ${code}
          AND ${sql.raw(unitColumn)} IS NOT NULL
      `),
    );

    return rows.map((row) => row.unit as MaterialUnit).filter(Boolean);
  }

  private async collisionParentIds(db: DrizzleDB, query: ReturnType<typeof sql>): Promise<string[]> {
    const rows = this.executeRows(await db.execute(query));
    return [...new Set(rows.map((row) => String(row.parent_id ?? '')).filter(Boolean))];
  }

  private formatIdList(ids: string[]): string {
    if (ids.length === 0) return '(none)';
    const shown = ids.slice(0, ID_PRINT_LIMIT);
    const extra = ids.length - shown.length;
    return extra > 0 ? `${shown.join(', ')} ... +${extra} more` : shown.join(', ');
  }

  private executeRows(result: unknown): Record<string, unknown>[] {
    if (Array.isArray(result)) return result as Record<string, unknown>[];
    if (result && typeof result === 'object' && 'rows' in result && Array.isArray((result as { rows: unknown }).rows)) {
      return (result as { rows: Record<string, unknown>[] }).rows;
    }
    throw new Error('Unexpected execute() result shape.');
  }

  private toCount(value: unknown): number {
    const count = Number(value);
    if (!Number.isFinite(count)) throw new Error(`Could not parse row count: ${String(value)}`);
    return count;
  }

  private toNumber(value: unknown, label: string): number {
    const n = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(n)) throw new Error(`Could not parse ${label}: ${String(value)}`);
    return n;
  }

  private round6(n: number): number {
    return Math.round(n * 1e6) / 1e6;
  }

  private factorsEqual(a: number, b: number): boolean {
    return this.round6(a) === this.round6(b);
  }
}
