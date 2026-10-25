import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { parseArgs } from 'node:util';
import { stdin as input, stdout as output } from 'node:process';
import * as readline from 'node:readline/promises';
import * as schema from '../../src/database/schema';
import type { MaterialType, MaterialUnit } from '../../src/utils/types';
import * as dotenv from 'dotenv';

dotenv.config();

const USAGE = `Usage: npm run merge:materials [-- [--keep <code>] [--remove <code>] [--dry-run]]

Repoints every reference from the removed material to the kept one, merges cached
quantity/price fields (converting when base units differ), then hard-deletes
the removed material.

If --keep / --remove are omitted, the script prompts for the two codes.

Guards:
  - Both materials must exist and be different codes
  - Kept material must not be soft-deleted (removed may be)
  - material_type must match
  - If base units differ, a conversion factor is required (kept conversion for
    the removed base, or the inverse of the removed conversion for the kept base)
  - Unique-constraint collisions abort (same parent already has both materials)
  - Conversion-factor mismatches abort

Line quantities and prices stay in their entered unit. Audit logging stays on.

This script requires interactive confirmation unless --dry-run is set.
There is no --force flag.

Options:
      --keep <code>     Material to keep (prompted if omitted)
      --remove <code>   Material to merge into the kept one, then delete (prompted if omitted)
      --dry-run         Print the plan and exit without writing
  -h, --help            Show this help

Examples:
  npm run merge:materials
  npm run merge:materials -- --keep 452282 --remove 569005 --dry-run`;

const CONFIRM_PHRASE = 'MERGE MATERIALS';
const ID_PRINT_LIMIT = 20;

type Db = ReturnType<typeof drizzle<typeof schema>>;
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

type CliArgs = {
  keep?: string;
  remove?: string;
  dryRun: boolean;
};

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

type Collision = { label: string; ids: string[] };

type RefCount = { name: string; count: number };

type ScanResult = {
  refCounts: RefCount[];
  mmBomRowCount: number;
  usedUnits: MaterialUnit[];
  collisions: Collision[];
  unrecognizedUnits: MaterialUnit[];
};

const MATERIAL_REF_COLUMNS: { name: string; table: string; column: string }[] = [
  { name: 'material_unit_conversions', table: 'material_unit_conversions', column: 'material_code' },
  { name: 'manufactured_material_boms.manufactured_material_code', table: 'manufactured_material_boms', column: 'manufactured_material_code' },
  { name: 'manufactured_material_boms.material_code', table: 'manufactured_material_boms', column: 'material_code' },
  { name: 'product_standard_boms', table: 'product_standard_boms', column: 'material_code' },
  { name: 'material_purchase_requisition_items', table: 'material_purchase_requisition_items', column: 'material_code' },
  { name: 'inventory_transaction_items', table: 'inventory_transaction_items', column: 'material_code' },
  { name: 'legacy_issue_permit_items', table: 'legacy_issue_permit_items', column: 'material_code' },
  { name: 'maintenance_order_materials', table: 'maintenance_order_materials', column: 'material_code' },
  { name: 'outsourcing_order_items', table: 'outsourcing_order_items', column: 'manufactured_material_code' },
  { name: 'request_for_quotation_items', table: 'request_for_quotation_items', column: 'material_code' },
  { name: 'supplier_quotation_items', table: 'supplier_quotation_items', column: 'material_code' },
  { name: 'material_purchase_order_items', table: 'material_purchase_order_items', column: 'material_code' },
];

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

function parseCliArgs(): CliArgs {
  try {
    const { values } = parseArgs({
      options: {
        help: { type: 'boolean', short: 'h' },
        keep: { type: 'string' },
        remove: { type: 'string' },
        'dry-run': { type: 'boolean', default: false },
      },
      allowPositionals: false,
    });

    if (values.help) {
      console.log(USAGE);
      process.exit(0);
    }

    return {
      keep: values.keep?.trim() || undefined,
      remove: values.remove?.trim() || undefined,
      dryRun: Boolean(values['dry-run']),
    };
  } catch (e) {
    if (e instanceof Error && e.message.startsWith('--')) {
      console.error(e.message);
    } else if (e instanceof Error) {
      console.error(`Error: ${e.message}`);
    }
    console.error(`\n${USAGE}`);
    process.exit(1);
  }
}

