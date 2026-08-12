import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { isNotNull } from 'drizzle-orm';
import * as xlsx from 'xlsx';
import ExcelJS from 'exceljs';
import * as schema from '../src/database/schema';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config();

function norm(value: unknown): string {
  if (value == null) return '';
  return String(value).replace(/\s+/g, ' ').trim();
}

/** Primary Arabic labels mirrored from erp-app material-units.ts. */
const UNIT_AR_LABELS: Record<string, string> = {
  count: 'عدد',
  kg: 'كيلوجرام',
  gram: 'جرام',
  ton: 'طن',
  meter: 'متر',
  cm: 'سنتيمتر',
  square_meter: 'متر²',
  cubic_meter: 'متر³',
  liter: 'لتر',
  sheet: 'لوح',
  roll: 'لفة',
  box: 'صندوق',
};

/**
 * Extra invoice spellings for the same enum unit. Transaction files often write
 * kg as "كيلو" / "كيلوجرام" and square_meter as "متر 2".
 */
const UNIT_AR_ALIASES: Record<string, string[]> = {
  kg: ['كيلو', 'كجم'],
  square_meter: ['متر 2', 'م2', 'م²'],
  cubic_meter: ['متر 3', 'م3', 'م³'],
};

/** Normalized Arabic (or English enum key) → material_unit enum value. */
const ARABIC_TO_UNIT_KEY: Map<string, string> = (() => {
  const map = new Map<string, string>();
  for (const [key, label] of Object.entries(UNIT_AR_LABELS)) {
    map.set(norm(label), key);
    map.set(norm(key), key);
    for (const alias of UNIT_AR_ALIASES[key] ?? []) {
      map.set(norm(alias), key);
    }
  }
  return map;
})();

const TRANSACTIONS_DIR = path.join(__dirname, '../data/transactions');
const OUT_DIR = path.join(TRANSACTIONS_DIR, 'results');
const OUT_CSV_PATH = path.join(OUT_DIR, 'unit-mismatches.csv');
const OUT_XLSX_PATH = path.join(OUT_DIR, 'unit-mismatches.xlsx');

const CSV_HEADERS = [
  'الكود',
  'اسم الصنف',
  'الوحدة في قاعدة البيانات',
  'الوحدة في الفواتير',
  'المورد',
  'آخر فاتورة',
] as const;

type MaterialRow = {
  code: string;
  legacyCode: string;
  title: string;
  unitOfMeasurement: string;
  /** Alternate units from material_unit_conversions (enum keys). */
  alternateUnits: string[];
};

type OutputRow = {
  legacyCode: string;
  title: string;
  dbUnitArabic: string;
  invoiceUnit: string;
  supplierNames: string;
  lastInvoiceNumber: string;
};

/** Per (material, invoice unit) aggregate used to build one output row. */
type UnitUsage = {
  invoiceUnit: string;
  supplierNames: Set<string>;
  lastInvoiceNumber: string;
  lastInvoiceTime: number;
};

/** Resolve an invoice/DB unit string to a material_unit enum key, if known. */
function resolveUnitKey(raw: string): string | null {
  const n = norm(raw);
  if (!n || n === '(فارغ)') return null;
  return ARABIC_TO_UNIT_KEY.get(n) ?? null;
}

/** Base unit plus alternate conversion units for a material. */
function acceptedUnitKeys(material: MaterialRow): Set<string> {
  return new Set([material.unitOfMeasurement, ...material.alternateUnits]);
}

/** Arabic display of accepted DB units (base first, then alternates). */
function formatDbUnitsArabic(material: MaterialRow): string {
  const units = [material.unitOfMeasurement, ...material.alternateUnits];
  return units.map((u) => UNIT_AR_LABELS[u] ?? u).join('، ');
}

/** Invoice numbers are stored as numbers in some workbooks; render them without decimals. */
function normIdentifier(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : String(value);
  return norm(value);
}

/**
 * Invoice dates are DD/MM/YYYY, but Excel often stores ambiguous values as US
 * MM/DD serials (same handling as seed-inventory-receipts). Only used for
 * ordering here, so unparsable values fall back to 0.
 */
