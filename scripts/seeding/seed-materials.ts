import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq, sql } from 'drizzle-orm';
import { parse } from 'csv-parse/sync';
import { parseArgs } from 'node:util';
import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import * as schema from '../../src/database/schema';
import { MATERIAL_TYPES, MATERIAL_TYPE_VALUES, MATERIAL_UNIT_VALUES } from '../../src/utils/constants';
import { ensureNoUnitMismatchesBeforeSeeding } from '../_utils/unit-mismatch-guard';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

dotenv.config();

const USAGE = `Usage: npm run seed:materials [-- --email <email> | --id <uuid>]

Seeds materials from:
  - data/materials/raw-materials/results/clean-raw-materials.csv      (${MATERIAL_TYPES.RAW_MATERIALS})
  - data/materials/raw-materials/results/clean-stagnant-glass.csv     (${MATERIAL_TYPES.RAW_MATERIALS}, no legacyCode)
  - data/materials/spare-parts/results/clean-spare-parts.csv          (${MATERIAL_TYPES.SPARE_PARTS})

If --email / --id are omitted, you will be prompted for an email or user ID.
The user must be an active admin.

Options:
  -e, --email <email>  Existing user email stamped as createdBy
  -i, --id <uuid>      Existing user ID stamped as createdBy
  -h, --help           Show this help

Examples:
  npm run seed:materials
  npm run seed:materials -- --email admin@example.com
  npm run seed:materials -- --id 00000000-0000-0000-0000-000000000001`;

type MaterialType = (typeof MATERIAL_TYPE_VALUES)[number];

type CsvRow = {
  legacyCode: string;
  title: string;
  mainCategoryLegacyCode: string;
  subCategoryLegacyCode: string;
  unitOfMeasurement: string;
  unitPrice: string;
  quantity: string;
};

type MaterialSource = {
  label: string;
  csvPath: string;
  materialType: MaterialType;
  extractHint: string;
};

type UnresolvedRow = {
  legacyCode: string;
  title: string;
  mainCategoryLegacyCode: string;
  subCategoryLegacyCode: string;
  materialType: MaterialType;
};

type DuplicateLegacyRow = {
  legacyCode: string;
  title: string;
  keptTitle: string;
  materialType: MaterialType;
};

type ExistingMaterialRef = {
  code: string;
  unitOfMeasurement: (typeof MATERIAL_UNIT_VALUES)[number];
};

type ExistingMaterialUpdate = {
  code: string;
  quantity: number;
  unitPrice: number;
};

type UnresolvableUnitRow = {
  legacyCode: string;
  title: string;
  unitRaw: string;
  reason: 'unknown-unit' | 'no-conversion';
  materialType: MaterialType;
};

const DATA_ROOT = path.join(__dirname, '../../data/materials');
const MATERIAL_SOURCES: MaterialSource[] = [
  {
    label: 'raw-materials',
    csvPath: path.join(DATA_ROOT, 'raw-materials/results/clean-raw-materials.csv'),
    materialType: MATERIAL_TYPES.RAW_MATERIALS,
    extractHint: 'npm run extract:raw-materials',
  },
  {
    label: 'stagnant-glass',
    csvPath: path.join(DATA_ROOT, 'raw-materials/results/clean-stagnant-glass.csv'),
    materialType: MATERIAL_TYPES.RAW_MATERIALS,
    extractHint: 'npm run extract:stagnant-glass',
  },
  {
    label: 'spare-parts',
    csvPath: path.join(DATA_ROOT, 'spare-parts/results/clean-spare-parts.csv'),
    materialType: MATERIAL_TYPES.SPARE_PARTS,
    extractHint: 'npm run extract:spare-parts',
  },
];
const BATCH_SIZE = 100;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const UNIT_AR_LABELS: Record<(typeof MATERIAL_UNIT_VALUES)[number], string> = {
  count: 'عدد',
  kg: 'كيلوجرام',
  gram: 'جرام',
  ton: 'طن',
  meter: 'متر',
  cm: 'سنتيمتر',
  square_meter: 'متر²',
  cubic_meter: 'متر³',
  liter: 'لتر',
};

