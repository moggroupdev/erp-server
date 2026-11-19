import { eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { parseArgs } from 'node:util';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as schema from '../../src/database/schema';
import * as xlsx from 'xlsx';
import { SEED_IMPORT_NOTE } from '../_utils/seed-constants';
import {
  INVOICE_TOTALS_DATA_FILE,
  extractSupplierFromFileName,
  findColumnIndex,
  matchRowsToInvoices,
  normalizeIdentifier,
  normalizeText,
  type InvoiceMatchCandidate,
  type InvoiceMatchProblem,
  type InvoiceWorkbookRow,
} from '../_utils/invoice-workbook';

dotenv.config();

const USAGE = `Usage: npm run seed:invoice-totals

Seeds legacy e-invoice tax totals from:
  data/invoices/totals.xlsx

Matches workbook rows to supplier_invoices by invoice_number.
Only invoices linked to seeded material purchase orders are considered
(notes = SEED_IMPORT_NOTE). User-created invoices are ignored.

invoice_number is unique per supplier, not globally:
  - Unique invoice number in both the workbook and the DB → match by invoice number
  - Duplicated invoice number → disambiguate by the supplier linked to the invoice,
    using the supplier name embedded in اسم الملف

When تاريخ الإصدار is present, it also overrides:
  supplier_invoices.issuedAt
  material_purchase_orders.createdAt / completedAt (parent order)
  material_purchase_receipts.receivedAt / createdAt (all receipts for that order)

Unresolved or conflicting rows are logged and skipped.

Options:
  -h, --help  Show this help

Examples:
  npm run seed:invoice-totals`;

const DATA_FILE = INVOICE_TOTALS_DATA_FILE;

type InvoiceTotalRow = InvoiceWorkbookRow & {
  issuedAt: Date | null;
  totalPurchases: number;
  totalDiscount: number;
  vatAmount: number;
  withholdingTaxAmount: number;
  totalAmount: number;
};

type DbInvoice = InvoiceMatchCandidate & {
  materialPurchaseOrderId: string | null;
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
  matchedByInvoice: number;
  matchedByInvoiceAndSupplier: number;
  unmatchedInWorkbook: number;
  unmatchedInDb: number;
  unresolvedDuplicates: number;
  datesOverridden: number;
  datesSkippedMissingIssuedAt: number;
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

function loadWorkbookRows(): {
  rows: InvoiceTotalRow[];
  invalidRows: InvalidRow[];
  incompleteRows: InvalidRow[];
  missingFileNameColumn: boolean;
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
  const fileNameIdx = findColumnIndex(header, ['اسم الملف']);
  const invoiceNumberIdx = findColumnIndex(header, ['رقم الفاتورة']);
  const issuedAtIdx = findColumnIndex(header, ['تاريخ الإصدار']);
  const totalPurchasesIdx = findColumnIndex(header, ['اجمالي المشتريات (ج.م)']);
  const totalDiscountIdx = findColumnIndex(header, ['اجمالي الخصم (ج.م)']);
  const vatAmountIdx = findColumnIndex(header, ['ضريبه القيمه المضافه (ج.م)']);
  const withholdingTaxAmountIdx = findColumnIndex(header, ['الخصم تحت حساب الضريبه (ج.م)']);
  const totalAmountIdx = findColumnIndex(header, ['اجمالي المبلغ (ج.م)']);

  const requiredIndices = [
    invoiceNumberIdx,
    issuedAtIdx,
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

      const sourceFileName = fileNameIdx >= 0 ? normalizeText(rawRow[fileNameIdx]) || null : null;
      const supplierNameHint = sourceFileName ? extractSupplierFromFileName(sourceFileName) : null;

      rows.push({
        sourceRowNumber: i + 1,
        invoiceNumber,
        sourceFileName,
        supplierNameHint,
        issuedAt: parseIssuedAt(rawRow[issuedAtIdx]),
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

  return { rows, invalidRows, incompleteRows, missingFileNameColumn: fileNameIdx < 0 };
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
    matchedByInvoice: 0,
    matchedByInvoiceAndSupplier: 0,
    unmatchedInWorkbook: 0,
    unmatchedInDb: 0,
    unresolvedDuplicates: 0,
    datesOverridden: 0,
    datesSkippedMissingIssuedAt: 0,
  };

  try {
    console.log(`Reading invoice totals from ${DATA_FILE}`);
    const { rows, invalidRows, incompleteRows, missingFileNameColumn } = loadWorkbookRows();
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

    const problems: InvoiceMatchProblem[] = [];

    if (missingFileNameColumn) {
      problems.push({
        level: 'warning',
        message: 'Column اسم الملف was not found. Duplicate invoice numbers cannot be resolved by supplier.',
      });
    }

    const invoiceRows = await db
      .select({
        id: schema.supplierInvoices.id,
        invoiceNumber: schema.supplierInvoices.invoiceNumber,
        materialPurchaseOrderId: schema.supplierInvoices.materialPurchaseOrderId,
        orderCode: schema.materialPurchaseOrders.code,
        supplierId: schema.supplierInvoices.supplierId,
        supplierName: schema.suppliers.name,
      })
      .from(schema.supplierInvoices)
      .innerJoin(schema.suppliers, eq(schema.supplierInvoices.supplierId, schema.suppliers.id))
      .innerJoin(
        schema.materialPurchaseOrders,
        eq(schema.supplierInvoices.materialPurchaseOrderId, schema.materialPurchaseOrders.id),
      )
      .where(eq(schema.materialPurchaseOrders.notes, SEED_IMPORT_NOTE));

    console.log(`Loaded ${invoiceRows.length} seeded supplier invoice(s) (MPO notes = seed import note)`);

    const invoices: DbInvoice[] = [];
    for (const row of invoiceRows) {
      const invoiceNumber = normalizeIdentifier(row.invoiceNumber);
      if (!invoiceNumber) {
        problems.push({
          level: 'warning',
          message: `Supplier invoice ${row.id} has a blank invoice number after normalization; skipped.`,
        });
        continue;
      }

      invoices.push({
        id: row.id,
        invoiceNumber,
        materialPurchaseOrderId: row.materialPurchaseOrderId,
        orderCode: row.orderCode,
        supplierName: row.supplierName,
      });
    }

    const { matches, problems: matchProblems } = matchRowsToInvoices(rows, invoices);
    problems.push(...matchProblems);

    for (const problem of matchProblems) {
      if (problem.level !== 'error') continue;
      if (problem.message.startsWith('DB supplier invoice has no matching workbook row')) {
        summary.unmatchedInDb++;
      } else if (
        problem.message.startsWith('Workbook row has no matching supplier invoice') ||
        problem.message.startsWith('No supplier invoice for')
      ) {
        summary.unmatchedInWorkbook++;
      } else {
        summary.unresolvedDuplicates++;
      }
    }

    console.log(`Updating ${matches.length} matched supplier invoice(s)...`);
    console.log('Writing all updates in one database transaction. A failure rolls back the entire run.');

    await db.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL statement_timeout = 0`);
      await tx.execute(sql`SET LOCAL idle_in_transaction_session_timeout = 0`);

      for (const match of matches) {
        const { workbookRow, invoice, method } = match;

        const invoiceUpdate: {
          issuedAt: Date | null;
          totalPurchases: number;
          totalDiscount: number;
          vatAmount: number;
          withholdingTaxAmount: number;
          totalAmount: number;
        } = {
          issuedAt: workbookRow.issuedAt,
          totalPurchases: workbookRow.totalPurchases,
          totalDiscount: workbookRow.totalDiscount,
          vatAmount: workbookRow.vatAmount,
          withholdingTaxAmount: workbookRow.withholdingTaxAmount,
          totalAmount: workbookRow.totalAmount,
        };

        if (workbookRow.issuedAt) {
          invoiceUpdate.issuedAt = workbookRow.issuedAt;

          if (invoice.materialPurchaseOrderId) {
            await tx
              .update(schema.materialPurchaseOrders)
              .set({
                createdAt: workbookRow.issuedAt,
                completedAt: workbookRow.issuedAt,
              })
              .where(eq(schema.materialPurchaseOrders.id, invoice.materialPurchaseOrderId));

            await tx
              .update(schema.materialPurchaseReceipts)
              .set({
                receivedAt: workbookRow.issuedAt,
                createdAt: workbookRow.issuedAt,
              })
              .where(eq(schema.materialPurchaseReceipts.materialPurchaseOrderId, invoice.materialPurchaseOrderId));
          }

          summary.datesOverridden++;
        } else {
          summary.datesSkippedMissingIssuedAt++;
          problems.push({
            level: 'warning',
            message: `Matched supplier invoice ${invoice.orderCode ?? invoice.id} (invoice ${workbookRow.invoiceNumber}) but تاريخ الإصدار is empty; tax totals updated, dates left unchanged.`,
          });
        }

        await tx
          .update(schema.supplierInvoices)
          .set(invoiceUpdate)
          .where(eq(schema.supplierInvoices.id, invoice.id));

        if (method === 'invoice') summary.matchedByInvoice++;
        else summary.matchedByInvoiceAndSupplier++;
      }
    });

    console.log('\n========== INVOICE TOTALS SEED STATS ==========');
    console.log(`Workbook rows loaded:                 ${summary.rowsLoaded}`);
    console.log(`Incomplete rows skipped:             ${summary.incompleteRowsSkipped}`);
    console.log(`Invalid rows skipped:                ${summary.invalidRowsSkipped}`);
    console.log(`Matched by invoice number:           ${summary.matchedByInvoice}`);
    console.log(`Matched by invoice + supplier:       ${summary.matchedByInvoiceAndSupplier}`);
    console.log(`Dates overridden from تاريخ الإصدار: ${summary.datesOverridden}`);
    console.log(`Dates skipped (missing issue date):  ${summary.datesSkippedMissingIssuedAt}`);
    console.log(`Unmatched in workbook (no DB):       ${summary.unmatchedInWorkbook}`);
    console.log(`Unmatched in DB (no workbook):       ${summary.unmatchedInDb}`);
    console.log(`Unresolved duplicate invoice rows:   ${summary.unresolvedDuplicates}`);

    if (incompleteRows.length > 0) {
      console.log('\n--- Incomplete rows skipped ---');
      for (const row of incompleteRows) {
        console.log(`  row ${row.sourceRowNumber}: invoice=${row.invoiceNumber ?? '(none)'} | ${row.reason}`);
      }
    }

    if (invalidRows.length > 0) {
      console.log('\n--- Invalid rows skipped ---');
      for (const row of invalidRows) {
        console.log(`  row ${row.sourceRowNumber}: invoice=${row.invoiceNumber ?? '(none)'} | ${row.reason}`);
      }
    }

    const warnings = problems.filter((problem) => problem.level === 'warning');
    const errors = problems.filter((problem) => problem.level === 'error');

    if (warnings.length > 0) {
      console.log('\n--- Warnings ---');
      for (const problem of warnings) console.log(`  ${problem.message}`);
    }

    if (errors.length > 0) {
      console.log('\n--- Problems (not updated) ---');
      for (const problem of errors) console.log(`  ${problem.message}`);
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
