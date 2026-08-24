import { eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { parseArgs } from 'node:util';
import { stdin as input, stdout as output } from 'node:process';
import * as crypto from 'crypto';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'node:readline/promises';
import * as schema from '../../src/database/schema';
import * as xlsx from 'xlsx';
import { INVENTORY_TRANSACTION_TYPES, MATERIAL_TYPES, MATERIAL_UNITS, MATERIAL_UNIT_VALUES } from '../../src/utils/constants';
import { ensureNoUnitMismatchesBeforeSeeding } from '../_utils/unit-mismatch-guard';

dotenv.config();

const USAGE = `Usage: npm run seed:inventory-receipts [-- --email <email> | --id <uuid>]

Seeds historical goods-receipt data from the merged workbook:
  data/transactions/all.xlsx

Other .xlsx files in that folder are ignored.

Dates are always interpreted as DD/MM/YYYY (e.g. 12/1/2026 = 12 January 2026).

If --email / --id are omitted, you will be prompted for an email or user ID.
The user must be an active admin.

All inserts run in a single database transaction. If any insert fails, the
entire seed run is rolled back.

Options:
  -e, --email <email>  Existing user email stamped as createdBy / receivedBy
  -i, --id <uuid>      Existing user ID stamped as createdBy / receivedBy
  -h, --help           Show this help

Examples:
  npm run seed:inventory-receipts
  npm run seed:inventory-receipts -- --email admin@example.com
  npm run seed:inventory-receipts -- --id 00000000-0000-0000-0000-000000000001`;

const DATA_DIR = path.join(__dirname, '../../data/transactions');
const TRANSACTIONS_SOURCE_FILE = 'all.xlsx';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SEED_IMPORT_NOTE = 'تم إدخال هذه البيانات آلياً من ملفات النظام القديم.';

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

type WorkbookRow = {
  sourceFile: string;
  sourceRowNumber: number;
  materialLegacyCode: string;
  title: string;
  unitRaw: string;
  quantity: number;
  unitPrice: number;
  invoiceNumber: string;
  invoiceDate: Date;
  supplierName: string;
  permitNumber: string;
  receiptDate: Date;
};

type InvalidRow = {
  sourceFile: string;
  sourceRowNumber: number;
  reason: string;
  materialLegacyCode?: string;
  title?: string;
};

type SkippedMaterial = {
  sourceFile: string;
  sourceRowNumber: number;
  legacyCode: string;
  title: string;
  reason: string;
};

type SkippedUnitRow = {
  sourceFile: string;
  sourceRowNumber: number;
  legacyCode: string;
  title: string;
  unitRaw: string;
  reason: 'unknown-unit' | 'no-conversion';
};

type DuplicateOrderItemWarning = {
  groupKey: string;
  materialLegacyCode: string;
  titles: string[];
  quantities: number[];
  unitPrices: number[];
};

type Summary = {
  rowsLoaded: number;
  ordersCreated: number;
  orderItemsCreated: number;
  receiptsCreated: number;
  receiptItemsCreated: number;
  inventoryTransactionsCreated: number;
  inventoryTransactionItemsCreated: number;
  suppliersCreated: number;
  materialsCreated: number;
  skippedExistingPermitGroups: number;
  skippedPartialPermitGroups: number;
  invalidRowsSkipped: number;
  skippedRowsMissingMaterials: number;
  skippedRowsUnresolvedUnit: number;
};

type UserIdentifier = { email?: string; id?: string };
type DbClient = ReturnType<typeof drizzle<typeof schema>>;

function resolveMaterialUnit(raw: string): (typeof MATERIAL_UNIT_VALUES)[number] | null {
  const normalized = raw.trim();
  if (!normalized || normalized === '(فارغ)') return null;
  return ARABIC_TO_UNIT_KEY.get(normalized) ?? null;
}

async function loadConversionFactors(db: DbClient) {
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

function parseCliArgs(): UserIdentifier {
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

async function promptForUserIdentifier(partial: UserIdentifier): Promise<UserIdentifier> {
  if (partial.email || partial.id) return partial;

  const rl = readline.createInterface({ input, output });
  try {
    console.log('\nEnter the user to stamp as createdBy / receivedBy (email or user ID).');
    const answer = (await rl.question('Email or user ID: ')).trim();
    if (!answer) throw new Error('Email or user ID is required.');

    if (UUID_RE.test(answer)) return { id: answer };
    return { email: answer };
  } finally {
    rl.close();
  }
}

async function resolveUser(db: DbClient, identifier: UserIdentifier) {
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
    throw new Error(`User ${label} is not an admin. Only admins can seed inventory receipts.`);
  }

  return user;
}

function generateUniqueMaterialCode(existing: Set<string>): string {
  for (let attempt = 0; attempt < 1000; attempt++) {
    const code = String(crypto.randomInt(100_000, 1_000_000));
    if (!existing.has(code)) {
      existing.add(code);
      return code;
    }
  }

  throw new Error('Failed to generate a unique 6-digit material code after 1000 attempts.');
}

function normalizeText(value: unknown): string {
  if (value == null) return '';
  return String(value).replace(/\s+/g, ' ').trim();
}

function normalizeIdentifier(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'number') {
    return Number.isInteger(value) ? String(value) : String(value);
  }

  const trimmed = normalizeText(value);
  const asNumber = Number(trimmed);
  if (trimmed && Number.isFinite(asNumber) && String(asNumber) === trimmed && Number.isInteger(asNumber)) {
    return String(asNumber);
  }

  return trimmed;
}

/** Build a UTC noon Date and reject impossible calendar values (e.g. 31/02). */
function utcDateFromParts(year: number, month: number, day: number, label: string): Date {
  if (!Number.isInteger(year) || year < 1900 || year > 2100) {
    throw new Error(`Invalid ${label} year: ${year}`);
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error(`Invalid ${label} month: ${month}`);
  }
  if (!Number.isInteger(day) || day < 1 || day > 31) {
    throw new Error(`Invalid ${label} day: ${day}`);
  }

  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new Error(`Invalid ${label} calendar date: ${day}/${month}/${year}`);
  }
  return date;
}