function maskConnectionString(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.password) parsed.password = '****';
    return parsed.toString();
  } catch {
    return '[invalid DATABASE_URL]';
  }
}

function toCount(value: unknown): number {
  const count = Number(value);
  if (!Number.isFinite(count)) throw new Error(`Could not parse row count: ${String(value)}`);
  return count;
}

function toNumber(value: unknown, label: string): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) throw new Error(`Could not parse ${label}: ${String(value)}`);
  return n;
}

function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

function factorsEqual(a: number, b: number): boolean {
  return round6(a) === round6(b);
}

function executeRows(result: unknown): Record<string, unknown>[] {
  if (Array.isArray(result)) return result as Record<string, unknown>[];
  if (result && typeof result === 'object' && 'rows' in result && Array.isArray((result as { rows: unknown }).rows)) {
    return (result as { rows: Record<string, unknown>[] }).rows;
  }
  throw new Error('Unexpected execute() result shape.');
}

function asStringIds(rows: Record<string, unknown>[], column = 'parent_id'): string[] {
  return rows.map((row) => String(row[column] ?? '')).filter(Boolean);
}

function formatIdList(ids: string[]): string {
  if (ids.length === 0) return '(none)';
  const shown = ids.slice(0, ID_PRINT_LIMIT);
  const extra = ids.length - shown.length;
  return extra > 0 ? `${shown.join(', ')} ... +${extra} more` : shown.join(', ');
}

async function promptExact(rl: readline.Interface, prompt: string, expected: string): Promise<void> {
  const answer = (await rl.question(prompt)).trim();
  if (answer !== expected) {
    throw new Error(`Confirmation failed. Expected "${expected}", got "${answer || '(empty)'}". No rows were changed.`);
  }
}

async function loadMaterial(db: Db, code: string): Promise<MaterialRow | undefined> {
  const [row] = await db
    .select({
      code: schema.materials.code,
      title: schema.materials.title,
      legacyCode: schema.materials.legacyCode,
      materialType: schema.materials.materialType,
      unitOfMeasurement: schema.materials.unitOfMeasurement,
      quantity: schema.materials.quantity,
      unitPrice: schema.materials.unitPrice,
      openingQuantity: schema.materials.openingQuantity,
      openingUnitPrice: schema.materials.openingUnitPrice,
      minimumStock: schema.materials.minimumStock,
      marketUnitPrice: schema.materials.marketUnitPrice,
      marketUnitPriceSetAt: schema.materials.marketUnitPriceSetAt,
      marketUnitPriceSetBy: schema.materials.marketUnitPriceSetBy,
      marketManufacturingCost: schema.materials.marketManufacturingCost,
      marketManufacturingCostSetAt: schema.materials.marketManufacturingCostSetAt,
      marketManufacturingCostSetBy: schema.materials.marketManufacturingCostSetBy,
      deletedAt: schema.materials.deletedAt,
      createdBy: schema.materials.createdBy,
    })
    .from(schema.materials)
    .where(eq(schema.materials.code, code))
    .limit(1);

  return row;
}

async function loadConversions(db: Db, materialCode: string): Promise<ConversionRow[]> {
  const rows = await db
    .select({
      id: schema.materialUnitConversions.id,
      unit: schema.materialUnitConversions.unit,
      conversionFactorToBase: schema.materialUnitConversions.conversionFactorToBase,
    })
    .from(schema.materialUnitConversions)
    .where(eq(schema.materialUnitConversions.materialCode, materialCode));

  return rows.map((row) => ({
    id: row.id,
    unit: row.unit,
    conversionFactorToBase: toNumber(row.conversionFactorToBase, `conversion factor for ${row.unit}`),
  }));
}

