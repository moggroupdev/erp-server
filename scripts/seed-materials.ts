import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import { parse } from 'csv-parse/sync';
import { parseArgs } from 'node:util';
import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import * as schema from '../src/database/schema';
import { MATERIAL_TYPES, MATERIAL_UNIT_VALUES } from '../src/utils/constants';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

dotenv.config();

const USAGE = `Usage: npm run seed:materials [-- --email <email> | --id <uuid>]

Seeds materials from data/materials/raw-materials/results/clean-materials.csv.

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

type CsvRow = {
  legacyCode: string;
  title: string;
  mainCategoryLegacyCode: string;
  subCategoryLegacyCode: string;
  unit: string;
  unitCost: string;
  quantity: string;
};

type UnresolvedRow = {
  legacyCode: string;
  title: string;
  mainCategoryLegacyCode: string;
  subCategoryLegacyCode: string;
};

type DuplicateLegacyRow = {
  legacyCode: string;
  title: string;
  keptTitle: string;
};

const VALID_UNITS = new Set<string>(MATERIAL_UNIT_VALUES);
const CSV_PATH = path.join(__dirname, '../data/materials/raw-materials/results/clean-materials.csv');
const BATCH_SIZE = 100;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
    console.log('Seeding will insert only missing materials (matched by legacyCode).');
    console.log('Existing rows will be left unchanged.');
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

function normalizeUnit(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return 'count';
  if (VALID_UNITS.has(trimmed)) return trimmed;
  return 'count';
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

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not defined in .env');

  const cli = parseCliArgs();
  const identifier = await promptForUserIdentifier(cli);

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool, { schema });

  try {
    const user = await resolveUser(db, identifier);
    console.log(`Using createdBy: ${user.name} <${user.email ?? 'no email'}> (${user.id})`);

    if (!fs.existsSync(CSV_PATH)) {
      throw new Error(`CSV not found: ${CSV_PATH}\nRun npm run extract:materials first.`);
    }

    const csvData = fs.readFileSync(CSV_PATH, 'utf-8').replace(/^\uFEFF/, '');
    const csvRows = parse<CsvRow>(csvData, { columns: true, skip_empty_lines: true, trim: true });
    console.log(`Loaded ${csvRows.length} rows from clean-materials.csv`);

    // Guard against empty/misparsed CSVs (e.g. unexpected headers)
    if (csvRows.length > 0 && !csvRows[0].legacyCode) {
      throw new Error(`CSV headers look wrong. Expected "legacyCode", got: ${Object.keys(csvRows[0]).join(', ')}`);
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
      })
      .from(schema.materials);

    const usedCodes = new Set<string>();
    const existingLegacyCodes = new Set<string>();
    for (const row of existingMaterials) {
      usedCodes.add(row.code);
      if (row.legacyCode) existingLegacyCodes.add(row.legacyCode);
    }
    console.log(`Existing materials in DB: ${existingMaterials.length}`);

    if (!(await confirmProceedWithExistingMaterials(existingMaterials.length))) {
      console.log('Aborted.');
      process.exitCode = 1;
      return;
    }

    const toInsert: (typeof schema.materials.$inferInsert)[] = [];
    const unresolved: UnresolvedRow[] = [];
    const duplicateLegacyCodes: DuplicateLegacyRow[] = [];
    const seenLegacyCodes = new Map<string, string>(); // legacyCode -> kept title
    let skippedExisting = 0;
    const unitCounts = new Map<string, number>();

    for (const row of csvRows) {
      const legacyCode = row.legacyCode?.trim();
      const title = row.title?.trim();
      const mainLegacy = row.mainCategoryLegacyCode?.trim();
      const subLegacy = row.subCategoryLegacyCode?.trim();

      if (!legacyCode || !title || !mainLegacy || !subLegacy) continue;

      const keptTitle = seenLegacyCodes.get(legacyCode);
      if (keptTitle != null) {
        duplicateLegacyCodes.push({ legacyCode, title, keptTitle });
        continue;
      }
      seenLegacyCodes.set(legacyCode, title);

      if (existingLegacyCodes.has(legacyCode)) {
        skippedExisting++;
        continue;
      }

      const subCategoryId = categoryMap.get(`${mainLegacy}:${subLegacy}`);
      if (!subCategoryId) {
        unresolved.push({
          legacyCode,
          title,
          mainCategoryLegacyCode: mainLegacy,
          subCategoryLegacyCode: subLegacy,
        });
        continue;
      }

      const unit = normalizeUnit(row.unit ?? '');
      const unitCost = normalizeCost(row.unitCost ?? '');
      const quantity = normalizeQuantity(row.quantity ?? '');

      unitCounts.set(unit, (unitCounts.get(unit) ?? 0) + 1);

      toInsert.push({
        code: generateUniqueCode(usedCodes),
        legacyCode,
        title,
        subCategoryId,
        materialType: MATERIAL_TYPES.RAW_MATERIALS,
        unit: unit as (typeof MATERIAL_UNIT_VALUES)[number],
        unitCost,
        quantity,
        openingUnitCost: unitCost,
        openingQuantity: quantity,
        createdBy: user.id,
      });
    }

    console.log(`\nPrepared ${toInsert.length} new materials (${skippedExisting} already exist)`);
    console.log(`Skipped unresolved categories: ${unresolved.length}`);
    console.log(`Skipped duplicate legacy codes: ${duplicateLegacyCodes.length}`);

    if (toInsert.length > 0) {
      for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
        const batch = toInsert.slice(i, i + BATCH_SIZE);
        await db.insert(schema.materials).values(batch).onConflictDoNothing({ target: schema.materials.legacyCode });
        process.stdout.write(`\rInserted ${Math.min(i + BATCH_SIZE, toInsert.length)} / ${toInsert.length}`);
      }
      console.log();
    }

    console.log('\n========== MATERIALS SEED STATS ==========');
    console.log(`CSV rows loaded:              ${csvRows.length}`);
    console.log(`Inserted (new):               ${toInsert.length}`);
    console.log(`Skipped (already exist):      ${skippedExisting}`);
    console.log(`Skipped (unresolved category): ${unresolved.length}`);
    console.log(`Skipped (duplicate legacyCode): ${duplicateLegacyCodes.length}`);
    console.log(`materialType:                 ${MATERIAL_TYPES.RAW_MATERIALS} (all)`);

    console.log('\n--- Unit distribution ---');
    for (const [unit, count] of [...unitCounts.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${unit}: ${count}`);
    }

    if (duplicateLegacyCodes.length > 0) {
      console.log('\n--- Duplicate legacy codes skipped (kept first) ---');
      for (const row of duplicateLegacyCodes.slice(0, 20)) {
        console.log(`  ${row.legacyCode} | skipped "${row.title}" | kept "${row.keptTitle}"`);
      }
      if (duplicateLegacyCodes.length > 20) {
        console.log(`  ... and ${duplicateLegacyCodes.length - 20} more`);
      }
    }

    if (unresolved.length > 0) {
      console.log('\n--- Unresolved categories (samples) ---');
      for (const row of unresolved.slice(0, 20)) {
        console.log(`  ${row.legacyCode} | ${row.mainCategoryLegacyCode}/${row.subCategoryLegacyCode} | ${row.title}`);
      }
      if (unresolved.length > 20) {
        console.log(`  ... and ${unresolved.length - 20} more`);
      }
    }

    console.log('==========================================\n');
    console.log('Materials seed completed successfully.');
  } catch (e) {
    const err = e as Error & { cause?: { message?: string; code?: string; detail?: string } };
    console.error(err.message);
    if (err.cause?.message) console.error(`Cause: ${err.cause.message}`);
    if (err.cause?.detail) console.error(`Detail: ${err.cause.detail}`);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

void main();