const UNIT_AR_ALIASES: Partial<Record<(typeof MATERIAL_UNIT_VALUES)[number], string[]>> = {
  kg: ['كيلو', 'كجم'],
  square_meter: ['متر 2', 'م2', 'م²'],
  cubic_meter: ['متر 3', 'م3', 'م³'],
};

const ARABIC_TO_UNIT_KEY: Map<string, (typeof MATERIAL_UNIT_VALUES)[number]> = (() => {
  const map = new Map<string, (typeof MATERIAL_UNIT_VALUES)[number]>();
  for (const unit of MATERIAL_UNIT_VALUES) {
    map.set(unit, unit);
    map.set(UNIT_AR_LABELS[unit], unit);
    for (const alias of UNIT_AR_ALIASES[unit] ?? []) {
      map.set(alias, unit);
    }
  }
  return map;
})();

function parseCliArgs(): { email?: string; id?: string } {
  try {
    const { values } = parseArgs({
      options: {
        email: { type: 'string', short: 'e' },
        id: { type: 'string', short: 'i' },
        help: { type: 'boolean', short: 'h' },
      },
      allowPositionals: false,
    });

    if (values.help) {
      console.log(USAGE);
      process.exit(0);
    }

    return {
      email: values.email?.trim() || undefined,
      id: values.id?.trim() || undefined,
    };
  } catch {
    console.error(USAGE);
    process.exit(1);
  }
}

async function promptForUserIdentifier(partial: { email?: string; id?: string }): Promise<{ email?: string; id?: string }> {
  if (partial.email || partial.id) return partial;

  const rl = readline.createInterface({ input, output });
  try {
    console.log('\nEnter the user to stamp as createdBy (email or user ID).');
    const answer = (await rl.question('Email or user ID: ')).trim();
    if (!answer) throw new Error('Email or user ID is required.');

    if (UUID_RE.test(answer)) return { id: answer };
    return { email: answer };
  } finally {
    rl.close();
  }
}

async function confirmProceedWithExistingMaterials(existingCount: number): Promise<boolean> {
  if (existingCount === 0) return true;

  const rl = readline.createInterface({ input, output });
  try {
    console.log(`\nWarning: ${existingCount} material(s) already exist in the database.`);
    console.log('Seeding will insert missing materials (matched by legacyCode, or by title when legacyCode is absent).');
    console.log('Existing rows may be updated when the CSV unit is an alternate unit with a defined conversion.');
    const answer = (await rl.question('Type "yes" to continue, anything else to abort: ')).trim();
    return answer === 'yes';
  } finally {
    rl.close();
  }
}

async function resolveUser(db: ReturnType<typeof drizzle<typeof schema>>, identifier: { email?: string; id?: string }) {
  const user = identifier.id
    ? await db.query.users.findFirst({
        where: eq(schema.users.id, identifier.id),
        columns: { id: true, email: true, name: true, deletedAt: true, isAdmin: true },
      })
    : await db.query.users.findFirst({
        where: eq(schema.users.email, identifier.email!),
        columns: { id: true, email: true, name: true, deletedAt: true, isAdmin: true },
      });

  if (!user || user.deletedAt) {
    const label = identifier.email ? `email "${identifier.email}"` : `id "${identifier.id}"`;
    throw new Error(`No active user found with ${label}.`);
  }

  if (!user.isAdmin) {
    const label = user.email ? `${user.name} <${user.email}>` : `${user.name} (${user.id})`;
    throw new Error(`User ${label} is not an admin. Only admins can seed materials.`);
  }

  return user;
}

