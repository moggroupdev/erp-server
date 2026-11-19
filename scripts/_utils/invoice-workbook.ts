/**
 * Shared helpers for reading data/invoices/totals.xlsx and matching rows
 * to supplier_invoices (by invoice number, then supplier name from filename).
 */

import * as path from 'path';

export const INVOICE_TOTALS_DATA_FILE = path.join(__dirname, '../../data/invoices/totals.xlsx');

export type InvoiceWorkbookRow = {
  sourceRowNumber: number;
  invoiceNumber: string;
  sourceFileName: string | null;
  supplierNameHint: string | null;
};

export type InvoiceMatchCandidate = {
  id: string;
  invoiceNumber: string;
  supplierName: string;
  orderCode?: string | null;
};

export type MatchMethod = 'invoice' | 'invoice+supplier';

export type InvoiceMatch<TRow extends InvoiceWorkbookRow = InvoiceWorkbookRow, TInvoice extends InvoiceMatchCandidate = InvoiceMatchCandidate> = {
  workbookRow: TRow;
  invoice: TInvoice;
  method: MatchMethod;
};

export type InvoiceMatchProblem = {
  level: 'warning' | 'error';
  message: string;
};

export function normalizeText(value: unknown): string {
  if (value == null) return '';
  return String(value).replace(/\s+/g, ' ').trim();
}