/**
 * Dates in these workbooks are always DD/MM/YYYY.
 *
 * Excel often stores ambiguous values (both parts <= 12) as US MM/DD serials —
 * e.g. typed "12/1/2026" (12 Jan) becomes serial for 1 Dec. When the serial's
 * day is <= 12 we swap month/day to recover DD/MM intent. When day > 12 the
 * serial cannot be a swapped misread, so we keep it as-is.
 */
function excelDateToDate(value: unknown, label: string): Date {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const year = value.getFullYear();
    const month = value.getMonth() + 1;
    const day = value.getDate();
    if (day > 12) return utcDateFromParts(year, month, day, label);
    return utcDateFromParts(year, day, month, label);
  }

  if (typeof value === 'number') {
    const parsed = xlsx.SSF.parse_date_code(value);
    if (!parsed) throw new Error(`Invalid Excel serial date for ${label}: ${value}`);
    if (parsed.d > 12) return utcDateFromParts(parsed.y, parsed.m, parsed.d, label);
    // Recover DD/MM intent from a US MM/DD-stored serial
    return utcDateFromParts(parsed.y, parsed.d, parsed.m, label);
  }

  const trimmed = normalizeText(value);
  if (!trimmed) throw new Error(`Missing ${label}`);

  // Strip stray letters (e.g. Arabic typos glued to the date) then parse DD/MM/YYYY
  const cleaned = trimmed.replace(/[^\d/\-]/g, '');
  const match = cleaned.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})$/);
  if (!match) throw new Error(`Unsupported ${label} format: "${trimmed}"`);

  const day = Number(match[1]);
  const month = Number(match[2]);
  let year = Number(match[3]);
  if (match[3].length === 2) year += year >= 70 ? 1900 : 2000;

  return utcDateFromParts(year, month, day, label);
}

