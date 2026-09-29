import { and, eq, inArray, lt, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { parseArgs } from 'node:util';
import { stdin as input, stdout as output } from 'node:process';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'node:readline/promises';
import * as schema from '../../src/database/schema';
import * as dotenv from 'dotenv';
import { PURCHASING_RESEED_CUTOFF, SEED_IMPORT_NOTE } from '../_utils/seed-constants';

dotenv.config();

const USAGE = `Usage: npm run delete:seeded-purchasing-before-cutoff -- [options]

Deletes seeded material purchase orders dated before the cutoff, plus every
child row under those MPOs (items, contract/requisition links, invoices,
receipts, inventory transactions). Uploaded invoice PDFs are removed from
disk after a successful commit.

Run this script from the erp-server/ directory so uploads resolve correctly
(uploads/supplier-invoices/).

Selection:
  material_purchase_orders where created_at < CUTOFF AND notes = SEED_IMPORT_NOTE

Cutoff (Cairo / UTC+3): ${PURCHASING_RESEED_CUTOFF.toISOString()}
Seed note: ${SEED_IMPORT_NOTE}

Child tables deleted (regardless of their own notes/dates):
  inventory_transaction_items
  inventory_transactions
  material_purchase_receipt_items
  material_purchase_receipts
  material_purchase_order_item_contract_items
  material_purchase_order_item_requisition_items
  supplier_invoices (+ PDF files under uploads/supplier-invoices/)
  material_purchase_order_items
  material_purchase_orders

Requisitions themselves (MPReq + items) are kept; only allocation links are removed.
Code sequences are NOT restarted.

All deletes run in one database transaction. If any delete or post-delete
check fails, the entire run is rolled back. PDF files are deleted only after
commit succeeds.

This script requires interactive confirmations. There is no --force flag.

Options:
  -h, --help  Show this help`;

const CONFIRM_PHRASE = 'DELETE SEEDED BEFORE CUTOFF';
const INVOICE_PDF_SUBDIRECTORY = 'supplier-invoices';

type CountTarget = { name: string; count: number };

type SeedClient = Pick<ReturnType<typeof drizzle<typeof schema>>, 'select' | 'delete' | 'execute'>;

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

function maskConnectionString(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.password) parsed.password = '****';
    return parsed.toString();
  } catch {
    return '[invalid DATABASE_URL]';
  }
}

function toCount(value: unknown): number {
  const count = Number(value);
  if (!Number.isFinite(count)) throw new Error(`Could not parse row count: ${String(value)}`);
  return count;
}

function formatCutoff(date: Date): string {
  return `${date.toISOString()} (${date.toLocaleString('en-GB', { timeZone: 'Africa/Cairo' })} Cairo)`;
}

async function promptExact(rl: readline.Interface, prompt: string, expected: string): Promise<void> {
  const answer = (await rl.question(prompt)).trim();
  if (answer !== expected) {
    throw new Error(`Confirmation failed. Expected "${expected}", got "${answer || '(empty)'}". No rows were deleted.`);
  }
}

function printCounts(targets: CountTarget[], title: string): number {
  console.log(title);
  let total = 0;
  for (const target of targets) {
    total += target.count;
    console.log(`  ${target.count.toString().padStart(8)}  ${target.name}`);
  }
  console.log(`  ${total.toString().padStart(8)}  TOTAL`);
  return total;
}

function invoicePdfDir(): string {
  return path.join(process.cwd(), 'uploads', INVOICE_PDF_SUBDIRECTORY);
}

function deleteInvoicePdf(filename: string): 'deleted' | 'missing' | 'failed' {
  const safeName = path.basename(filename.trim());
  if (!safeName || safeName === '.' || safeName === '..') return 'failed';

  const filepath = path.join(invoicePdfDir(), safeName);
  if (!fs.existsSync(filepath)) return 'missing';

  try {
    fs.unlinkSync(filepath);
    return 'deleted';
  } catch {
    return 'failed';
  }
}

async function loadTargetMpoIds(db: SeedClient): Promise<string[]> {
  const rows = await db
    .select({ id: schema.materialPurchaseOrders.id })
    .from(schema.materialPurchaseOrders)
    .where(
      and(
        lt(schema.materialPurchaseOrders.createdAt, PURCHASING_RESEED_CUTOFF),
        eq(schema.materialPurchaseOrders.notes, SEED_IMPORT_NOTE),
      ),
    );

  return rows.map((row) => row.id);
}

async function countMatching(query: Promise<{ count: number }[]>): Promise<number> {
  const [row] = await query;
  return toCount(row?.count);
}