function resolveFactor(
  kept: MaterialRow,
  removed: MaterialRow,
  keptConversions: ConversionRow[],
  removedConversions: ConversionRow[],
): number {
  if (kept.unitOfMeasurement === removed.unitOfMeasurement) return 1;

  const fromKept = keptConversions.find((row) => row.unit === removed.unitOfMeasurement);
  if (fromKept) {
    const factor = round6(fromKept.conversionFactorToBase);
    if (factor <= 0) {
      throw new Error(
        `Kept material conversion for unit "${removed.unitOfMeasurement}" is not a positive factor (${fromKept.conversionFactorToBase}).`,
      );
    }
    return factor;
  }

  const fromRemoved = removedConversions.find((row) => row.unit === kept.unitOfMeasurement);
  if (fromRemoved && fromRemoved.conversionFactorToBase > 0) {
    const factor = round6(1 / fromRemoved.conversionFactorToBase);
    if (factor <= 0) {
      throw new Error(
        `Inverse of removed material conversion for unit "${kept.unitOfMeasurement}" is not a positive factor.`,
      );
    }
    return factor;
  }

  throw new Error(
    `Base units differ (keep=${kept.unitOfMeasurement}, remove=${removed.unitOfMeasurement}) and no conversion factor was found. ` +
      `Add a conversion on the kept material for "${removed.unitOfMeasurement}", or on the removed material for "${kept.unitOfMeasurement}".`,
  );
}