export function normalizeIdentifier(value: unknown): string {
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

/** Normalize Arabic spelling variants used when comparing supplier names or source filenames. */
export function normalizeSupplierName(value: unknown): string {
  return normalizeText(value)
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه');
}

export function extractSupplierFromFileName(fileName: string): string | null {
  const withoutExt = fileName.replace(/\.pdf$/i, '');
  const match = withoutExt.match(/^(.*?)(?:\s*ل?رقم\s*الفاتور[هة]?)/);
  const name = normalizeText(match?.[1]);
  return name || null;
}

export function supplierNamesMatch(left: string, right: string): boolean {
  const a = normalizeSupplierName(left);
  const b = normalizeSupplierName(right);
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}

export function resolveInvoicesBySupplier<TInvoice extends InvoiceMatchCandidate>(
  hint: string,
  candidates: TInvoice[],
): TInvoice[] {
  const exact = candidates.filter((invoice) => normalizeSupplierName(invoice.supplierName) === normalizeSupplierName(hint));
  if (exact.length > 0) return exact;
  return candidates.filter((invoice) => supplierNamesMatch(invoice.supplierName, hint));
}

export function findColumnIndex(header: unknown[], aliases: string[]): number {
  const normalizedAliases = new Set(aliases.map((alias) => normalizeText(alias)));

  for (let i = 0; i < header.length; i++) {
    const cell = normalizeText(header[i]);
    if (normalizedAliases.has(cell)) return i;
  }

  return -1;
}

export function formatWorkbookRow(row: InvoiceWorkbookRow): string {
  const supplier = row.supplierNameHint ?? '(no supplier in filename)';
  const fileName = row.sourceFileName ?? '(no filename)';
  return `invoice=${row.invoiceNumber} | supplier=${supplier} | row ${row.sourceRowNumber} | file=${fileName}`;
}

export function formatInvoice(invoice: InvoiceMatchCandidate): string {
  const orderLabel = invoice.orderCode ?? '(no MPO)';
  return `invoice=${invoice.invoiceNumber} | supplier=${invoice.supplierName} | ${orderLabel}`;
}

/**
 * Match workbook rows to DB invoices.
 * Unique invoice numbers match directly; duplicates are resolved by supplier name from اسم الملف.
 */
export function matchRowsToInvoices<TRow extends InvoiceWorkbookRow, TInvoice extends InvoiceMatchCandidate>(
  rows: TRow[],
  invoices: TInvoice[],
): { matches: InvoiceMatch<TRow, TInvoice>[]; problems: InvoiceMatchProblem[] } {
  const problems: InvoiceMatchProblem[] = [];
  const matches: InvoiceMatch<TRow, TInvoice>[] = [];

  const workbookByInvoice = new Map<string, TRow[]>();
  for (const row of rows) {
    const existing = workbookByInvoice.get(row.invoiceNumber);
    if (existing) existing.push(row);
    else workbookByInvoice.set(row.invoiceNumber, [row]);
  }

  const dbByInvoice = new Map<string, TInvoice[]>();
  for (const invoice of invoices) {
    const existing = dbByInvoice.get(invoice.invoiceNumber);
    if (existing) existing.push(invoice);
    else dbByInvoice.set(invoice.invoiceNumber, [invoice]);
  }

  const usedWorkbookRows = new Set<number>();
  const usedInvoiceIds = new Set<string>();

  for (const [invoiceNumber, workbookGroup] of workbookByInvoice) {
    const dbGroup = dbByInvoice.get(invoiceNumber) ?? [];

    if (workbookGroup.length === 1 && dbGroup.length === 1) {
      const workbookRow = workbookGroup[0];
      const invoice = dbGroup[0];
      matches.push({ workbookRow, invoice, method: 'invoice' });
      usedWorkbookRows.add(workbookRow.sourceRowNumber);
      usedInvoiceIds.add(invoice.id);

      if (workbookRow.supplierNameHint && !supplierNamesMatch(workbookRow.supplierNameHint, invoice.supplierName)) {
        problems.push({
          level: 'warning',
          message: `Invoice ${invoiceNumber} matched by number only, but filename supplier "${workbookRow.supplierNameHint}" does not match invoice supplier "${invoice.supplierName}" (${invoice.orderCode ?? invoice.id}, row ${workbookRow.sourceRowNumber}).`,
        });
      }
      continue;
    }

    const remainingWorkbook = workbookGroup.filter((row) => !usedWorkbookRows.has(row.sourceRowNumber));
    const remainingInvoices = dbGroup.filter((invoice) => !usedInvoiceIds.has(invoice.id));

    if (remainingWorkbook.length === 0 && remainingInvoices.length === 0) continue;

    const claimedInvoiceIds = new Set<string>();

    for (const workbookRow of remainingWorkbook) {
      if (!workbookRow.supplierNameHint) {
        problems.push({
          level: 'error',
          message: `Cannot resolve duplicate invoice ${invoiceNumber} without a supplier in اسم الملف (${formatWorkbookRow(workbookRow)}).`,
        });
        usedWorkbookRows.add(workbookRow.sourceRowNumber);
        continue;
      }

      const resolved = resolveInvoicesBySupplier(workbookRow.supplierNameHint, remainingInvoices);

      if (resolved.length === 0) {
        problems.push({
          level: 'error',
          message: `No supplier invoice for ${formatWorkbookRow(workbookRow)}. DB invoices with this number: ${
            remainingInvoices.length > 0 ? remainingInvoices.map((invoice) => invoice.supplierName).join(', ') : '(none)'
          }.`,
        });
        usedWorkbookRows.add(workbookRow.sourceRowNumber);
        continue;
      }

      if (resolved.length > 1) {
        problems.push({
          level: 'error',
          message: `Invoice ${invoiceNumber} + supplier "${workbookRow.supplierNameHint}" matches multiple supplier invoices: ${resolved
            .map((invoice) => invoice.orderCode ?? invoice.id)
            .join(', ')} (row ${workbookRow.sourceRowNumber}).`,
        });
        usedWorkbookRows.add(workbookRow.sourceRowNumber);
        continue;
      }

      const invoice = resolved[0];
      if (claimedInvoiceIds.has(invoice.id)) {
        problems.push({
          level: 'error',
          message: `Multiple workbook rows map to the same supplier invoice ${invoice.orderCode ?? invoice.id} for invoice ${invoiceNumber} / supplier "${invoice.supplierName}" (row ${workbookRow.sourceRowNumber}).`,
        });
        usedWorkbookRows.add(workbookRow.sourceRowNumber);
        continue;
      }

      claimedInvoiceIds.add(invoice.id);
      matches.push({ workbookRow, invoice, method: 'invoice+supplier' });
      usedWorkbookRows.add(workbookRow.sourceRowNumber);
      usedInvoiceIds.add(invoice.id);
    }
  }

  for (const row of rows) {
    if (!usedWorkbookRows.has(row.sourceRowNumber) && !matches.some((match) => match.workbookRow.sourceRowNumber === row.sourceRowNumber)) {
      problems.push({
        level: 'error',
        message: `Workbook row has no matching supplier invoice: ${formatWorkbookRow(row)}.`,
      });
    }
  }

  for (const invoice of invoices) {
    if (usedInvoiceIds.has(invoice.id)) continue;
    problems.push({
      level: 'error',
      message: `DB supplier invoice has no matching workbook row: ${formatInvoice(invoice)}.`,
    });
  }

  return { matches, problems };
}