async function countChildRows(db: SeedClient, mpoIds: string[]): Promise<CountTarget[]> {
  const zero = [
    { name: 'inventory_transaction_items', count: 0 },
    { name: 'inventory_transactions', count: 0 },
    { name: 'material_purchase_receipt_items', count: 0 },
    { name: 'material_purchase_receipts', count: 0 },
    { name: 'material_purchase_order_item_contract_items', count: 0 },
    { name: 'material_purchase_order_item_requisition_items', count: 0 },
    { name: 'supplier_invoices', count: 0 },
    { name: 'material_purchase_order_items', count: 0 },
    { name: 'material_purchase_orders', count: 0 },
  ];
  if (mpoIds.length === 0) return zero;

  const receiptIds = (
    await db
      .select({ id: schema.materialPurchaseReceipts.id })
      .from(schema.materialPurchaseReceipts)
      .where(inArray(schema.materialPurchaseReceipts.materialPurchaseOrderId, mpoIds))
  ).map((row) => row.id);

  const orderItemIds = (
    await db
      .select({ id: schema.materialPurchaseOrderItems.id })
      .from(schema.materialPurchaseOrderItems)
      .where(inArray(schema.materialPurchaseOrderItems.materialPurchaseOrderId, mpoIds))
  ).map((row) => row.id);

  const transactionIds =
    receiptIds.length === 0
      ? []
      : (
          await db
            .select({ id: schema.inventoryTransactions.id })
            .from(schema.inventoryTransactions)
            .where(inArray(schema.inventoryTransactions.materialPurchaseReceiptId, receiptIds))
        ).map((row) => row.id);

  const inventoryTransactionItems =
    transactionIds.length === 0
      ? 0
      : await countMatching(
          db
            .select({ count: sql<number>`count(*)::int` })
            .from(schema.inventoryTransactionItems)
            .where(inArray(schema.inventoryTransactionItems.transactionId, transactionIds)),
        );

  const inventoryTransactions =
    transactionIds.length === 0
      ? 0
      : await countMatching(
          db
            .select({ count: sql<number>`count(*)::int` })
            .from(schema.inventoryTransactions)
            .where(inArray(schema.inventoryTransactions.id, transactionIds)),
        );

  const materialPurchaseReceiptItems =
    receiptIds.length === 0
      ? 0
      : await countMatching(
          db
            .select({ count: sql<number>`count(*)::int` })
            .from(schema.materialPurchaseReceiptItems)
            .where(inArray(schema.materialPurchaseReceiptItems.materialPurchaseReceiptId, receiptIds)),
        );

  const materialPurchaseReceipts = await countMatching(
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.materialPurchaseReceipts)
      .where(inArray(schema.materialPurchaseReceipts.materialPurchaseOrderId, mpoIds)),
  );

  const materialPurchaseOrderItemContractItems =
    orderItemIds.length === 0
      ? 0
      : await countMatching(
          db
            .select({ count: sql<number>`count(*)::int` })
            .from(schema.materialPurchaseOrderItemContractItems)
            .where(inArray(schema.materialPurchaseOrderItemContractItems.materialPurchaseOrderItemId, orderItemIds)),
        );

  const materialPurchaseOrderItemRequisitionItems =
    orderItemIds.length === 0
      ? 0
      : await countMatching(
          db
            .select({ count: sql<number>`count(*)::int` })
            .from(schema.materialPurchaseOrderItemRequisitionItems)
            .where(
              inArray(schema.materialPurchaseOrderItemRequisitionItems.materialPurchaseOrderItemId, orderItemIds),
            ),
        );

  const supplierInvoices = await countMatching(
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.supplierInvoices)
      .where(inArray(schema.supplierInvoices.materialPurchaseOrderId, mpoIds)),
  );

  const materialPurchaseOrderItems = await countMatching(
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.materialPurchaseOrderItems)
      .where(inArray(schema.materialPurchaseOrderItems.materialPurchaseOrderId, mpoIds)),
  );

  const materialPurchaseOrders = await countMatching(
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.materialPurchaseOrders)
      .where(inArray(schema.materialPurchaseOrders.id, mpoIds)),
  );

  return [
    { name: 'inventory_transaction_items', count: inventoryTransactionItems },
    { name: 'inventory_transactions', count: inventoryTransactions },
    { name: 'material_purchase_receipt_items', count: materialPurchaseReceiptItems },
    { name: 'material_purchase_receipts', count: materialPurchaseReceipts },
    { name: 'material_purchase_order_item_contract_items', count: materialPurchaseOrderItemContractItems },
    { name: 'material_purchase_order_item_requisition_items', count: materialPurchaseOrderItemRequisitionItems },
    { name: 'supplier_invoices', count: supplierInvoices },
    { name: 'material_purchase_order_items', count: materialPurchaseOrderItems },
    { name: 'material_purchase_orders', count: materialPurchaseOrders },
  ];
}

