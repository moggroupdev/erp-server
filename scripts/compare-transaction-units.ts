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

/** Arabic labels mirrored from erp-app material-units.ts for comparison against invoice text. */
const UNIT_AR_LABELS: Record<string, string> = {
  count: 'عدد',
  kg: 'كيلوجرام',
  gram: 'جرام',
  meter: 'متر',
  cm: 'سنتيمتر',
  liter: 'لتر',
  sheet: 'لوح',
  roll: 'لفة',
  box: 'صندوق',
};

const TRANSACTIONS_DIR = path.join(__dirname, '../data/transactions');
const OUT_DIR = path.join(TRANSACTIONS_DIR, 'results');
const OUT_CSV_PATH = path.join(OUT_DIR, 'unit-mismatches.csv');
const OUT_XLSX_PATH = path.join(OUT_DIR, 'unit-mismatches.xlsx');

const CSV_HEADERS = ['الكود', 'اسم الصنف', 'الوحدة في قاعدة البيانات', 'الوحدة في الفواتير'] as const;

type MaterialRow = {
  legacyCode: string;
  title: string;
  unitOfMeasurement: string;
};

type OutputRow = {
  legacyCode: string;
  title: string;
  dbUnitArabic: string;
  invoiceUnit: string;
};

function norm(value: unknown): string {
  if (value == null) return '';
  return String(value).replace(/\s+/g, ' ').trim();
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
    });
    excelRow.height = 22;
    excelRow.eachCell((cell, colNumber) => {
      cell.font = { size: 11, name: 'Arial' };
      cell.border = thinBorder;
      cell.alignment = {
        horizontal: colNumber === 2 ? 'right' : 'center',
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
    to: { row: Math.max(1, sheet.rowCount), column: 4 },
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

function parseTransactionFile(filePath: string): {
  rows: { legacyCode: string; title: string; unit: string }[];
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

  if (codeCol === -1 || unitCol === -1) {
    return { rows: [], headerFound: false };
  }

  const rows: { legacyCode: string; title: string; unit: string }[] = [];
  for (let i = headerIdx + 1; i < sheetRows.length; i++) {
    const row = sheetRows[i];
    if (!row) continue;

    const legacyCode = norm(row[codeCol]);
    if (!legacyCode) continue;

    rows.push({
      legacyCode,
      title: titleCol >= 0 ? norm(row[titleCol]) : '',
      unit: norm(row[unitCol]),
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
        legacyCode: schema.materials.legacyCode,
        title: schema.materials.title,
        unitOfMeasurement: schema.materials.unitOfMeasurement,
      })
      .from(schema.materials)
      .where(isNotNull(schema.materials.legacyCode));

    const materialsByLegacy = new Map<string, MaterialRow>();
    for (const row of materialRows) {
      if (!row.legacyCode) continue;
      materialsByLegacy.set(row.legacyCode, {
        legacyCode: row.legacyCode,
        title: row.title,
        unitOfMeasurement: row.unitOfMeasurement,
      });
    }

    console.log(`Loaded ${materialsByLegacy.size} materials with legacyCode from DB`);
    console.log(`Found ${files.length} transaction file(s)`);

    // legacyCode -> distinct raw invoice units
    const invoiceUnitsByLegacy = new Map<string, Set<string>>();
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
          units = new Set();
          invoiceUnitsByLegacy.set(row.legacyCode, units);
        }
        if (row.unit) {
          units.add(row.unit);
        } else {
          units.add('(فارغ)');
        }
      }
    }

    const output: OutputRow[] = [];
    let matchedMaterials = 0;
    let materialsWithMismatch = 0;

    for (const [legacyCode, invoiceUnits] of invoiceUnitsByLegacy) {
      matchedMaterials++;
      const material = materialsByLegacy.get(legacyCode)!;
      const dbUnitArabic = UNIT_AR_LABELS[material.unitOfMeasurement] ?? material.unitOfMeasurement;
      const dbNorm = norm(dbUnitArabic);

      let hasMismatch = false;
      for (const invoiceUnit of invoiceUnits) {
        if (norm(invoiceUnit) !== dbNorm) {
          hasMismatch = true;
          output.push({
            legacyCode,
            title: material.title,
            dbUnitArabic,
            invoiceUnit,
          });
        }
      }
      if (hasMismatch) materialsWithMismatch++;
    }

    output.sort((a, b) => a.legacyCode.localeCompare(b.legacyCode) || a.invoiceUnit.localeCompare(b.invoiceUnit));

    fs.mkdirSync(OUT_DIR, { recursive: true });

    try {
      writeCsv(
        OUT_CSV_PATH,
        CSV_HEADERS,
        output.map((r) => [r.legacyCode, r.title, r.dbUnitArabic, r.invoiceUnit]),
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