function generateUniqueCode(existing: Set<string>): string {
  for (let attempt = 0; attempt < 1000; attempt++) {
    // Full 6-digit range (100000–999999) so codes never have leading zeros
    const code = String(crypto.randomInt(100_000, 1_000_000));
    if (!existing.has(code)) {
      existing.add(code);
      return code;
    }
  }
  throw new Error('Failed to generate a unique 6-digit material code after 1000 attempts.');
}

function resolveMaterialUnit(raw: string): (typeof MATERIAL_UNIT_VALUES)[number] | null {
  const normalized = raw.trim();
  if (!normalized || normalized === '(فارغ)') return null;
  return ARABIC_TO_UNIT_KEY.get(normalized) ?? null;
}

async function loadConversionFactors(db: ReturnType<typeof drizzle<typeof schema>>) {
  const rows = await db
    .select({
      materialCode: schema.materialUnitConversions.materialCode,
      unit: schema.materialUnitConversions.unit,
      conversionFactorToBase: schema.materialUnitConversions.conversionFactorToBase,
    })
    .from(schema.materialUnitConversions);

  const result = new Map<string, Map<(typeof MATERIAL_UNIT_VALUES)[number], number>>();
  for (const row of rows) {
    let unitMap = result.get(row.materialCode);
    if (!unitMap) {
      unitMap = new Map();
      result.set(row.materialCode, unitMap);
    }
    unitMap.set(row.unit, Number(row.conversionFactorToBase));
  }
  return result;
}

function resolveConversionFactor({
  baseUnit,
  rawUnit,
  conversions,
}: {
  baseUnit: (typeof MATERIAL_UNIT_VALUES)[number];
  rawUnit: string;
  conversions?: Map<(typeof MATERIAL_UNIT_VALUES)[number], number>;
}): { ok: true; factor: number } | { ok: false; reason: 'unknown-unit' | 'no-conversion' } {
  const resolvedUnit = resolveMaterialUnit(rawUnit);
  if (!resolvedUnit) return { ok: false, reason: 'unknown-unit' };
  if (resolvedUnit === baseUnit) return { ok: true, factor: 1 };

  const factor = conversions?.get(resolvedUnit);
  if (factor == null) return { ok: false, reason: 'no-conversion' };
  return { ok: true, factor };
}

function toBaseValues(quantity: number, unitPrice: number, factor: number): { quantity: number; unitPrice: number } {
  return {
    quantity: quantity * factor,
    unitPrice: unitPrice / factor,
  };
}

function normalizeUnit(raw: string): string {
  return resolveMaterialUnit(raw) ?? 'count';
}

function normalizeCost(raw: string): number {
  const trimmed = raw.trim();
  if (!trimmed) return 0;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : 0;
}

function normalizeQuantity(raw: string): number {
  const trimmed = raw.trim();
  if (!trimmed) return 0;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : 0;
}