function planConversions(
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
    const newFactor = round6(conv.conversionFactorToBase * factor);

    if (conv.unit === kept.unitOfMeasurement) {
      actions.push({ kind: 'drop', id: conv.id, unit: conv.unit, reason: 'equals kept base unit' });
      continue;
    }

    const existing = keptByUnit.get(conv.unit);
    if (existing) {
      if (factorsEqual(existing.conversionFactorToBase, newFactor)) {
        actions.push({
          kind: 'drop',
          id: conv.id,
          unit: conv.unit,
          reason: 'kept already has the same factor',
        });
      } else {
        factorMismatches.push(
          `${conv.unit}: kept=${existing.conversionFactorToBase}, merged=${newFactor}`,
        );
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

async function countSql(db: Pick<Db, 'execute'>, query: ReturnType<typeof sql>): Promise<number> {
  const rows = executeRows(await db.execute(query));
  return toCount(rows[0]?.count);
}

async function collectUnitsSql(
  db: Pick<Db, 'execute'>,
  table: string,
  materialColumn: string,
  unitColumn: string,
  code: string,
): Promise<MaterialUnit[]> {
  const rows = executeRows(
    await db.execute(sql`
      SELECT DISTINCT ${sql.raw(unitColumn)} AS unit
      FROM ${sql.raw(table)}
      WHERE ${sql.raw(materialColumn)} = ${code}
        AND ${sql.raw(unitColumn)} IS NOT NULL
    `),
  );

  return rows.map((row) => row.unit as MaterialUnit).filter(Boolean);
}

async function collisionParentIds(db: Db, query: ReturnType<typeof sql>): Promise<string[]> {
  const rows = executeRows(await db.execute(query));
  return [...new Set(asStringIds(rows))];
}

async function scanReferences(
  db: Db,
  keep: string,
  remove: string,
  conversionPlan: ConversionPlan,
): Promise<ScanResult> {
  const refCounts: RefCount[] = [];
  for (const target of MATERIAL_REF_COLUMNS) {
    refCounts.push({
      name: target.name,
      count: await countSql(
        db,
        sql`SELECT count(*)::int AS count FROM ${sql.raw(target.table)} WHERE ${sql.raw(target.column)} = ${remove}`,
      ),
    });
  }

  const mmBomRowCount = await countSql(
    db,
    sql`SELECT count(*)::int AS count FROM manufactured_material_boms WHERE manufactured_material_code = ${remove} OR material_code = ${remove}`,
  );

  const usedUnits = [
    ...new Set(
      (
        await Promise.all(
          UNIT_SCAN_TARGETS.map((target) =>
            collectUnitsSql(db, target.table, target.materialColumn, target.unitColumn, remove),
          ),
        )
      ).flat(),
    ),
  ];

  const collisions: Collision[] = [
    {
      label: 'mpoi_mpo_material_unique (same purchase order has both materials)',
      ids: await collisionParentIds(
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
      label: 'mprqi_mprq_material_unique (same requisition has both materials)',
      ids: await collisionParentIds(
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
      label: 'rfqi_rfq_material_unique (same RFQ has both materials)',
      ids: await collisionParentIds(
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
      label: 'mom_mo_material_unique (same maintenance order has both materials)',
      ids: await collisionParentIds(
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
      label: 'osoi_oso_manufactured_material_unique (same outsourcing order has both materials)',
      ids: await collisionParentIds(
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
      label: 'product_standard_boms_dimension_material_department_unique',
      ids: await collisionParentIds(
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
      label: 'manufactured_material_boms: same parent has both as components',
      ids: await collisionParentIds(
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
      label: 'manufactured_material_boms: both are parents of the same component',
      ids: await collisionParentIds(
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
      label: 'manufactured_material_boms: merge would create a self-reference',
      ids: await collisionParentIds(
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

function printMaterial(label: string, material: MaterialRow, conversions: ConversionRow[]): void {
  const deleted = material.deletedAt ? ` deletedAt=${material.deletedAt.toISOString()}` : '';
  console.log(`${label}: ${material.code}  ${material.title}${deleted}`);
  console.log(`  legacyCode=${material.legacyCode ?? '(none)'}  type=${material.materialType}  base=${material.unitOfMeasurement}`);
  console.log(`  quantity=${material.quantity}  unitPrice=${material.unitPrice}`);
  console.log(`  openingQuantity=${material.openingQuantity ?? '(null)'}  openingUnitPrice=${material.openingUnitPrice ?? '(null)'}`);
  console.log(`  minimumStock=${material.minimumStock ?? '(null)'}  marketUnitPrice=${material.marketUnitPrice ?? '(null)'}`);
  console.log(`  marketManufacturingCost=${material.marketManufacturingCost ?? '(null)'}`);
  if (conversions.length === 0) {
    console.log('  conversions: (none)');
    return;
  }
  for (const conv of conversions) {
    console.log(`  conversion  1 ${conv.unit} = ${conv.conversionFactorToBase} ${material.unitOfMeasurement}`);
  }
}

function mergeQtyPrice(
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
    quantity: round6(total),
    unitPrice: total === 0 ? round6(kp) : round6((kq * kp + rq * rp) / total),
  };
}

function mergedMaterialFields(kept: MaterialRow, removed: MaterialRow, factor: number) {
  const stock = mergeQtyPrice(kept.quantity, kept.unitPrice, removed.quantity, removed.unitPrice, factor);

  const hasOpening = kept.openingQuantity != null || removed.openingQuantity != null;
  const opening = hasOpening
    ? mergeQtyPrice(kept.openingQuantity, kept.openingUnitPrice, removed.openingQuantity, removed.openingUnitPrice, factor)
    : null;

  const minimumStock =
    kept.minimumStock != null
      ? kept.minimumStock
      : removed.minimumStock != null
        ? round6(removed.minimumStock * factor)
        : null;

  const keepMarket = kept.marketUnitPrice != null;
  const marketUnitPrice = keepMarket
    ? kept.marketUnitPrice
    : removed.marketUnitPrice != null
      ? round6(removed.marketUnitPrice / factor)
      : null;
  const marketUnitPriceSetAt = keepMarket ? kept.marketUnitPriceSetAt : removed.marketUnitPriceSetAt;
  const marketUnitPriceSetBy = keepMarket ? kept.marketUnitPriceSetBy : removed.marketUnitPriceSetBy;

  const keepMarketMfg = kept.marketManufacturingCost != null;
  const marketManufacturingCost = keepMarketMfg
    ? kept.marketManufacturingCost
    : removed.marketManufacturingCost != null
      ? round6(removed.marketManufacturingCost / factor)
      : null;
  const marketManufacturingCostSetAt = keepMarketMfg
    ? kept.marketManufacturingCostSetAt
    : removed.marketManufacturingCostSetAt;
  const marketManufacturingCostSetBy = keepMarketMfg
    ? kept.marketManufacturingCostSetBy
    : removed.marketManufacturingCostSetBy;

  return {
    quantity: stock.quantity,
    unitPrice: stock.unitPrice,
    openingQuantity: opening ? opening.quantity : kept.openingQuantity,
    openingUnitPrice: opening ? opening.unitPrice : kept.openingUnitPrice,
    minimumStock,
    marketUnitPrice,
    marketUnitPriceSetAt,
    marketUnitPriceSetBy,
    marketManufacturingCost,
    marketManufacturingCostSetAt,
    marketManufacturingCostSetBy,
  };
}

async function countRemaining(db: Pick<Db, 'execute'>, remove: string): Promise<RefCount[]> {
  const counts: RefCount[] = [];
  for (const target of MATERIAL_REF_COLUMNS) {
    counts.push({
      name: target.name,
      count: await countSql(
        db,
        sql`SELECT count(*)::int AS count FROM ${sql.raw(target.table)} WHERE ${sql.raw(target.column)} = ${remove}`,
      ),
    });
  }
  return counts;
}

function expectUpdated(name: string, expected: number, actual: number): void {
  if (actual !== expected) {
    throw new Error(`${name}: expected to update ${expected} row(s), actually updated ${actual}. Rolling back.`);
  }
}

async function runMerge(
  tx: Tx,
  keep: string,
  remove: string,
  kept: MaterialRow,
  removed: MaterialRow,
  factor: number,
  conversionPlan: ConversionPlan,
  scan: ScanResult,
): Promise<void> {
  await tx.execute(sql`SET LOCAL statement_timeout = 0`);
  await tx.execute(sql`SET LOCAL idle_in_transaction_session_timeout = 0`);

  const psbNullUnits = await tx
    .update(schema.productStandardBoms)
    .set({ unitOfMeasurementSelected: removed.unitOfMeasurement })
    .where(and(eq(schema.productStandardBoms.materialCode, remove), isNull(schema.productStandardBoms.unitOfMeasurementSelected)))
    .returning({ id: schema.productStandardBoms.id });
  console.log(`  filled ${String(psbNullUnits.length).padStart(8)}  product_standard_boms.unit_of_measurement_selected`);

  const mmbNullUnits = await tx
    .update(schema.manufacturedMaterialBoms)
    .set({ unitOfMeasurementSelected: removed.unitOfMeasurement })
    .where(
      and(eq(schema.manufacturedMaterialBoms.materialCode, remove), isNull(schema.manufacturedMaterialBoms.unitOfMeasurementSelected)),
    )
    .returning({ id: schema.manufacturedMaterialBoms.id });
  console.log(`  filled ${String(mmbNullUnits.length).padStart(8)}  manufactured_material_boms.unit_of_measurement_selected`);

  const dropIds = conversionPlan.actions.filter((action) => action.kind === 'drop').map((action) => action.id);
  if (dropIds.length > 0) {
    const deleted = await tx
      .delete(schema.materialUnitConversions)
      .where(inArray(schema.materialUnitConversions.id, dropIds))
      .returning({ id: schema.materialUnitConversions.id });
    expectUpdated('material_unit_conversions (drop)', dropIds.length, deleted.length);
    console.log(`  dropped ${String(deleted.length).padStart(8)}  material_unit_conversions`);
  }

  const repoints = conversionPlan.actions.filter((action): action is ConversionRepoint => action.kind === 'repoint');
  for (const action of repoints) {
    const updated = await tx
      .update(schema.materialUnitConversions)
      .set({
        materialCode: keep,
        conversionFactorToBase: action.newFactor,
      })
      .where(eq(schema.materialUnitConversions.id, action.id))
      .returning({ id: schema.materialUnitConversions.id });
    expectUpdated(`material_unit_conversions ${action.unit}`, 1, updated.length);
  }
  if (repoints.length > 0) {
    console.log(`  repointed ${String(repoints.length).padStart(8)}  material_unit_conversions`);
  }

  if (conversionPlan.addRemovedBase) {
    await tx.insert(schema.materialUnitConversions).values({
      materialCode: keep,
      unit: removed.unitOfMeasurement,
      conversionFactorToBase: factor,
      createdBy: kept.createdBy,
    });
    console.log(`  added    ${String(1).padStart(8)}  material_unit_conversions (${removed.unitOfMeasurement} -> ${kept.unitOfMeasurement} x${factor})`);
  }

  const countByName = (name: string) => scan.refCounts.find((row) => row.name === name)?.count ?? 0;

  const mmBomUpdated = executeRows(
    await tx.execute(sql`
      UPDATE manufactured_material_boms
      SET
        material_code = CASE WHEN material_code = ${remove} THEN ${keep} ELSE material_code END,
        manufactured_material_code = CASE WHEN manufactured_material_code = ${remove} THEN ${keep} ELSE manufactured_material_code END
      WHERE material_code = ${remove} OR manufactured_material_code = ${remove}
      RETURNING id
    `),
  );
  expectUpdated('manufactured_material_boms', scan.mmBomRowCount, mmBomUpdated.length);
  console.log(`  updated ${String(mmBomUpdated.length).padStart(8)}  manufactured_material_boms`);

  const simpleUpdates: { name: string; run: () => Promise<{ id: string }[]> }[] = [
    {
      name: 'product_standard_boms',
      run: () =>
        tx
          .update(schema.productStandardBoms)
          .set({ materialCode: keep })
          .where(eq(schema.productStandardBoms.materialCode, remove))
          .returning({ id: schema.productStandardBoms.id }),
    },
    {
      name: 'material_purchase_requisition_items',
      run: () =>
        tx
          .update(schema.materialPurchaseRequisitionItems)
          .set({ materialCode: keep })
          .where(eq(schema.materialPurchaseRequisitionItems.materialCode, remove))
          .returning({ id: schema.materialPurchaseRequisitionItems.id }),
    },
    {
      name: 'inventory_transaction_items',
      run: () =>
        tx
          .update(schema.inventoryTransactionItems)
          .set({ materialCode: keep })
          .where(eq(schema.inventoryTransactionItems.materialCode, remove))
          .returning({ id: schema.inventoryTransactionItems.id }),
    },
    {
      name: 'legacy_issue_permit_items',
      run: () =>
        tx
          .update(schema.legacyIssuePermitItems)
          .set({ materialCode: keep })
          .where(eq(schema.legacyIssuePermitItems.materialCode, remove))
          .returning({ id: schema.legacyIssuePermitItems.id }),
    },
    {
      name: 'maintenance_order_materials',
      run: () =>
        tx
          .update(schema.maintenanceOrderMaterials)
          .set({ materialCode: keep })
          .where(eq(schema.maintenanceOrderMaterials.materialCode, remove))
          .returning({ id: schema.maintenanceOrderMaterials.id }),
    },
    {
      name: 'outsourcing_order_items',
      run: () =>
        tx
          .update(schema.outsourcingOrderItems)
          .set({ manufacturedMaterialCode: keep })
          .where(eq(schema.outsourcingOrderItems.manufacturedMaterialCode, remove))
          .returning({ id: schema.outsourcingOrderItems.id }),
    },
  ];

  for (const target of simpleUpdates) {
    const updated = await target.run();
    expectUpdated(target.name, countByName(target.name), updated.length);
    console.log(`  updated ${String(updated.length).padStart(8)}  ${target.name}`);
  }

  const rfqiExpected = countByName('request_for_quotation_items');
  const sqiExpected = countByName('supplier_quotation_items');
  const mpoiExpected = countByName('material_purchase_order_items');

  if (rfqiExpected + sqiExpected + mpoiExpected > 0) {
    let cteRows: Record<string, unknown>[];
    try {
      cteRows = executeRows(
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
      throw new Error(
        `Composite FK update failed for request_for_quotation_items / supplier_quotation_items / material_purchase_order_items. ${message}`,
      );
    }

    const cte = cteRows[0] ?? {};
    expectUpdated('request_for_quotation_items', rfqiExpected, toCount(cte.rfqi_count ?? 0));
    expectUpdated('supplier_quotation_items', sqiExpected, toCount(cte.sqi_count ?? 0));
    expectUpdated('material_purchase_order_items', mpoiExpected, toCount(cte.mpoi_count ?? 0));
    console.log(`  updated ${String(rfqiExpected).padStart(8)}  request_for_quotation_items`);
    console.log(`  updated ${String(sqiExpected).padStart(8)}  supplier_quotation_items`);
    console.log(`  updated ${String(mpoiExpected).padStart(8)}  material_purchase_order_items`);
  }

  const merged = mergedMaterialFields(kept, removed, factor);
  const keptUpdated = await tx
    .update(schema.materials)
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
    .where(eq(schema.materials.code, keep))
    .returning({ code: schema.materials.code });
  expectUpdated('materials (kept figures)', 1, keptUpdated.length);
  console.log(`  updated ${String(1).padStart(8)}  materials ${keep} cached figures`);

  const deleted = await tx
    .delete(schema.materials)
    .where(eq(schema.materials.code, remove))
    .returning({ code: schema.materials.code });
  expectUpdated('materials (delete removed)', 1, deleted.length);
  console.log(`  deleted ${String(1).padStart(8)}  materials ${remove}`);

  const remaining = await countRemaining(tx, remove);
  const leftover = remaining.filter((row) => row.count > 0);
  if (leftover.length > 0) {
    const details = leftover.map((row) => `${row.name}=${row.count}`).join(', ');
    throw new Error(`Post-merge verification failed: ${details} still reference ${remove}. Rolling back.`);
  }
}

async function promptForCodes(partial: { keep?: string; remove?: string }): Promise<{ keep: string; remove: string }> {
  if (partial.keep && partial.remove) return { keep: partial.keep, remove: partial.remove };

  const rl = readline.createInterface({ input, output });
  try {
    console.log('\nEnter the two material codes to merge.');
    const keep = partial.keep ?? (await rl.question('Code to keep: ')).trim();
    if (!keep) throw new Error('Kept material code is required.');

    const remove = partial.remove ?? (await rl.question('Code to remove (merged into the kept one, then deleted): ')).trim();
    if (!remove) throw new Error('Removed material code is required.');

    return { keep, remove };
  } finally {
    rl.close();
  }
}

async function confirmMerge(remove: string): Promise<void> {
  const rl = readline.createInterface({ input, output });
  try {
    console.log('\nStep 1 of 2 - type the exact phrase to confirm the merge.');
    console.log(`Phrase: ${CONFIRM_PHRASE}`);
    await promptExact(rl, `Type ${CONFIRM_PHRASE}: `, CONFIRM_PHRASE);

    console.log(`\nStep 2 of 2 - type the removed material code (${remove}).`);
    await promptExact(rl, `Type ${remove}: `, remove);
  } finally {
    rl.close();
  }
}

async function main() {
  const args = parseCliArgs();
  const { keep, remove } = await promptForCodes(args);
  const dryRun = args.dryRun;

  if (keep === remove) throw new Error('Keep and remove must be different codes.');

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is not defined in .env');

  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle(pool, { schema });
  let transactionStarted = false;

  try {
    const kept = await loadMaterial(db, keep);
    const removed = await loadMaterial(db, remove);

    if (!kept) throw new Error(`Kept material "${keep}" was not found.`);
    if (!removed) throw new Error(`Removed material "${remove}" was not found.`);
    if (kept.deletedAt) throw new Error(`Kept material "${keep}" is soft-deleted. Choose a live material to keep.`);
    if (kept.materialType !== removed.materialType) {
      throw new Error(`material_type mismatch: keep=${kept.materialType}, remove=${removed.materialType}.`);
    }

    const keptConversions = await loadConversions(db, keep);
    const removedConversions = await loadConversions(db, remove);
    const factor = resolveFactor(kept, removed, keptConversions, removedConversions);
    const conversionPlan = planConversions(kept, removed, keptConversions, removedConversions, factor);

    if (conversionPlan.factorMismatches.length > 0) {
      console.error('\nConversion-factor mismatches (aborting):');
      for (const line of conversionPlan.factorMismatches) console.error(`  ${line}`);
      throw new Error('Kept and removed materials define the same alternate unit with different factors.');
    }

    const scan = await scanReferences(db, keep, remove, conversionPlan);
    const liveCollisions = scan.collisions.filter((row) => row.ids.length > 0);

    console.log('\n========== MERGE MATERIALS ==========');
    console.log(`Database: ${maskConnectionString(databaseUrl)}`);
    console.log(`Mode:     ${dryRun ? 'dry-run (no writes)' : 'write'}`);
    console.log(`Factor f: 1 ${removed.unitOfMeasurement} = ${factor} ${kept.unitOfMeasurement}`);
    console.log('');
    printMaterial('KEEP  ', kept, keptConversions);
    console.log('');
    printMaterial('REMOVE', removed, removedConversions);
    if (removed.legacyCode) {
      console.log(`\nWarning: removed material has legacy_code "${removed.legacyCode}". Re-running seed:materials may recreate this duplicate.`);
    }

    console.log('\nReferences on the removed material:');
    for (const row of scan.refCounts) {
      console.log(`  ${String(row.count).padStart(8)}  ${row.name}`);
    }
    console.log(`  ${String(scan.mmBomRowCount).padStart(8)}  manufactured_material_boms rows (either column)`);

    const drops = conversionPlan.actions.filter((action) => action.kind === 'drop');
    const repoints = conversionPlan.actions.filter((action) => action.kind === 'repoint');
    console.log('\nUnit conversions:');
    console.log(`  drop ${drops.length}, repoint ${repoints.length}, add removed base unit: ${conversionPlan.addRemovedBase ? 'yes' : 'no'}`);
    for (const action of conversionPlan.actions) {
      if (action.kind === 'drop') console.log(`    drop ${action.unit} (${action.reason})`);
      else console.log(`    repoint ${action.unit}: ${action.oldFactor} -> ${action.newFactor}`);
    }
    if (scan.usedUnits.length > 0) {
      console.log(`  units used on removed-material lines: ${scan.usedUnits.join(', ')}`);
    }

    const merged = mergedMaterialFields(kept, removed, factor);
    console.log('\nKept material figures after merge:');
    console.log(`  quantity ${kept.quantity} -> ${merged.quantity}`);
    console.log(`  unitPrice ${kept.unitPrice} -> ${merged.unitPrice}`);
    console.log(`  openingQuantity ${kept.openingQuantity ?? '(null)'} -> ${merged.openingQuantity ?? '(null)'}`);
    console.log(`  openingUnitPrice ${kept.openingUnitPrice ?? '(null)'} -> ${merged.openingUnitPrice ?? '(null)'}`);
    console.log(`  minimumStock ${kept.minimumStock ?? '(null)'} -> ${merged.minimumStock ?? '(null)'}`);
    console.log(`  marketUnitPrice ${kept.marketUnitPrice ?? '(null)'} -> ${merged.marketUnitPrice ?? '(null)'}`);
    console.log(
      `  marketManufacturingCost ${kept.marketManufacturingCost ?? '(null)'} -> ${merged.marketManufacturingCost ?? '(null)'}`,
    );

    if (scan.unrecognizedUnits.length > 0) {
      throw new Error(
        `Removed material lines use units that the kept material would not recognize after merge: ${scan.unrecognizedUnits.join(', ')}.`,
      );
    }

    if (liveCollisions.length > 0) {
      console.error('\nUnique-constraint collisions (aborting):');
      for (const collision of liveCollisions) {
        console.error(`  ${collision.label}`);
        console.error(`    ${formatIdList(collision.ids)}`);
      }
      throw new Error('Merge aborted because the same parent already references both materials. Resolve those rows manually, then re-run.');
    }

    if (dryRun) {
      console.log('\nDry-run complete. No rows were changed.');
      return;
    }

    await confirmMerge(remove);

    console.log('\nMerging in one database transaction...');
    await db.transaction(async (tx) => {
      transactionStarted = true;
      await runMerge(tx, keep, remove, kept, removed, factor, conversionPlan, scan);
    });

    console.log('\nMerge completed.');
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    if (transactionStarted) {
      console.error('Merge failed; all database changes from this run were rolled back.');
    }
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

void main();