async function confirmDeletion(
  counts: CountTarget[],
  databaseUrl: string,
  total: number,
  mpoCount: number,
): Promise<boolean> {
  const rl = readline.createInterface({ input, output });

  try {
    console.log('\n========== DELETE SEEDED PURCHASING BEFORE CUTOFF ==========');
    console.log('This permanently deletes seeded MPOs before the cutoff and ALL their children.');
    console.log(`Cutoff: ${formatCutoff(PURCHASING_RESEED_CUTOFF)}`);
    console.log(`Seed note filter: ${SEED_IMPORT_NOTE}`);
    console.log(`Target MPOs: ${mpoCount}`);
    console.log('Requisitions themselves are kept; only MPO↔requisition links are removed.');
    console.log('Code sequences are NOT restarted.');
    console.log('Invoice PDFs under uploads/supplier-invoices/ are deleted after a successful commit.');
    console.log(`Database: ${maskConnectionString(databaseUrl)}`);
    console.log('All deletes run in one transaction. A failure rolls back the entire run.\n');

    printCounts(counts, 'Step 1 of 3 — current row counts for target trees');

    if (total === 0) {
      console.log('\nNothing to delete. No seeded MPOs match the cutoff.');
      return false;
    }

    await promptExact(rl, '\nType "continue" to review the delete plan: ', 'continue');

    console.log('\nStep 2 of 3 — type the exact phrase to confirm deletion.');
    console.log(`Phrase: ${CONFIRM_PHRASE}`);
    await promptExact(rl, `Type ${CONFIRM_PHRASE}: `, CONFIRM_PHRASE);

    console.log(`\nStep 3 of 3 — type the TOTAL row count shown above (${total}).`);
    await promptExact(rl, `Type ${total}: `, String(total));

    return true;
  } finally {
    rl.close();
  }
}

async function deleteTargetTrees(tx: SeedClient, mpoIds: string[]): Promise<string[]> {
  const receiptIds = (
    await tx
      .select({ id: schema.materialPurchaseReceipts.id })
      .from(schema.materialPurchaseReceipts)
      .where(inArray(schema.materialPurchaseReceipts.materialPurchaseOrderId, mpoIds))
  ).map((row) => row.id);

  const orderItemIds = (
    await tx
      .select({ id: schema.materialPurchaseOrderItems.id })
      .from(schema.materialPurchaseOrderItems)
      .where(inArray(schema.materialPurchaseOrderItems.materialPurchaseOrderId, mpoIds))
  ).map((row) => row.id);

  const transactionIds =
    receiptIds.length === 0
      ? []
      : (
          await tx
            .select({ id: schema.inventoryTransactions.id })
            .from(schema.inventoryTransactions)
            .where(inArray(schema.inventoryTransactions.materialPurchaseReceiptId, receiptIds))
        ).map((row) => row.id);

  if (transactionIds.length > 0) {
    const deletedItems = await tx
      .delete(schema.inventoryTransactionItems)
      .where(inArray(schema.inventoryTransactionItems.transactionId, transactionIds))
      .returning({ id: schema.inventoryTransactionItems.id });
    console.log(`  deleted ${String(deletedItems.length).padStart(8)}  inventory_transaction_items`);

    const deletedTx = await tx
      .delete(schema.inventoryTransactions)
      .where(inArray(schema.inventoryTransactions.id, transactionIds))
      .returning({ id: schema.inventoryTransactions.id });
    console.log(`  deleted ${String(deletedTx.length).padStart(8)}  inventory_transactions`);
  } else {
    console.log(`  deleted ${String(0).padStart(8)}  inventory_transaction_items`);
    console.log(`  deleted ${String(0).padStart(8)}  inventory_transactions`);
  }

  if (receiptIds.length > 0) {
    const deletedReceiptItems = await tx
      .delete(schema.materialPurchaseReceiptItems)
      .where(inArray(schema.materialPurchaseReceiptItems.materialPurchaseReceiptId, receiptIds))
      .returning({ id: schema.materialPurchaseReceiptItems.id });
    console.log(`  deleted ${String(deletedReceiptItems.length).padStart(8)}  material_purchase_receipt_items`);

    const deletedReceipts = await tx
      .delete(schema.materialPurchaseReceipts)
      .where(inArray(schema.materialPurchaseReceipts.id, receiptIds))
      .returning({ id: schema.materialPurchaseReceipts.id });
    console.log(`  deleted ${String(deletedReceipts.length).padStart(8)}  material_purchase_receipts`);
  } else {
    console.log(`  deleted ${String(0).padStart(8)}  material_purchase_receipt_items`);
    console.log(`  deleted ${String(0).padStart(8)}  material_purchase_receipts`);
  }

  if (orderItemIds.length > 0) {
    const deletedContractLinks = await tx
      .delete(schema.materialPurchaseOrderItemContractItems)
      .where(inArray(schema.materialPurchaseOrderItemContractItems.materialPurchaseOrderItemId, orderItemIds))
      .returning({ id: schema.materialPurchaseOrderItemContractItems.id });
    console.log(
      `  deleted ${String(deletedContractLinks.length).padStart(8)}  material_purchase_order_item_contract_items`,
    );

    const deletedRequisitionLinks = await tx
      .delete(schema.materialPurchaseOrderItemRequisitionItems)
      .where(inArray(schema.materialPurchaseOrderItemRequisitionItems.materialPurchaseOrderItemId, orderItemIds))
      .returning({ id: schema.materialPurchaseOrderItemRequisitionItems.id });
    console.log(
      `  deleted ${String(deletedRequisitionLinks.length).padStart(8)}  material_purchase_order_item_requisition_items`,
    );
  } else {
    console.log(`  deleted ${String(0).padStart(8)}  material_purchase_order_item_contract_items`);
    console.log(`  deleted ${String(0).padStart(8)}  material_purchase_order_item_requisition_items`);
  }

  const deletedInvoices = await tx
    .delete(schema.supplierInvoices)
    .where(inArray(schema.supplierInvoices.materialPurchaseOrderId, mpoIds))
    .returning({
      id: schema.supplierInvoices.id,
      pdfFilename: schema.supplierInvoices.pdfFilename,
    });
  console.log(`  deleted ${String(deletedInvoices.length).padStart(8)}  supplier_invoices`);

  if (orderItemIds.length > 0) {
    const deletedOrderItems = await tx
      .delete(schema.materialPurchaseOrderItems)
      .where(inArray(schema.materialPurchaseOrderItems.id, orderItemIds))
      .returning({ id: schema.materialPurchaseOrderItems.id });
    console.log(`  deleted ${String(deletedOrderItems.length).padStart(8)}  material_purchase_order_items`);
  } else {
    console.log(`  deleted ${String(0).padStart(8)}  material_purchase_order_items`);
  }

  const deletedOrders = await tx
    .delete(schema.materialPurchaseOrders)
    .where(inArray(schema.materialPurchaseOrders.id, mpoIds))
    .returning({ id: schema.materialPurchaseOrders.id });
  console.log(`  deleted ${String(deletedOrders.length).padStart(8)}  material_purchase_orders`);

  return deletedInvoices.map((invoice) => invoice.pdfFilename).filter((name): name is string => Boolean(name));
}

