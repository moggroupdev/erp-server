import { eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { parseArgs } from 'node:util';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import * as xlsx from 'xlsx';
import * as schema from '../../src/database/schema';
import {
  buildInvoicePdfFilename,
  SUPPLIER_INVOICE_PDF_SUBDIRECTORY,
} from '../../src/utils/helpers/supplier-invoice-pdf-filename';
import {
  INVOICE_TOTALS_DATA_FILE,
  extractSupplierFromFileName,
  findColumnIndex,
  formatWorkbookRow,
  matchRowsToInvoices,
  normalizeIdentifier,
  normalizeSupplierName,
  normalizeText,
  type InvoiceMatchCandidate,
  type InvoiceMatchProblem,
  type InvoiceWorkbookRow,
} from '../_utils/invoice-workbook';

dotenv.config();

const DEFAULT_SOURCE_DIR = 'C:\\Users\\user\\Desktop\\INVOICES_SOURCE';

const USAGE = `Usage: npm run seed:invoice-pdfs [-- --source <dir>] [--dry-run] [--replace]

Copies legacy invoice PDFs from a source folder into uploads/supplier-invoices/
and sets supplier_invoices.pdf_filename, using the same naming as live uploads:
  {supplierCode}_{invoiceNumber}_{shortId}.pdf

Matching uses data/invoices/totals.xlsx:
  - Unique invoice number → match by number
  - Duplicated invoice number → disambiguate by supplier name in اسم الملف

Source files are resolved by exact filename first, then by normalized Arabic
spelling (ه/ة, ى/ي, alef forms).

Options:
  --source <dir>  Source PDF folder (default: ${DEFAULT_SOURCE_DIR})
  --dry-run       Match and report only; no copies or DB writes
  --replace       Relink invoices that already have pdf_filename
  -h, --help      Show this help

Examples:
  npm run seed:invoice-pdfs -- --dry-run
  npm run seed:invoice-pdfs
  npm run seed:invoice-pdfs -- --source "D:\\\\invoices" --replace`;

type PdfWorkbookRow = InvoiceWorkbookRow;

type DbInvoice = InvoiceMatchCandidate & {
  pdfFilename: string | null;
  supplierCode: string;
};

type CliOptions = {
  sourceDir: string;
  dryRun: boolean;
  replace: boolean;
};

type LinkPlan = {
  invoiceId: string;
  invoiceNumber: string;
  supplierName: string;
  supplierCode: string;
  sourcePath: string;
  sourceFileName: string;
  newPdfFilename: string;
  previousPdfFilename: string | null;
  method: 'invoice' | 'invoice+supplier';
  resolvedViaNormalization: boolean;
};

type Summary = {
  workbookRowsLoaded: number;
  matched: number;
  linked: number;
  skippedAlreadyHasPdf: number;
  missingSourceFile: number;
  unmatchedInWorkbook: number;
  unmatchedInDb: number;
  unresolvedDuplicates: number;
  matchedByInvoice: number;
  matchedByInvoiceAndSupplier: number;
  resolvedViaNormalization: number;
};

function parseCliArgs(): CliOptions {
  try {
    const { values } = parseArgs({
      options: {
        help: { type: 'boolean', short: 'h' },
        source: { type: 'string' },
        'dry-run': { type: 'boolean', default: false },
        replace: { type: 'boolean', default: false },
      },
      allowPositionals: false,
    });

    if (values.help) {
      console.log(USAGE);
      process.exit(0);
    }

    return {
      sourceDir: path.resolve(values.source ?? DEFAULT_SOURCE_DIR),
      dryRun: Boolean(values['dry-run']),
      replace: Boolean(values.replace),
    };
  } catch {
    console.error(USAGE);
    process.exit(1);
  }
}

function loadWorkbookPdfRows(): { rows: PdfWorkbookRow[]; skippedNonPdf: number } {
  if (!fs.existsSync(INVOICE_TOTALS_DATA_FILE)) {
    throw new Error(`Invoice totals file not found: ${INVOICE_TOTALS_DATA_FILE}`);
  }

  const workbook = xlsx.readFile(INVOICE_TOTALS_DATA_FILE);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rawRows = xlsx.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null, raw: true });

  if (rawRows.length === 0) {
    throw new Error(`Workbook is empty: ${INVOICE_TOTALS_DATA_FILE}`);
  }

  const header = rawRows[0];
  const fileNameIdx = findColumnIndex(header, ['اسم الملف']);
  const invoiceNumberIdx = findColumnIndex(header, ['رقم الفاتورة']);

  if (fileNameIdx < 0 || invoiceNumberIdx < 0) {
    throw new Error(`Expected columns اسم الملف and رقم الفاتورة were not found in ${INVOICE_TOTALS_DATA_FILE}`);
  }

  const rows: PdfWorkbookRow[] = [];
  let skippedNonPdf = 0;

  for (let i = 1; i < rawRows.length; i++) {
    const rawRow = rawRows[i];
    const invoiceNumber = normalizeIdentifier(rawRow[invoiceNumberIdx]);
    const sourceFileName = normalizeText(rawRow[fileNameIdx]) || null;

    if (!invoiceNumber && !sourceFileName) continue;

    if (!sourceFileName || !/\.pdf$/i.test(sourceFileName)) {
      skippedNonPdf++;
      continue;
    }

    if (!invoiceNumber) continue;

    rows.push({
      sourceRowNumber: i + 1,
      invoiceNumber,
      sourceFileName,
      supplierNameHint: extractSupplierFromFileName(sourceFileName),
    });
  }

  return { rows, skippedNonPdf };
}