function invoiceDateTime(value: unknown): number {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const year = value.getFullYear();
    const month = value.getMonth() + 1;
    const day = value.getDate();
    return day > 12 ? Date.UTC(year, month - 1, day) : Date.UTC(year, day - 1, month);
  }

  if (typeof value === 'number') {
    const parsed = xlsx.SSF.parse_date_code(value);
    if (!parsed) return 0;
    return parsed.d > 12 ? Date.UTC(parsed.y, parsed.m - 1, parsed.d) : Date.UTC(parsed.y, parsed.d - 1, parsed.m);
  }

  const cleaned = norm(value).replace(/[^\d/\-]/g, '');
  const match = cleaned.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})$/);
  if (!match) return 0;

  const day = Number(match[1]);
  const month = Number(match[2]);
  let year = Number(match[3]);
  if (match[3].length === 2) year += year >= 70 ? 1900 : 2000;

  return Date.UTC(year, month - 1, day);
}

function escapeCsv(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function writeCsv(filePath: string, headers: readonly string[], rows: string[][]): void {
  const lines = [headers.map(escapeCsv).join(',')];
  for (const row of rows) {
    lines.push(row.map(escapeCsv).join(','));
  }
  // UTF-8 BOM so Excel renders Arabic correctly
  fs.writeFileSync(filePath, '\uFEFF' + lines.join('\n') + '\n', 'utf-8');
}

async function writeExcel(filePath: string, rows: OutputRow[]): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'ERP';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('اختلاف الوحدات', {
    views: [{ rightToLeft: true, state: 'frozen', ySplit: 1 }],
    pageSetup: {
      paperSize: 9, // A4
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      horizontalCentered: true,
      margins: {
        left: 0.4,
        right: 0.4,
        top: 0.5,
        bottom: 0.5,
        header: 0.2,
        footer: 0.2,
      },
    },
    properties: {
      defaultRowHeight: 22,
    },
  });

  sheet.columns = [
    { header: 'الكود', key: 'legacyCode', width: 14 },
    { header: 'اسم الصنف', key: 'title', width: 48 },
    { header: 'الوحدة في قاعدة البيانات', key: 'dbUnitArabic', width: 26 },
    { header: 'الوحدة في الفواتير', key: 'invoiceUnit', width: 22 },
    { header: 'المورد', key: 'supplierNames', width: 40 },
    { header: 'آخر رقم فاتورة', key: 'lastInvoiceNumber', width: 18 },
  ];

  const thinBorder: Partial<ExcelJS.Borders> = {
    top: { style: 'thin', color: { argb: 'FF94A3B8' } },
    bottom: { style: 'thin', color: { argb: 'FF94A3B8' } },
    left: { style: 'thin', color: { argb: 'FF94A3B8' } },
    right: { style: 'thin', color: { argb: 'FF94A3B8' } },
  };

  const headerRow = sheet.getRow(1);
  headerRow.height = 28;
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' }, name: 'Arial' };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true, readingOrder: 'rtl' };
    cell.border = thinBorder;
  });

  for (const row of rows) {
    const excelRow = sheet.addRow({
      legacyCode: row.legacyCode,
      title: row.title,
      dbUnitArabic: row.dbUnitArabic,
      invoiceUnit: row.invoiceUnit,
      supplierNames: row.supplierNames,
      lastInvoiceNumber: row.lastInvoiceNumber,
    });
    excelRow.height = 22;
    excelRow.eachCell((cell, colNumber) => {
      cell.font = { size: 11, name: 'Arial' };
      cell.border = thinBorder;
      cell.alignment = {
        horizontal: colNumber === 2 || colNumber === 5 ? 'right' : 'center',
        vertical: 'middle',
        wrapText: true,
        readingOrder: 'rtl',
      };
    });
  }

  // Alternate row shading for readability when printed
  for (let i = 2; i <= sheet.rowCount; i++) {
    if (i % 2 === 0) continue;
    sheet.getRow(i).eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
    });
  }

  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: Math.max(1, sheet.rowCount), column: 6 },
  };

  sheet.headerFooter = {
    oddHeader: '&Rاختلاف وحدات القياس بين قاعدة البيانات والفواتير',
    oddFooter: '&Rصفحة &P من &N',
  };

  await workbook.xlsx.writeFile(filePath);
}

function findHeaderRow(rows: (string | number | null)[][]): number {
  for (let i = 0; i < Math.min(20, rows.length); i++) {
    const row = rows[i];
    if (!row) continue;
    if (row.some((cell) => norm(cell) === 'كود الصنف')) return i;
  }
  return -1;
}

function findCol(row: (string | number | null)[] | undefined, name: string): number {
  if (!row) return -1;
  for (let i = 0; i < row.length; i++) {
    if (norm(row[i]) === name) return i;
  }
  return -1;
}

function findColAny(row: (string | number | null)[] | undefined, names: string[]): number {
  for (const name of names) {
    const idx = findCol(row, name);
    if (idx !== -1) return idx;
  }
  return -1;
}