function assertEmpty(counts: CountTarget[]) {
  const leftover = counts.filter((target) => target.count > 0);
  if (leftover.length === 0) return;

  const details = leftover.map((target) => `  ${target.count} remaining in ${target.name}`).join('\n');
  throw new Error(`Post-delete verification failed; rolling back.\n${details}`);
}

async function main() {
  parseCliArgs();

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is not defined in .env');

  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle(pool, { schema });
  let transactionStarted = false;
  let pdfFilenames: string[] = [];

  try {
    const mpoIds = await loadTargetMpoIds(db);
    const before = await countChildRows(db, mpoIds);
    const total = before.reduce((sum, target) => sum + target.count, 0);

    const confirmed = await confirmDeletion(before, databaseUrl, total, mpoIds.length);
    if (!confirmed) return;

    console.log('\nDeleting in one database transaction...');
    await db.transaction(async (tx) => {
      transactionStarted = true;
      await tx.execute(sql`SET LOCAL statement_timeout = 0`);
      await tx.execute(sql`SET LOCAL idle_in_transaction_session_timeout = 0`);

      pdfFilenames = await deleteTargetTrees(tx, mpoIds);

      const after = await countChildRows(tx, mpoIds);
      assertEmpty(after);
      printCounts(after, '\nPost-delete verification (inside transaction)');
    });

    console.log('\nDeleting invoice PDF files from disk (best-effort)...');
    let deleted = 0;
    let missing = 0;
    let failed = 0;
    for (const filename of pdfFilenames) {
      const result = deleteInvoicePdf(filename);
      if (result === 'deleted') {
        deleted++;
        console.log(`  deleted  ${filename}`);
      } else if (result === 'missing') {
        missing++;
        console.log(`  missing  ${filename}`);
      } else {
        failed++;
        console.log(`  failed   ${filename}`);
      }
    }
    console.log(`PDF summary: deleted=${deleted}, missing=${missing}, failed=${failed}`);

    console.log(
      `\nDelete completed. Removed ${mpoIds.length} seeded MPO tree(s) before ${formatCutoff(PURCHASING_RESEED_CUTOFF)}.`,
    );
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    if (transactionStarted) {
      console.error('Delete failed; all database changes from this run were rolled back.');
      console.error('No invoice PDF files were deleted from disk.');
    }
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

void main();