function loadCsvRows(source: MaterialSource): CsvRow[] {
  if (!fs.existsSync(source.csvPath)) {
    throw new Error(`CSV not found: ${source.csvPath}\nRun ${source.extractHint} first.`);
  }

  const csvData = fs.readFileSync(source.csvPath, 'utf-8').replace(/^\uFEFF/, '');
  const csvRows = parse<CsvRow>(csvData, { columns: true, skip_empty_lines: true, trim: true });

  if (csvRows.length > 0 && !('legacyCode' in csvRows[0])) {
    throw new Error(
      `CSV headers look wrong in ${source.label}. Expected "legacyCode", got: ${Object.keys(csvRows[0]).join(', ')}`,
    );
  }

  return csvRows;
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not defined in .env');
  await ensureNoUnitMismatchesBeforeSeeding('seed:materials');

  const cli = parseCliArgs();
  const identifier = await promptForUserIdentifier(cli);

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool, { schema });

  try {
    const user = await resolveUser(db, identifier);
    console.log(`Using createdBy: ${user.name} <${user.email ?? 'no email'}> (${user.id})`);

    const loadedSources: { source: MaterialSource; rows: CsvRow[] }[] = [];
    for (const source of MATERIAL_SOURCES) {
      const rows = loadCsvRows(source);
      console.log(`Loaded ${rows.length} rows from ${source.label} (${source.materialType})`);
      loadedSources.push({ source, rows });
    }

    const categoryRows = await db
      .select({
        subId: schema.materialCategorySubs.id,
        subLegacyCode: schema.materialCategorySubs.legacyCode,
        mainLegacyCode: schema.materialCategoryMains.legacyCode,
      })
      .from(schema.materialCategorySubs)
      .innerJoin(
        schema.materialCategoryMains,
        eq(schema.materialCategorySubs.mainCategoryId, schema.materialCategoryMains.id),
      );

    const categoryMap = new Map<string, string>();
    for (const row of categoryRows) {
      categoryMap.set(`${row.mainLegacyCode}:${row.subLegacyCode}`, row.subId);
    }
    console.log(`Loaded ${categoryMap.size} material subcategory mappings`);

    const existingMaterials = await db
      .select({
        code: schema.materials.code,
        legacyCode: schema.materials.legacyCode,
        title: schema.materials.title,
        unitOfMeasurement: schema.materials.unitOfMeasurement,
      })
      .from(schema.materials);

    const usedCodes = new Set<string>();
    const existingByLegacy = new Map<string, ExistingMaterialRef>();
    const existingByTitle = new Map<string, ExistingMaterialRef>();
    for (const row of existingMaterials) {
      usedCodes.add(row.code);
      if (row.legacyCode) {
        existingByLegacy.set(row.legacyCode, { code: row.code, unitOfMeasurement: row.unitOfMeasurement });
      }
      if (!existingByTitle.has(row.title)) {
        existingByTitle.set(row.title, { code: row.code, unitOfMeasurement: row.unitOfMeasurement });
      }
    }
    console.log(`Existing materials in DB: ${existingMaterials.length}`);
    const conversionFactorsByCode = await loadConversionFactors(db);

    if (!(await confirmProceedWithExistingMaterials(existingMaterials.length))) {
      console.log('Aborted.');
      process.exitCode = 1;
      return;
    }

    const toInsert: (typeof schema.materials.$inferInsert)[] = [];
    const unresolved: UnresolvedRow[] = [];
    const duplicateLegacyCodes: DuplicateLegacyRow[] = [];
    const existingUpdates: ExistingMaterialUpdate[] = [];
    const unresolvableUnitRows: UnresolvableUnitRow[] = [];
    const seenRowKeys = new Map<string, string>(); // dedupe key -> kept title
    let skippedExisting = 0;
    let updatedExistingBase = 0;
    let convertedExisting = 0;
    let totalCsvRows = 0;
    const unitCounts = new Map<string, number>();
    const typeCounts = new Map<
      MaterialType,
      { loaded: number; inserted: number; updatedExistingBase: number; convertedExisting: number; skippedExisting: number }
    >();

    for (const { source, rows } of loadedSources) {
      const stats = typeCounts.get(source.materialType) ?? {
        loaded: 0,
        inserted: 0,
        updatedExistingBase: 0,
        convertedExisting: 0,
        skippedExisting: 0,
      };
      stats.loaded += rows.length;
      totalCsvRows += rows.length;

      for (const row of rows) {
        const legacyCode = row.legacyCode?.trim() || undefined;
        const title = row.title?.trim();
        const mainLegacy = row.mainCategoryLegacyCode?.trim();
        const subLegacy = row.subCategoryLegacyCode?.trim();

        if (!title || !mainLegacy || !subLegacy) continue;

        const dedupeKey = legacyCode ?? `title:${title}`;
        const keptTitle = seenRowKeys.get(dedupeKey);
        if (keptTitle != null) {
          duplicateLegacyCodes.push({
            legacyCode: legacyCode ?? '',
            title,
            keptTitle,
            materialType: source.materialType,
          });
          continue;
        }
        seenRowKeys.set(dedupeKey, title);

        const existingMaterial = legacyCode ? existingByLegacy.get(legacyCode) : existingByTitle.get(title);
        if (existingMaterial) {
          const conversionResult = resolveConversionFactor({
            baseUnit: existingMaterial.unitOfMeasurement,
            rawUnit: row.unitOfMeasurement ?? '',
            conversions: conversionFactorsByCode.get(existingMaterial.code),
          });

          if (!conversionResult.ok) {
            const { reason } = conversionResult;
            unresolvableUnitRows.push({
              legacyCode: legacyCode ?? '',
              title,
              unitRaw: row.unitOfMeasurement ?? '',
              reason,
              materialType: source.materialType,
            });
            continue;
          }

          const quantity = normalizeQuantity(row.quantity ?? '');
          const unitPrice = normalizeCost(row.unitPrice ?? '');
          const baseValues =
            conversionResult.factor === 1
              ? { quantity, unitPrice }
              : toBaseValues(quantity, unitPrice, conversionResult.factor);

          existingUpdates.push({
            code: existingMaterial.code,
            quantity: baseValues.quantity,
            unitPrice: baseValues.unitPrice,
          });
          if (conversionResult.factor === 1) {
            updatedExistingBase++;
            stats.updatedExistingBase++;
          } else {
            convertedExisting++;
            stats.convertedExisting++;
          }
          continue;
        }

        const subCategoryId = categoryMap.get(`${mainLegacy}:${subLegacy}`);
        if (!subCategoryId) {
          unresolved.push({
            legacyCode: legacyCode ?? '',
            title,
            mainCategoryLegacyCode: mainLegacy,
            subCategoryLegacyCode: subLegacy,
            materialType: source.materialType,
          });
          continue;
        }

        const unitOfMeasurement = normalizeUnit(row.unitOfMeasurement ?? '');
        const unitPrice = normalizeCost(row.unitPrice ?? '');
        const quantity = normalizeQuantity(row.quantity ?? '');

        unitCounts.set(unitOfMeasurement, (unitCounts.get(unitOfMeasurement) ?? 0) + 1);
        stats.inserted++;

        toInsert.push({
          code: generateUniqueCode(usedCodes),
          legacyCode: legacyCode ?? null,
          title,
          subCategoryId,
          materialType: source.materialType,
          unitOfMeasurement: unitOfMeasurement as (typeof MATERIAL_UNIT_VALUES)[number],
          unitPrice,
          quantity,
          openingUnitPrice: unitPrice,
          openingQuantity: quantity,
          createdBy: user.id,
        });
      }

      typeCounts.set(source.materialType, stats);
    }

    skippedExisting = totalCsvRows - toInsert.length - existingUpdates.length - unresolved.length - duplicateLegacyCodes.length - unresolvableUnitRows.length;

    console.log(`\nPrepared ${toInsert.length} new materials (${skippedExisting} already exist without updates)`);
    console.log(`Prepared ${updatedExistingBase} existing material update(s) using base units`);
    console.log(`Prepared ${convertedExisting} existing material update(s) from alternate units`);
    console.log(`Skipped unresolved categories: ${unresolved.length}`);
    console.log(`Skipped duplicate legacy codes: ${duplicateLegacyCodes.length}`);
    console.log(`Skipped rows with unresolvable units: ${unresolvableUnitRows.length}`);

    console.log('Writing all inserts and updates in one database transaction. A failure rolls back the entire run.');
    await db.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL statement_timeout = 0`);
      await tx.execute(sql`SET LOCAL idle_in_transaction_session_timeout = 0`);

      if (toInsert.length > 0) {
        for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
          const batch = toInsert.slice(i, i + BATCH_SIZE);
          await tx.insert(schema.materials).values(batch).onConflictDoNothing({ target: schema.materials.legacyCode });
          process.stdout.write(`\rInserted ${Math.min(i + BATCH_SIZE, toInsert.length)} / ${toInsert.length}`);
        }
        console.log();
      }

      for (const update of existingUpdates) {
        await tx
          .update(schema.materials)
          .set({
            quantity: update.quantity,
            unitPrice: update.unitPrice,
            openingQuantity: update.quantity,
            openingUnitPrice: update.unitPrice,
          })
          .where(eq(schema.materials.code, update.code));
      }
    });

    console.log('\n========== MATERIALS SEED STATS ==========');
    console.log(`CSV rows loaded:              ${totalCsvRows}`);
    console.log(`Inserted (new):               ${toInsert.length}`);
    console.log(`Updated existing (base unit): ${updatedExistingBase}`);
    console.log(`Converted existing materials: ${convertedExisting}`);
    console.log(`Skipped (already exist):      ${skippedExisting}`);
    console.log(`Skipped (unresolved category): ${unresolved.length}`);
    console.log(`Skipped (duplicate legacyCode): ${duplicateLegacyCodes.length}`);
    console.log(`Skipped (unresolvable unit):  ${unresolvableUnitRows.length}`);

    console.log('\n--- Per material type ---');
    for (const materialType of MATERIAL_TYPE_VALUES) {
      const s = typeCounts.get(materialType) ?? {
        loaded: 0,
        inserted: 0,
        updatedExistingBase: 0,
        convertedExisting: 0,
        skippedExisting: 0,
      };
      console.log(
        `  ${materialType}: loaded=${s.loaded}, inserted=${s.inserted}, updatedExistingBase=${s.updatedExistingBase}, convertedExisting=${s.convertedExisting}, skippedExisting=${s.skippedExisting}`,
      );
    }

    console.log('\n--- Unit distribution ---');
    for (const [unit, count] of [...unitCounts.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${unit}: ${count}`);
    }

    if (duplicateLegacyCodes.length > 0) {
      console.log('\n--- Duplicate legacy codes skipped (kept first) ---');
      for (const row of duplicateLegacyCodes.slice(0, 20)) {
        console.log(`  [${row.materialType}] ${row.legacyCode} | skipped "${row.title}" | kept "${row.keptTitle}"`);
      }
      if (duplicateLegacyCodes.length > 20) {
        console.log(`  ... and ${duplicateLegacyCodes.length - 20} more`);
      }
    }

    if (unresolved.length > 0) {
      console.log('\n--- Unresolved categories (samples) ---');
      for (const row of unresolved.slice(0, 20)) {
        console.log(
          `  [${row.materialType}] ${row.legacyCode} | ${row.mainCategoryLegacyCode}/${row.subCategoryLegacyCode} | ${row.title}`,
        );
      }
      if (unresolved.length > 20) {
        console.log(`  ... and ${unresolved.length - 20} more`);
      }
    }

    if (unresolvableUnitRows.length > 0) {
      console.log('\n--- Rows skipped because file units could not be converted ---');
      for (const row of unresolvableUnitRows.slice(0, 20)) {
        console.log(
          `  [${row.materialType}] ${row.legacyCode} | ${row.title} | unit="${row.unitRaw || '(فارغ)'}" | ${row.reason}`,
        );
      }
      if (unresolvableUnitRows.length > 20) {
        console.log(`  ... and ${unresolvableUnitRows.length - 20} more`);
      }
    }

    console.log('==========================================\n');
    console.log('Materials seed completed successfully.');
  } catch (e) {
    const err = e as Error & { cause?: { message?: string; code?: string; detail?: string } };
    console.error(err.message);
    if (err.cause?.message) console.error(`Cause: ${err.cause.message}`);
    if (err.cause?.detail) console.error(`Detail: ${err.cause.detail}`);
    console.error('Seed failed; all database changes from this run were rolled back.');
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

void main();