type ParsedRow = {
  legacyCode: string;
  title: string;
  unit: string;
  supplierName: string;
  invoiceNumber: string;
  invoiceTime: number;
};

function parseTransactionFile(filePath: string): {
  rows: ParsedRow[];
  headerFound: boolean;
} {
  const wb = xlsx.readFile(filePath);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const sheetRows = xlsx.utils.sheet_to_json<(string | number | null)[]>(ws, {
    header: 1,
    defval: null,
  });

  const headerIdx = findHeaderRow(sheetRows);
  if (headerIdx === -1) {
    return { rows: [], headerFound: false };
  }

  const header = sheetRows[headerIdx];
  const codeCol = findCol(header, 'كود الصنف');
  const titleCol = findCol(header, 'الصنف');
  const unitCol = findCol(header, 'الوحدة');
  const supplierCol = findColAny(header, ['اسم المورد', 'أسم المورد', 'المورد']);
  const invoiceNumberCol = findCol(header, 'رقم الفاتورة');
  const invoiceDateCol = findCol(header, 'تاريخ الفاتورة');

  if (codeCol === -1 || unitCol === -1) {
    return { rows: [], headerFound: false };
  }

  const rows: ParsedRow[] = [];
  for (let i = headerIdx + 1; i < sheetRows.length; i++) {
    const row = sheetRows[i];
    if (!row) continue;

    const legacyCode = norm(row[codeCol]);
    if (!legacyCode) continue;

    rows.push({
      legacyCode,
      title: titleCol >= 0 ? norm(row[titleCol]) : '',
      unit: norm(row[unitCol]),
      supplierName: supplierCol >= 0 ? norm(row[supplierCol]) : '',
      invoiceNumber: invoiceNumberCol >= 0 ? normIdentifier(row[invoiceNumberCol]) : '',
      invoiceTime: invoiceDateCol >= 0 ? invoiceDateTime(row[invoiceDateCol]) : 0,
    });
  }

  return { rows, headerFound: true };
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not defined in .env');
  }

  if (!fs.existsSync(TRANSACTIONS_DIR)) {
    throw new Error(`Transactions directory not found: ${TRANSACTIONS_DIR}`);
  }

  const files = fs
    .readdirSync(TRANSACTIONS_DIR)
    .filter((f) => f.toLowerCase().endsWith('.xlsx'))
    .sort();

  if (files.length === 0) {
    throw new Error(`No .xlsx files found in ${TRANSACTIONS_DIR}`);
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool, { schema });

  try {
    const materialRows = await db
      .select({
        code: schema.materials.code,
        legacyCode: schema.materials.legacyCode,
        title: schema.materials.title,
        unitOfMeasurement: schema.materials.unitOfMeasurement,
      })
      .from(schema.materials)
      .where(isNotNull(schema.materials.legacyCode));

    const conversionRows = await db
      .select({
        materialCode: schema.materialUnitConversions.materialCode,
        unit: schema.materialUnitConversions.unit,
      })
      .from(schema.materialUnitConversions);

    const alternateUnitsByCode = new Map<string, string[]>();
    for (const row of conversionRows) {
      let units = alternateUnitsByCode.get(row.materialCode);
      if (!units) {
        units = [];
        alternateUnitsByCode.set(row.materialCode, units);
      }
      units.push(row.unit);
    }

    const materialsByLegacy = new Map<string, MaterialRow>();
    for (const row of materialRows) {
      if (!row.legacyCode) continue;
      materialsByLegacy.set(row.legacyCode, {
        code: row.code,
        legacyCode: row.legacyCode,
        title: row.title,
        unitOfMeasurement: row.unitOfMeasurement,
        alternateUnits: alternateUnitsByCode.get(row.code) ?? [],
      });
    }

    const materialsWithAlternates = [...materialsByLegacy.values()].filter((m) => m.alternateUnits.length > 0).length;
    console.log(`Loaded ${materialsByLegacy.size} materials with legacyCode from DB`);
    console.log(`Loaded ${conversionRows.length} unit conversion(s) across ${materialsWithAlternates} material(s)`);
    console.log(`Found ${files.length} transaction file(s)`);

    // legacyCode -> raw invoice unit -> suppliers + latest invoice seen with that unit
    const invoiceUnitsByLegacy = new Map<string, Map<string, UnitUsage>>();
    let filesParsed = 0;
    let rowsScanned = 0;
    const unmatchedLegacyCodes = new Set<string>();

    for (const fileName of files) {
      const filePath = path.join(TRANSACTIONS_DIR, fileName);
      const { rows, headerFound } = parseTransactionFile(filePath);

      if (!headerFound) {
        console.warn(`  Skipping ${fileName}: header row with 'كود الصنف' not found`);
        continue;
      }

      filesParsed++;
      rowsScanned += rows.length;
      console.log(`  Parsed ${fileName}: ${rows.length} item rows`);

      for (const row of rows) {
        if (!materialsByLegacy.has(row.legacyCode)) {
          unmatchedLegacyCodes.add(row.legacyCode);
          continue;
        }

        let units = invoiceUnitsByLegacy.get(row.legacyCode);
        if (!units) {
          units = new Map();
          invoiceUnitsByLegacy.set(row.legacyCode, units);
        }

        const invoiceUnit = row.unit || '(فارغ)';
        let usage = units.get(invoiceUnit);
        if (!usage) {
          usage = { invoiceUnit, supplierNames: new Set(), lastInvoiceNumber: '', lastInvoiceTime: -1 };
          units.set(invoiceUnit, usage);
        }

        if (row.supplierName) usage.supplierNames.add(row.supplierName);
        if (row.invoiceNumber && row.invoiceTime >= usage.lastInvoiceTime) {
          usage.lastInvoiceNumber = row.invoiceNumber;
          usage.lastInvoiceTime = row.invoiceTime;
        }
      }
    }

    const output: OutputRow[] = [];
    let matchedMaterials = 0;
    let materialsWithMismatch = 0;

    for (const [legacyCode, invoiceUnits] of invoiceUnitsByLegacy) {
      matchedMaterials++;
      const material = materialsByLegacy.get(legacyCode)!;
      const accepted = acceptedUnitKeys(material);
      const dbUnitArabic = formatDbUnitsArabic(material);

      let hasMismatch = false;
      for (const usage of invoiceUnits.values()) {
        const invoiceKey = resolveUnitKey(usage.invoiceUnit);
        // Match base unit or any material_unit_conversions alternate (incl. Arabic aliases).
        if (invoiceKey && accepted.has(invoiceKey)) continue;

        hasMismatch = true;
        output.push({
          legacyCode,
          title: material.title,
          dbUnitArabic,
          invoiceUnit: usage.invoiceUnit,
          supplierNames: [...usage.supplierNames].sort((a, b) => a.localeCompare(b, 'ar')).join('، '),
          lastInvoiceNumber: usage.lastInvoiceNumber,
        });
      }
      if (hasMismatch) materialsWithMismatch++;
    }

    output.sort((a, b) => a.legacyCode.localeCompare(b.legacyCode) || a.invoiceUnit.localeCompare(b.invoiceUnit));

    fs.mkdirSync(OUT_DIR, { recursive: true });

    try {
      writeCsv(
        OUT_CSV_PATH,
        CSV_HEADERS,
        output.map((r) => [r.legacyCode, r.title, r.dbUnitArabic, r.invoiceUnit, r.supplierNames, r.lastInvoiceNumber]),
      );
      console.log(`Wrote: ${OUT_CSV_PATH}`);
    } catch (e) {
      const err = e as NodeJS.ErrnoException;
      if (err.code === 'EBUSY' || err.code === 'EPERM') {
        console.warn(`Could not write CSV (file may be open): ${OUT_CSV_PATH}`);
      } else {
        throw e;
      }
    }

    await writeExcel(OUT_XLSX_PATH, output);
    console.log(`Wrote: ${OUT_XLSX_PATH}`);

    console.log('\n========== TRANSACTION UNIT COMPARISON STATS ==========');
    console.log(`Files parsed:                    ${filesParsed}`);
    console.log(`Transaction rows scanned:        ${rowsScanned}`);
    console.log(`Materials matched (in invoices): ${matchedMaterials}`);
    console.log(`Unmatched legacy codes in files: ${unmatchedLegacyCodes.size}`);
    if (unmatchedLegacyCodes.size > 0) {
      console.log(`  samples: ${[...unmatchedLegacyCodes].slice(0, 10).join(', ')}`);
    }
    console.log(`Materials with unit mismatch:    ${materialsWithMismatch}`);
    console.log(`Mismatch rows written:           ${output.length}`);
    console.log('=======================================================\n');
  } catch (e) {
    const err = e as Error & { cause?: { message?: string; detail?: string } };
    console.error(err.message);
    if (err.cause?.message) console.error(`Cause: ${err.cause.message}`);
    if (err.cause?.detail) console.error(`Detail: ${err.cause.detail}`);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

void main();
