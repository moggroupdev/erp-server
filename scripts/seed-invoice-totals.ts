import { eq, isNotNull, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { parseArgs } from 'node:util';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import * as schema from '../src/database/schema';
import * as xlsx from 'xlsx';

dotenv.config();

const USAGE = `Usage: npm run seed:invoice-totals

Seeds legacy e-invoice tax totals from:
  data/invoices/totals.xlsx

Matches workbook rows to material_purchase_orders by legacy_invoice_number.
Only updates when an invoice number maps to exactly one workbook row and exactly one DB order.

Options:
  -h, --help  Show this help

Examples:
  npm run seed:invoice-totals`;

const DATA_FILE = path.join(__dirname, '../data/invoices/totals.xlsx');

type InvoiceTotalRow = {
  sourceRowNumber: number;
  invoiceNumber: string;
  issuedAt: Date | null;
  sellerTaxNumber: string | null;
  totalPurchases: number;
  totalDiscount: number;
  vatAmount: number;
  withholdingTaxAmount: number;
  totalAmount: number;
};

type InvalidRow = {
  sourceRowNumber: number;
  reason: string;
  invoiceNumber?: string;
};

type Summary = {
  rowsLoaded: number;
  incompleteRowsSkipped: number;
  invalidRowsSkipped: number;
  ambiguousWorkbookInvoiceNumbers: number;
  ambiguousDbInvoiceNumbers: number;
  matchedAndUpdated: number;
  unmatchedInWorkbook: number;
  unmatchedInDb: number;
};

function parseCliArgs(): void {
  try {
    const { values } = parseArgs({
      options: {
        help: { type: 'boolean', short: 'h' },
      },
      allowPositionals: false,
    });

    if (values.help) {
      console.log(USAGE);
      process.exit(0);
    }
  } catch {
    console.error(USAGE);
    process.exit(1);
  }
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

function normalizeNumber(value: unknown, label: string): number {
  if (value == null || value === '') return 0;

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`Invalid ${label}: ${value}`);
    return value;
  }

  const trimmed = normalizeText(value);
  if (!trimmed) return 0;

  const normalized = trimmed.replace(/,/g, '');
  const result = Number(normalized);
  if (!Number.isFinite(result)) throw new Error(`Invalid ${label}: "${trimmed}"`);
  return result;
}

/** Parse YYYY-MM-DD (or Excel serial) as UTC noon. Returns null when blank. */
function parseIssuedAt(value: unknown): Date | null {
  if (value == null || value === '') return null;

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return new Date(Date.UTC(value.getFullYear(), value.getMonth(), value.getDate(), 12, 0, 0));
  }

  if (typeof value === 'number') {
    const parsed = xlsx.SSF.parse_date_code(value);
    if (!parsed) throw new Error(`Invalid Excel serial date: ${value}`);
    return new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d, 12, 0, 0));
  }

  const trimmed = normalizeText(value);
  if (!trimmed) return null;

  const match = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!match) throw new Error(`Unsupported issue date format: "${trimmed}"`);

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new Error(`Invalid issue date calendar value: ${trimmed}`);
  }
  return date;
}

function findColumnIndex(header: unknown[], aliases: string[]): number {
  const normalizedAliases = new Set(aliases.map((alias) => normalizeText(alias)));

  for (let i = 0; i < header.length; i++) {
    const cell = normalizeText(header[i]);
    if (normalizedAliases.has(cell)) return i;
  }

  return -1;
}