function buildSourceFileIndex(sourceDir: string): {
  exact: Map<string, string>;
  normalized: Map<string, string[]>;
} {
  if (!fs.existsSync(sourceDir)) {
    throw new Error(`Source directory not found: ${sourceDir}`);
  }

  const exact = new Map<string, string>();
  const normalized = new Map<string, string[]>();

  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    if (!/\.pdf$/i.test(entry.name)) continue;

    const fullPath = path.join(sourceDir, entry.name);
    exact.set(entry.name, fullPath);

    const key = normalizeSupplierName(entry.name);
    const existing = normalized.get(key);
    if (existing) existing.push(fullPath);
    else normalized.set(key, [fullPath]);
  }

  return { exact, normalized };
}

function resolveSourceFile(
  sourceFileName: string,
  index: { exact: Map<string, string>; normalized: Map<string, string[]> },
): { path: string; viaNormalization: boolean } | null {
  const exactPath = index.exact.get(sourceFileName);
  if (exactPath) return { path: exactPath, viaNormalization: false };

  const candidates = index.normalized.get(normalizeSupplierName(sourceFileName)) ?? [];
  if (candidates.length === 1) return { path: candidates[0], viaNormalization: true };

  return null;
}

function unlinkQuietly(filePath: string): void {
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch {
    // Best-effort cleanup
  }
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not defined in .env');

  const options = parseCliArgs();
  const uploadsDir = path.join(process.cwd(), 'uploads', SUPPLIER_INVOICE_PDF_SUBDIRECTORY);

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool, { schema });

  const summary: Summary = {
    workbookRowsLoaded: 0,
    matched: 0,
    linked: 0,
    skippedAlreadyHasPdf: 0,
    missingSourceFile: 0,
    unmatchedInWorkbook: 0,
    unmatchedInDb: 0,
    unresolvedDuplicates: 0,
    matchedByInvoice: 0,
    matchedByInvoiceAndSupplier: 0,
    resolvedViaNormalization: 0,
  };

  const problems: InvoiceMatchProblem[] = [];
  const copiedThisRun: string[] = [];
  const previousFilesToDeleteAfterCommit: string[] = [];

  try {
    console.log(`Reading invoice filenames from ${INVOICE_TOTALS_DATA_FILE}`);
    console.log(`Source PDF folder: ${options.sourceDir}`);
    console.log(`Uploads folder:    ${uploadsDir}`);
    if (options.dryRun) console.log('Dry run: no files will be copied and no DB rows will be updated.');
    if (options.replace) console.log('Replace mode: invoices that already have a PDF will be relinked.');

    const { rows, skippedNonPdf } = loadWorkbookPdfRows();
    summary.workbookRowsLoaded = rows.length;
    console.log(`Loaded ${rows.length} workbook PDF row(s)`);
    if (skippedNonPdf > 0) {
      console.log(`Skipped ${skippedNonPdf} non-PDF / totals workbook row(s)`);
    }

    const sourceIndex = buildSourceFileIndex(options.sourceDir);
    console.log(`Indexed ${sourceIndex.exact.size} PDF file(s) in source folder`);

    const invoiceRows = await db
      .select({
        id: schema.supplierInvoices.id,
        invoiceNumber: schema.supplierInvoices.invoiceNumber,
        pdfFilename: schema.supplierInvoices.pdfFilename,
        orderCode: schema.materialPurchaseOrders.code,
        supplierName: schema.suppliers.name,
        supplierCode: schema.suppliers.code,
      })
      .from(schema.supplierInvoices)
      .innerJoin(schema.suppliers, eq(schema.supplierInvoices.supplierId, schema.suppliers.id))
      .leftJoin(
        schema.materialPurchaseOrders,
        eq(schema.supplierInvoices.materialPurchaseOrderId, schema.materialPurchaseOrders.id),
      );

    console.log(`Loaded ${invoiceRows.length} supplier invoice(s) from the database`);

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
        pdfFilename: row.pdfFilename,
        orderCode: row.orderCode,
        supplierName: row.supplierName,
        supplierCode: row.supplierCode,
      });
    }

    const { matches, problems: matchProblems } = matchRowsToInvoices(rows, invoices);
    problems.push(...matchProblems);
    summary.matched = matches.length;

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

    const linkPlans: LinkPlan[] = [];

    for (const match of matches) {
      const { workbookRow, invoice, method } = match;

      if (method === 'invoice') summary.matchedByInvoice++;
      else summary.matchedByInvoiceAndSupplier++;

      if (invoice.pdfFilename && !options.replace) {
        summary.skippedAlreadyHasPdf++;
        continue;
      }

      if (!workbookRow.sourceFileName) {
        problems.push({
          level: 'error',
          message: `Matched invoice ${invoice.orderCode ?? invoice.id} but workbook row has no اسم الملف (${formatWorkbookRow(workbookRow)}).`,
        });
        summary.missingSourceFile++;
        continue;
      }

      const resolved = resolveSourceFile(workbookRow.sourceFileName, sourceIndex);
      if (!resolved) {
        problems.push({
          level: 'error',
          message: `Source PDF not found for ${formatWorkbookRow(workbookRow)}.`,
        });
        summary.missingSourceFile++;
        continue;
      }

      if (resolved.viaNormalization) summary.resolvedViaNormalization++;

      linkPlans.push({
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        supplierName: invoice.supplierName,
        supplierCode: invoice.supplierCode,
        sourcePath: resolved.path,
        sourceFileName: workbookRow.sourceFileName,
        newPdfFilename: buildInvoicePdfFilename(invoice.supplierCode, invoice.invoiceNumber),
        previousPdfFilename: invoice.pdfFilename,
        method,
        resolvedViaNormalization: resolved.viaNormalization,
      });
    }

    console.log(`Ready to link ${linkPlans.length} invoice PDF(s)`);

    if (!options.dryRun && linkPlans.length > 0) {
      if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

      for (const plan of linkPlans) {
        const destPath = path.join(uploadsDir, plan.newPdfFilename);
        fs.copyFileSync(plan.sourcePath, destPath);
        copiedThisRun.push(destPath);
      }

      try {
        await db.transaction(async (tx) => {
          await tx.execute(sql`SET LOCAL statement_timeout = 0`);
          await tx.execute(sql`SET LOCAL idle_in_transaction_session_timeout = 0`);
          await tx.execute(sql`SET LOCAL erp.audit_skip = 'true'`);

          for (const plan of linkPlans) {
            await tx
              .update(schema.supplierInvoices)
              .set({ pdfFilename: plan.newPdfFilename })
              .where(eq(schema.supplierInvoices.id, plan.invoiceId));

            if (plan.previousPdfFilename && plan.previousPdfFilename !== plan.newPdfFilename) {
              previousFilesToDeleteAfterCommit.push(path.join(uploadsDir, path.basename(plan.previousPdfFilename)));
            }
          }
        });

        for (const oldPath of previousFilesToDeleteAfterCommit) {
          unlinkQuietly(oldPath);
        }

        summary.linked = linkPlans.length;
      } catch (error) {
        for (const copiedPath of copiedThisRun) {
          unlinkQuietly(copiedPath);
        }
        throw error;
      }
    } else if (options.dryRun) {
      summary.linked = 0;
      console.log(`Dry run would link ${linkPlans.length} invoice PDF(s).`);
    }

    console.log('\n========== INVOICE PDF SEED STATS ==========');
    console.log(`Workbook PDF rows loaded:            ${summary.workbookRowsLoaded}`);
    console.log(`Matched workbook → DB:               ${summary.matched}`);
    console.log(`Matched by invoice number:           ${summary.matchedByInvoice}`);
    console.log(`Matched by invoice + supplier:       ${summary.matchedByInvoiceAndSupplier}`);
    console.log(`Linked (copied + DB updated):        ${options.dryRun ? `(dry-run) ${linkPlans.length}` : summary.linked}`);
    console.log(`Skipped (already has pdf_filename):  ${summary.skippedAlreadyHasPdf}`);
    console.log(`Missing source PDF:                  ${summary.missingSourceFile}`);
    console.log(`Resolved via normalized filename:    ${summary.resolvedViaNormalization}`);
    console.log(`Unmatched in workbook (no DB):       ${summary.unmatchedInWorkbook}`);
    console.log(`Unmatched in DB (no workbook):       ${summary.unmatchedInDb}`);
    console.log(`Unresolved duplicate invoice rows:   ${summary.unresolvedDuplicates}`);

    if (options.dryRun && linkPlans.length > 0) {
      console.log('\n--- Sample link plans (first 10) ---');
      for (const plan of linkPlans.slice(0, 10)) {
        const via = plan.resolvedViaNormalization ? 'normalized' : 'exact';
        console.log(
          `  ${plan.supplierCode} | invoice=${plan.invoiceNumber} | ${plan.method} | ${via} | ${plan.sourceFileName} → ${plan.newPdfFilename}`,
        );
      }
      if (linkPlans.length > 10) console.log(`  ... and ${linkPlans.length - 10} more`);
    }

    const warnings = problems.filter((problem) => problem.level === 'warning');
    const errors = problems.filter((problem) => problem.level === 'error');

    if (warnings.length > 0) {
      console.log('\n--- Warnings ---');
      for (const problem of warnings) console.log(`  ${problem.message}`);
    }

    if (errors.length > 0) {
      console.log('\n--- Problems (not linked) ---');
      for (const problem of errors) console.log(`  ${problem.message}`);
    }

    console.log('============================================');
    console.log(options.dryRun ? 'Invoice PDF seed dry-run completed.' : 'Invoice PDF seed script completed.');
  } catch (error) {
    const err = error as Error & { cause?: { message?: string; detail?: string } };
    console.error(err.message);
    if (err.cause?.message) console.error(`Cause: ${err.cause.message}`);
    if (err.cause?.detail) console.error(`Detail: ${err.cause.detail}`);
    console.error('Seed failed; database changes from this run were rolled back and new copies were cleaned up when possible.');
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

void main();
