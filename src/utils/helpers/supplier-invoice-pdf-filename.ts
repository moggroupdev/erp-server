import { randomUUID } from 'crypto';

/** Sanitize a string for use as part of an on-disk invoice PDF filename. */
export function sanitizeInvoiceFilenamePart(value: string): string {
  const sanitized = value
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return (sanitized || 'invoice').slice(0, 80);
}

/** Build a unique PDF filename from a supplier code and invoice number (e.g. `SUP-00000012_INV-123_a1b2c3d4.pdf`). */
export function buildInvoicePdfFilename(supplierCode: string, invoiceNumber: string): string {
  return `${sanitizeInvoiceFilenamePart(supplierCode)}_${sanitizeInvoiceFilenamePart(invoiceNumber)}_${randomUUID().slice(0, 8)}.pdf`;
}

export const SUPPLIER_INVOICE_PDF_SUBDIRECTORY = 'supplier-invoices';