function loadWorkbookRows(): {
  rows: InvoiceTotalRow[];
  invalidRows: InvalidRow[];
  incompleteRows: InvalidRow[];
} {
  if (!fs.existsSync(DATA_FILE)) {
    throw new Error(`Invoice totals file not found: ${DATA_FILE}`);
  }

  const workbook = xlsx.readFile(DATA_FILE);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rawRows = xlsx.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null, raw: true });

  if (rawRows.length === 0) {
    throw new Error(`Workbook is empty: ${DATA_FILE}`);
  }

  const header = rawRows[0];
  const invoiceNumberIdx = findColumnIndex(header, ['رقم الفاتورة']);
  const issuedAtIdx = findColumnIndex(header, ['تاريخ الإصدار']);
  const sellerTaxNumberIdx = findColumnIndex(header, ['الرقم الضريبي للبائع']);
  const totalPurchasesIdx = findColumnIndex(header, ['اجمالي المشتريات (ج.م)']);
  const totalDiscountIdx = findColumnIndex(header, ['اجمالي الخصم (ج.م)']);
  const vatAmountIdx = findColumnIndex(header, ['ضريبه القيمه المضافه (ج.م)']);
  const withholdingTaxAmountIdx = findColumnIndex(header, ['الخصم تحت حساب الضريبه (ج.م)']);
  const totalAmountIdx = findColumnIndex(header, ['اجمالي المبلغ (ج.م)']);

  const requiredIndices = [
    invoiceNumberIdx,
    issuedAtIdx,
    sellerTaxNumberIdx,
    totalPurchasesIdx,
    totalDiscountIdx,
    vatAmountIdx,
    withholdingTaxAmountIdx,
    totalAmountIdx,
  ];
  if (requiredIndices.some((idx) => idx < 0)) {
    throw new Error(`Some expected columns were not found in ${DATA_FILE}`);
  }

  const rows: InvoiceTotalRow[] = [];
  const invalidRows: InvalidRow[] = [];
  const incompleteRows: InvalidRow[] = [];

  for (let i = 1; i < rawRows.length; i++) {
    const rawRow = rawRows[i];
    const invoiceNumber = normalizeIdentifier(rawRow[invoiceNumberIdx]);
    if (!invoiceNumber) continue;

    try {
      const totalPurchases = normalizeNumber(rawRow[totalPurchasesIdx], 'total purchases');
      const totalDiscount = normalizeNumber(rawRow[totalDiscountIdx], 'total discount');
      const vatAmount = normalizeNumber(rawRow[vatAmountIdx], 'VAT amount');
      const withholdingTaxAmount = normalizeNumber(rawRow[withholdingTaxAmountIdx], 'withholding tax');
      const totalAmount = normalizeNumber(rawRow[totalAmountIdx], 'total amount');

      if (totalPurchases === 0 && totalAmount === 0) {
        incompleteRows.push({
          sourceRowNumber: i + 1,
          invoiceNumber,
          reason: 'Missing financial totals (total purchases and total amount are both 0)',
        });
        continue;
      }

      if (totalPurchases < 0 || totalDiscount < 0 || vatAmount < 0 || withholdingTaxAmount < 0 || totalAmount < 0) {
        throw new Error('Financial amounts must be non-negative');
      }

      const sellerTaxNumber = normalizeText(rawRow[sellerTaxNumberIdx]) || null;
      const issuedAt = parseIssuedAt(rawRow[issuedAtIdx]);

      rows.push({
        sourceRowNumber: i + 1,
        invoiceNumber,
        issuedAt,
        sellerTaxNumber,
        totalPurchases,
        totalDiscount,
        vatAmount,
        withholdingTaxAmount,
        totalAmount,
      });
    } catch (error) {
      invalidRows.push({
        sourceRowNumber: i + 1,
        invoiceNumber,
        reason: (error as Error).message,
      });
    }
  }

  return { rows, invalidRows, incompleteRows };
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not defined in .env');

  parseCliArgs();

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool, { schema });

  const summary: Summary = {
    rowsLoaded: 0,
    incompleteRowsSkipped: 0,
    invalidRowsSkipped: 0,
    ambiguousWorkbookInvoiceNumbers: 0,
    ambiguousDbInvoiceNumbers: 0,
    matchedAndUpdated: 0,
    unmatchedInWorkbook: 0,
    unmatchedInDb: 0,
  };

  const ambiguousWorkbookNumbers: string[] = [];
  const ambiguousDbNumbers: string[] = [];
  const unmatchedWorkbookNumbers: string[] = [];
  const unmatchedDbNumbers: string[] = [];

  try {
    console.log(`Reading invoice totals from ${DATA_FILE}`);
    const { rows, invalidRows, incompleteRows } = loadWorkbookRows();
    summary.rowsLoaded = rows.length;
    summary.incompleteRowsSkipped = incompleteRows.length;
    summary.invalidRowsSkipped = invalidRows.length;

    console.log(`Loaded ${rows.length} usable workbook row(s)`);
    if (incompleteRows.length > 0) {
      console.log(`Skipped ${incompleteRows.length} incomplete row(s) with missing financial totals`);
    }
    if (invalidRows.length > 0) {
      console.log(`Skipped ${invalidRows.length} invalid row(s) during parsing`);
    }

    const workbookByInvoice = new Map<string, InvoiceTotalRow[]>();
    for (const row of rows) {
      const existing = workbookByInvoice.get(row.invoiceNumber);
      if (existing) existing.push(row);
      else workbookByInvoice.set(row.invoiceNumber, [row]);
    }

    const uniqueWorkbookRows = new Map<string, InvoiceTotalRow>();
    for (const [invoiceNumber, group] of workbookByInvoice) {
      if (group.length === 1) {
        uniqueWorkbookRows.set(invoiceNumber, group[0]);
      } else {
        summary.ambiguousWorkbookInvoiceNumbers++;
        ambiguousWorkbookNumbers.push(invoiceNumber);
      }
    }

    const orderRows = await db
      .select({
        id: schema.materialPurchaseOrders.id,
        code: schema.materialPurchaseOrders.code,
        legacyInvoiceNumber: schema.materialPurchaseOrders.legacyInvoiceNumber,
      })
      .from(schema.materialPurchaseOrders)
      .where(isNotNull(schema.materialPurchaseOrders.legacyInvoiceNumber));

    const dbByInvoice = new Map<string, Array<{ id: string; code: string }>>();
    for (const order of orderRows) {
      const invoiceNumber = normalizeIdentifier(order.legacyInvoiceNumber);
      if (!invoiceNumber) continue;

      const existing = dbByInvoice.get(invoiceNumber);
      if (existing) existing.push({ id: order.id, code: order.code });
      else dbByInvoice.set(invoiceNumber, [{ id: order.id, code: order.code }]);
    }

    const uniqueDbOrders = new Map<string, { id: string; code: string }>();
    for (const [invoiceNumber, group] of dbByInvoice) {
      if (group.length === 1) {
        uniqueDbOrders.set(invoiceNumber, group[0]);
      } else {
        summary.ambiguousDbInvoiceNumbers++;
        ambiguousDbNumbers.push(invoiceNumber);
      }
    }

    const invoiceNumbersToUpdate: string[] = [];
    for (const invoiceNumber of uniqueWorkbookRows.keys()) {
      if (uniqueDbOrders.has(invoiceNumber)) {
        invoiceNumbersToUpdate.push(invoiceNumber);
      } else if (!dbByInvoice.has(invoiceNumber)) {
        summary.unmatchedInWorkbook++;
        unmatchedWorkbookNumbers.push(invoiceNumber);
      }
    }

    for (const invoiceNumber of uniqueDbOrders.keys()) {
      if (!workbookByInvoice.has(invoiceNumber)) {
        summary.unmatchedInDb++;
        unmatchedDbNumbers.push(invoiceNumber);
      }
    }

    console.log(`Updating ${invoiceNumbersToUpdate.length} matched order(s)...`);
    console.log('Writing all updates in one database transaction. A failure rolls back the entire run.');

    await db.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL statement_timeout = 0`);
      await tx.execute(sql`SET LOCAL idle_in_transaction_session_timeout = 0`);

      for (const invoiceNumber of invoiceNumbersToUpdate) {
        const workbookRow = uniqueWorkbookRows.get(invoiceNumber)!;
        const order = uniqueDbOrders.get(invoiceNumber)!;

        await tx
          .update(schema.materialPurchaseOrders)
          .set({
            legacyInvoiceIssuedAt: workbookRow.issuedAt,
            legacyInvoiceSellerTaxNumber: workbookRow.sellerTaxNumber,
            legacyInvoiceTotalPurchases: workbookRow.totalPurchases,
            legacyInvoiceTotalDiscount: workbookRow.totalDiscount,
            legacyInvoiceVatAmount: workbookRow.vatAmount,
            legacyInvoiceWithholdingTaxAmount: workbookRow.withholdingTaxAmount,
            legacyInvoiceTotalAmount: workbookRow.totalAmount,
          })
          .where(eq(schema.materialPurchaseOrders.id, order.id));

        summary.matchedAndUpdated++;
      }
    });

    console.log('\n========== INVOICE TOTALS SEED STATS ==========');
    console.log(`Workbook rows loaded:              ${summary.rowsLoaded}`);
    console.log(`Incomplete rows skipped:          ${summary.incompleteRowsSkipped}`);
    console.log(`Invalid rows skipped:             ${summary.invalidRowsSkipped}`);
    console.log(`Ambiguous workbook invoice #s:    ${summary.ambiguousWorkbookInvoiceNumbers}`);
    console.log(`Ambiguous DB invoice #s:          ${summary.ambiguousDbInvoiceNumbers}`);
    console.log(`Matched & updated:                ${summary.matchedAndUpdated}`);
    console.log(`Unmatched in workbook (no DB):    ${summary.unmatchedInWorkbook}`);
    console.log(`Unmatched in DB (no workbook):    ${summary.unmatchedInDb}`);

    if (incompleteRows.length > 0) {
      console.log('\n--- Incomplete rows skipped ---');
      for (const row of incompleteRows.slice(0, 20)) {
        console.log(`  row ${row.sourceRowNumber}: invoice=${row.invoiceNumber ?? '(none)'} | ${row.reason}`);
      }
      if (incompleteRows.length > 20) console.log(`  ... and ${incompleteRows.length - 20} more`);
    }

    if (invalidRows.length > 0) {
      console.log('\n--- Invalid rows skipped ---');
      for (const row of invalidRows.slice(0, 20)) {
        console.log(`  row ${row.sourceRowNumber}: invoice=${row.invoiceNumber ?? '(none)'} | ${row.reason}`);
      }
      if (invalidRows.length > 20) console.log(`  ... and ${invalidRows.length - 20} more`);
    }

    if (ambiguousWorkbookNumbers.length > 0) {
      console.log('\n--- Ambiguous invoice numbers in workbook (skipped) ---');
      for (const invoiceNumber of ambiguousWorkbookNumbers.slice(0, 30)) {
        console.log(`  ${invoiceNumber}`);
      }
      if (ambiguousWorkbookNumbers.length > 30) {
        console.log(`  ... and ${ambiguousWorkbookNumbers.length - 30} more`);
      }
    }

    if (ambiguousDbNumbers.length > 0) {
      console.log('\n--- Ambiguous invoice numbers in DB (skipped) ---');
      for (const invoiceNumber of ambiguousDbNumbers.slice(0, 30)) {
        console.log(`  ${invoiceNumber}`);
      }
      if (ambiguousDbNumbers.length > 30) {
        console.log(`  ... and ${ambiguousDbNumbers.length - 30} more`);
      }
    }

    if (unmatchedWorkbookNumbers.length > 0) {
      console.log('\n--- Invoice numbers in workbook with no DB order ---');
      for (const invoiceNumber of unmatchedWorkbookNumbers.slice(0, 30)) {
        console.log(`  ${invoiceNumber}`);
      }
      if (unmatchedWorkbookNumbers.length > 30) {
        console.log(`  ... and ${unmatchedWorkbookNumbers.length - 30} more`);
      }
    }

    if (unmatchedDbNumbers.length > 0) {
      console.log('\n--- Invoice numbers in DB with no workbook row ---');
      for (const invoiceNumber of unmatchedDbNumbers.slice(0, 30)) {
        console.log(`  ${invoiceNumber}`);
      }
      if (unmatchedDbNumbers.length > 30) {
        console.log(`  ... and ${unmatchedDbNumbers.length - 30} more`);
      }
    }

    console.log('================================================');
    console.log('Legacy invoice totals seed script completed.');
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