function listTransactionWorkbooks(): string[] {
  if (!fs.existsSync(DATA_DIR)) {
    throw new Error(`Transactions directory not found: ${DATA_DIR}`);
  }

  const sourcePath = path.join(DATA_DIR, TRANSACTIONS_SOURCE_FILE);
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Transactions source file not found: ${sourcePath}`);
  }

  return [TRANSACTIONS_SOURCE_FILE];
}

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function normalizeUnit(raw: string): (typeof MATERIAL_UNIT_VALUES)[number] {
  return resolveMaterialUnit(raw) ?? MATERIAL_UNITS.COUNT;
}

function normalizeNumber(value: unknown, label: string): number {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`Invalid ${label}: ${value}`);
    return value;
  }

  const trimmed = normalizeText(value);
  if (!trimmed) throw new Error(`Missing ${label}`);

  const normalized = trimmed.replace(/,/g, '');
  const result = Number(normalized);
  if (!Number.isFinite(result)) throw new Error(`Invalid ${label}: "${trimmed}"`);
  return result;
}

function findColumnIndex(header: unknown[], aliases: string[]): number {
  const normalizedAliases = new Set(aliases.map((alias) => normalizeText(alias)));

  for (let i = 0; i < header.length; i++) {
    const cell = normalizeText(header[i]);
    if (normalizedAliases.has(cell)) return i;
  }

  return -1;
}

function loadWorkbookRows(): { rows: WorkbookRow[]; invalidRows: InvalidRow[] } {
  const rows: WorkbookRow[] = [];
  const invalidRows: InvalidRow[] = [];
  const dataFiles = listTransactionWorkbooks();

  console.log(`Reading ${dataFiles.length} workbook(s) from ${DATA_DIR}:`);
  for (const fileName of dataFiles) console.log(`  - ${fileName}`);

  for (const fileName of dataFiles) {
    const workbookPath = path.join(DATA_DIR, fileName);
    const workbook = xlsx.readFile(workbookPath);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rawRows = xlsx.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null, raw: true });
    const headerRowIndex = rawRows.findIndex((row) =>
      row.some((cell) => typeof cell === 'string' && normalizeText(cell).includes('رقم إذن الإضافة')),
    );

    if (headerRowIndex < 0) {
      throw new Error(`Could not locate the header row in ${fileName}.`);
    }

    const header = rawRows[headerRowIndex];
    const materialCodeIdx = findColumnIndex(header, ['كود الصنف']);
    const titleIdx = findColumnIndex(header, ['الصنف']);
    const unitIdx = findColumnIndex(header, ['الوحدة']);
    const quantityIdx = findColumnIndex(header, ['الكمية']);
    const unitPriceIdx = findColumnIndex(header, ['السعر']);
    const invoiceNumberIdx = findColumnIndex(header, ['رقم الفاتورة']);
    const invoiceDateIdx = findColumnIndex(header, ['تاريخ الفاتورة']);
    const supplierNameIdx = findColumnIndex(header, ['اسم المورد', 'أسم المورد']);
    const permitNumberIdx = findColumnIndex(header, ['رقم إذن الإضافة']);
    const receiptDateIdx = findColumnIndex(header, ['تاريخ الإضافة']);

    const requiredIndices = [
      materialCodeIdx,
      titleIdx,
      unitIdx,
      quantityIdx,
      unitPriceIdx,
      invoiceNumberIdx,
      invoiceDateIdx,
      supplierNameIdx,
      permitNumberIdx,
      receiptDateIdx,
    ];
    if (requiredIndices.some((idx) => idx < 0)) {
      throw new Error(`Some expected columns were not found in ${fileName}.`);
    }

    for (let i = headerRowIndex + 1; i < rawRows.length; i++) {
      const rawRow = rawRows[i];
      const materialLegacyCode = normalizeIdentifier(rawRow[materialCodeIdx]);
      if (!materialLegacyCode) continue;

      try {
        const title = normalizeText(rawRow[titleIdx]);
        const supplierName = normalizeText(rawRow[supplierNameIdx]);
        const invoiceNumber = normalizeIdentifier(rawRow[invoiceNumberIdx]);
        const permitNumber = normalizeIdentifier(rawRow[permitNumberIdx]);
        const quantity = normalizeNumber(rawRow[quantityIdx], 'quantity');
        const unitPrice = normalizeNumber(rawRow[unitPriceIdx], 'unit price');
        const invoiceDate = excelDateToDate(rawRow[invoiceDateIdx], 'invoice date');
        const receiptDate = excelDateToDate(rawRow[receiptDateIdx], 'receipt date');

        if (!title) throw new Error('Missing material title');
        if (!supplierName) throw new Error('Missing supplier name');
        if (!invoiceNumber) throw new Error('Missing invoice number');
        if (!permitNumber) throw new Error('Missing permit number');
        if (quantity <= 0) throw new Error(`Quantity must be positive, got ${quantity}`);
        if (unitPrice <= 0) throw new Error(`Unit price must be positive, got ${unitPrice}`);

        rows.push({
          sourceFile: fileName,
          sourceRowNumber: i + 1,
          materialLegacyCode,
          title,
          unitRaw: normalizeText(rawRow[unitIdx]),
          quantity,
          unitPrice,
          invoiceNumber,
          invoiceDate,
          supplierName,
          permitNumber,
          receiptDate,
        });
      } catch (error) {
        invalidRows.push({
          sourceFile: fileName,
          sourceRowNumber: i + 1,
          reason: (error as Error).message,
          materialLegacyCode,
          title: normalizeText(rawRow[titleIdx]),
        });
      }
    }
  }

  return { rows, invalidRows };
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not defined in .env');
  await ensureNoUnitMismatchesBeforeSeeding('seed:inventory-receipts');

  const cli = parseCliArgs();
  const identifier = await promptForUserIdentifier(cli);
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool, { schema });

  const summary: Summary = {
    rowsLoaded: 0,
    ordersCreated: 0,
    orderItemsCreated: 0,
    receiptsCreated: 0,
    receiptItemsCreated: 0,
    inventoryTransactionsCreated: 0,
    inventoryTransactionItemsCreated: 0,
    suppliersCreated: 0,
    materialsCreated: 0,
    skippedExistingPermitGroups: 0,
    skippedPartialPermitGroups: 0,
    invalidRowsSkipped: 0,
    skippedRowsMissingMaterials: 0,
    skippedRowsUnresolvedUnit: 0,
  };

  const skippedMaterials: SkippedMaterial[] = [];
  const skippedUnitRows: SkippedUnitRow[] = [];
  const duplicateOrderItemWarnings: DuplicateOrderItemWarning[] = [];

  try {
    const user = await resolveUser(db, identifier);
    console.log(`Using createdBy: ${user.name} <${user.email ?? 'no email'}> (${user.id})`);

    const { rows, invalidRows } = loadWorkbookRows();
    summary.rowsLoaded = rows.length;
    summary.invalidRowsSkipped = invalidRows.length;
    console.log(`Loaded ${rows.length} valid workbook rows`);
    if (invalidRows.length > 0) {
      console.log(`Skipped ${invalidRows.length} invalid row(s) during parsing`);
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

    const subcategoryByLegacyPair = new Map<string, string>();
    for (const row of categoryRows) {
      subcategoryByLegacyPair.set(`${row.mainLegacyCode}:${row.subLegacyCode}`, row.subId);
    }

    const existingMaterials = await db
      .select({
        code: schema.materials.code,
        legacyCode: schema.materials.legacyCode,
        unitOfMeasurement: schema.materials.unitOfMeasurement,
      })
      .from(schema.materials);

    const materialByLegacy = new Map<string, { code: string; unitOfMeasurement: (typeof MATERIAL_UNIT_VALUES)[number] }>();
    const usedMaterialCodes = new Set<string>();
    for (const material of existingMaterials) {
      usedMaterialCodes.add(material.code);
      if (material.legacyCode) {
        materialByLegacy.set(material.legacyCode, {
          code: material.code,
          unitOfMeasurement: material.unitOfMeasurement,
        });
      }
    }
    const conversionFactorsByCode = await loadConversionFactors(db);

    const supplierRows = await db
      .select({
        id: schema.suppliers.id,
        name: schema.suppliers.name,
      })
      .from(schema.suppliers);

    const supplierIdByName = new Map<string, string>();
    for (const supplier of supplierRows) {
      supplierIdByName.set(normalizeText(supplier.name), supplier.id);
    }

    const existingTransactions = await db
      .select({
        legacyNumber: schema.inventoryTransactions.legacyNumber,
      })
      .from(schema.inventoryTransactions);

    const existingPermitNumbers = new Set(
      existingTransactions.map((transaction) => transaction.legacyNumber).filter((value): value is string => Boolean(value)),
    );

    const orderGroups = new Map<string, WorkbookRow[]>();
    for (const row of rows) {
      const groupKey = `${row.supplierName}|${row.invoiceNumber}|${isoDay(row.invoiceDate)}`;
      const groupRows = orderGroups.get(groupKey);
      if (groupRows) groupRows.push(row);
      else orderGroups.set(groupKey, [row]);
    }

    console.log('Writing all inserts in one database transaction. A failure rolls back the entire run.');

    await db.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL statement_timeout = 0`);
      await tx.execute(sql`SET LOCAL idle_in_transaction_session_timeout = 0`);

      let processedGroups = 0;
      for (const [groupKey, groupRows] of orderGroups) {
        const permitNumbers = [...new Set(groupRows.map((row) => row.permitNumber))];
        const existingPermits = permitNumbers.filter((permitNumber) => existingPermitNumbers.has(permitNumber));

        if (existingPermits.length === permitNumbers.length) {
          summary.skippedExistingPermitGroups++;
          continue;
        }

        if (existingPermits.length > 0) {
          summary.skippedPartialPermitGroups++;
          console.log(`Skipping partially seeded order group ${groupKey}; existing permits: ${existingPermits.join(', ')}`);
          continue;
        }

        const supplierName = groupRows[0].supplierName;
        let supplierId = supplierIdByName.get(supplierName);

        if (!supplierId) {
          const [createdSupplier] = await tx
            .insert(schema.suppliers)
            .values({
              code: sql`DEFAULT`,
              name: supplierName,
              createdBy: user.id,
            })
            .returning({ id: schema.suppliers.id });

          supplierId = createdSupplier.id;
          supplierIdByName.set(supplierName, supplierId);
          summary.suppliersCreated++;
        }

        const usableRows: Array<
          WorkbookRow & {
            materialCode: string;
            quantityBase: number;
            unitPriceBase: number;
          }
        > = [];
        for (const row of groupRows) {
          let material = materialByLegacy.get(row.materialLegacyCode);
          if (!material) {
            if (!/^1\d{7}$/.test(row.materialLegacyCode)) {
              skippedMaterials.push({
                sourceFile: row.sourceFile,
                sourceRowNumber: row.sourceRowNumber,
                legacyCode: row.materialLegacyCode,
                title: row.title,
                reason: 'Legacy material code must be 8 digits and start with 1',
              });
              summary.skippedRowsMissingMaterials++;
              continue;
            }

            const mainCategoryLegacyCode = row.materialLegacyCode.slice(1, 3);
            const subCategoryLegacyCode = row.materialLegacyCode.slice(3, 5);
            const subCategoryId = subcategoryByLegacyPair.get(`${mainCategoryLegacyCode}:${subCategoryLegacyCode}`);

            if (!subCategoryId) {
              skippedMaterials.push({
                sourceFile: row.sourceFile,
                sourceRowNumber: row.sourceRowNumber,
                legacyCode: row.materialLegacyCode,
                title: row.title,
                reason: `No material subcategory found for ${mainCategoryLegacyCode}/${subCategoryLegacyCode}`,
              });
              summary.skippedRowsMissingMaterials++;
              continue;
            }

            const [createdMaterial] = await tx
              .insert(schema.materials)
              .values({
                code: generateUniqueMaterialCode(usedMaterialCodes),
                legacyCode: row.materialLegacyCode,
                title: row.title,
                subCategoryId,
                materialType: MATERIAL_TYPES.RAW_MATERIALS,
                unitOfMeasurement: normalizeUnit(row.unitRaw),
                unitPrice: 0,
                quantity: 0,
                openingUnitPrice: 0,
                openingQuantity: 0,
                createdBy: user.id,
              })
              .returning({
                code: schema.materials.code,
                unitOfMeasurement: schema.materials.unitOfMeasurement,
              });

            material = {
              code: createdMaterial.code,
              unitOfMeasurement: createdMaterial.unitOfMeasurement,
            };
            materialByLegacy.set(row.materialLegacyCode, material);
            summary.materialsCreated++;
          }

          const conversionResult = resolveConversionFactor({
            baseUnit: material.unitOfMeasurement,
            rawUnit: row.unitRaw,
            conversions: conversionFactorsByCode.get(material.code),
          });

          if (!conversionResult.ok) {
            skippedUnitRows.push({
              sourceFile: row.sourceFile,
              sourceRowNumber: row.sourceRowNumber,
              legacyCode: row.materialLegacyCode,
              title: row.title,
              unitRaw: row.unitRaw,
              reason: conversionResult.reason,
            });
            summary.skippedRowsUnresolvedUnit++;
            continue;
          }

          const baseValues = toBaseValues(row.quantity, row.unitPrice, conversionResult.factor);
          usableRows.push({
            ...row,
            materialCode: material.code,
            quantityBase: baseValues.quantity,
            unitPriceBase: baseValues.unitPrice,
          });
        }

        if (usableRows.length === 0) return;

        const invoiceDate = usableRows[0].invoiceDate;
        const completedAt = usableRows.reduce(
          (latest, row) => (row.receiptDate.getTime() > latest.getTime() ? row.receiptDate : latest),
          usableRows[0].receiptDate,
        );

        const orderItemGroups = new Map<
          string,
          Array<WorkbookRow & { materialCode: string; quantityBase: number; unitPriceBase: number }>
        >();
        for (const row of usableRows) {
          const existing = orderItemGroups.get(row.materialCode);
          if (existing) existing.push(row);
          else orderItemGroups.set(row.materialCode, [row]);
        }

        let totalAmount = 0;
        const mergedOrderItems = [...orderItemGroups.entries()].map(([materialCode, itemRows]) => {
          const quantityOrdered = itemRows.reduce((sum, row) => sum + row.quantityBase, 0);
          const totalCost = itemRows.reduce((sum, row) => sum + row.quantityBase * row.unitPriceBase, 0);
          const unitPrice = totalCost / quantityOrdered;

          if (itemRows.length > 1) {
            duplicateOrderItemWarnings.push({
              groupKey,
              materialLegacyCode: itemRows[0].materialLegacyCode,
              titles: itemRows.map((row) => row.title),
              quantities: itemRows.map((row) => row.quantity),
              unitPrices: itemRows.map((row) => row.unitPrice),
            });
          }

          totalAmount += quantityOrdered * unitPrice;
          return { materialCode, quantityOrdered, unitPrice };
        });

        const [createdOrder] = await tx
          .insert(schema.materialPurchaseOrders)
          .values({
            code: sql`DEFAULT`,
            supplierId,
            legacyInvoiceNumber: usableRows[0].invoiceNumber,
            totalAmount,
            completedAt,
            notes: SEED_IMPORT_NOTE,
            createdAt: invoiceDate,
            createdBy: user.id,
          })
          .returning({ id: schema.materialPurchaseOrders.id });

        summary.ordersCreated++;

        const createdOrderItems = await tx
          .insert(schema.materialPurchaseOrderItems)
          .values(
            mergedOrderItems.map((item) => ({
              materialPurchaseOrderId: createdOrder.id,
              materialCode: item.materialCode,
              quantityOrdered: item.quantityOrdered,
              unitPrice: item.unitPrice,
            })),
          )
          .returning({
            id: schema.materialPurchaseOrderItems.id,
            materialCode: schema.materialPurchaseOrderItems.materialCode,
          });

        summary.orderItemsCreated += createdOrderItems.length;

        const orderItemIdByMaterialCode = new Map(createdOrderItems.map((item) => [item.materialCode, item.id]));
        const receiptGroups = new Map<
          string,
          Array<WorkbookRow & { materialCode: string; quantityBase: number; unitPriceBase: number }>
        >();
        for (const row of usableRows) {
          const existing = receiptGroups.get(row.permitNumber);
          if (existing) existing.push(row);
          else receiptGroups.set(row.permitNumber, [row]);
        }

        for (const [permitNumber, receiptRows] of receiptGroups) {
          const receiptDate = receiptRows[0].receiptDate;

          const [createdReceipt] = await tx
            .insert(schema.materialPurchaseReceipts)
            .values({
              code: sql`DEFAULT`,
              materialPurchaseOrderId: createdOrder.id,
              receivedAt: receiptDate,
              receivedBy: user.id,
              notes: SEED_IMPORT_NOTE,
              createdAt: receiptDate,
              createdBy: user.id,
            })
            .returning({ id: schema.materialPurchaseReceipts.id });

          summary.receiptsCreated++;

          const createdReceiptItems = await tx
            .insert(schema.materialPurchaseReceiptItems)
            .values(
              receiptRows.map((row) => ({
                materialPurchaseReceiptId: createdReceipt.id,
                materialPurchaseOrderItemId: orderItemIdByMaterialCode.get(row.materialCode)!,
                quantityReceived: row.quantityBase,
                quantityRejected: 0,
              })),
            )
            .returning({ id: schema.materialPurchaseReceiptItems.id });

          summary.receiptItemsCreated += createdReceiptItems.length;

          const [createdTransaction] = await tx
            .insert(schema.inventoryTransactions)
            .values({
              code: sql`DEFAULT`,
              legacyNumber: permitNumber,
              transactionType: INVENTORY_TRANSACTION_TYPES.RECEIPT,
              materialPurchaseReceiptId: createdReceipt.id,
              notes: SEED_IMPORT_NOTE,
              createdAt: receiptDate,
              createdBy: user.id,
            })
            .returning({ id: schema.inventoryTransactions.id });

          summary.inventoryTransactionsCreated++;
          existingPermitNumbers.add(permitNumber);

          const createdInventoryItems = await tx.insert(schema.inventoryTransactionItems).values(
            receiptRows.map((row) => ({
              transactionId: createdTransaction.id,
              materialCode: row.materialCode,
              quantity: row.quantityBase,
              unitPrice: row.unitPriceBase,
            })),
          );

          summary.inventoryTransactionItemsCreated += receiptRows.length;
          void createdInventoryItems;
        }

        processedGroups++;
        process.stdout.write(`\rProcessed ${processedGroups} / ${orderGroups.size} order groups`);
      }
    });

    console.log();
    console.log('\n========== INVENTORY RECEIPTS SEED STATS ==========');
    console.log(`Workbook rows loaded:            ${summary.rowsLoaded}`);
    console.log(`Invalid rows skipped:           ${summary.invalidRowsSkipped}`);
    console.log(`Orders created:                 ${summary.ordersCreated}`);
    console.log(`Order items created:            ${summary.orderItemsCreated}`);
    console.log(`Receipts created:               ${summary.receiptsCreated}`);
    console.log(`Receipt items created:          ${summary.receiptItemsCreated}`);
    console.log(`Inventory transactions created: ${summary.inventoryTransactionsCreated}`);
    console.log(`Inventory items created:        ${summary.inventoryTransactionItemsCreated}`);
    console.log(`Suppliers created:              ${summary.suppliersCreated}`);
    console.log(`Materials created:              ${summary.materialsCreated}`);
    console.log(`Existing permit groups skipped: ${summary.skippedExistingPermitGroups}`);
    console.log(`Partial groups skipped:         ${summary.skippedPartialPermitGroups}`);
    console.log(`Rows skipped for materials:     ${summary.skippedRowsMissingMaterials}`);
    console.log(`Rows skipped for units:         ${summary.skippedRowsUnresolvedUnit}`);

    if (invalidRows.length > 0) {
      console.log('\n--- Invalid rows skipped (samples) ---');
      for (const row of invalidRows.slice(0, 20)) {
        console.log(
          `  ${row.sourceFile} row ${row.sourceRowNumber}: ${row.materialLegacyCode ?? '(no code)'} | ${row.title ?? '(no title)'} | ${row.reason}`,
        );
      }
      if (invalidRows.length > 20) {
        console.log(`  ... and ${invalidRows.length - 20} more`);
      }
    }

    if (skippedMaterials.length > 0) {
      console.log('\n--- Rows skipped because materials could not be resolved/created ---');
      for (const row of skippedMaterials.slice(0, 30)) {
        console.log(`  ${row.sourceFile} row ${row.sourceRowNumber}: ${row.legacyCode} | ${row.title} | ${row.reason}`);
      }
      if (skippedMaterials.length > 30) {
        console.log(`  ... and ${skippedMaterials.length - 30} more`);
      }
    }

    if (skippedUnitRows.length > 0) {
      console.log('\n--- Rows skipped because file units could not be converted ---');
      for (const row of skippedUnitRows.slice(0, 30)) {
        console.log(
          `  ${row.sourceFile} row ${row.sourceRowNumber}: ${row.legacyCode} | ${row.title} | unit="${row.unitRaw || '(فارغ)'}" | ${row.reason}`,
        );
      }
      if (skippedUnitRows.length > 30) {
        console.log(`  ... and ${skippedUnitRows.length - 30} more`);
      }
    }

    if (duplicateOrderItemWarnings.length > 0) {
      console.log('\n--- Duplicate material rows merged inside one order group ---');
      for (const warning of duplicateOrderItemWarnings.slice(0, 20)) {
        console.log(
          `  ${warning.groupKey} | ${warning.materialLegacyCode} | titles=${warning.titles.join(' || ')} | qty=${warning.quantities.join(', ')} | prices=${warning.unitPrices.join(', ')}`,
        );
      }
      if (duplicateOrderItemWarnings.length > 20) {
        console.log(`  ... and ${duplicateOrderItemWarnings.length - 20} more`);
      }
    }

    console.log('===================================================');
    console.log('Legacy inventory receipt seed script completed.');
  } catch (error) {
    const err = error as Error & { cause?: { message?: string; detail?: string } };
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
