import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { parseArgs } from 'node:util';
import { stdin as input, stdout as output } from 'node:process';
import * as readline from 'node:readline/promises';
import * as schema from '../../src/database/schema';
import * as dotenv from 'dotenv';

dotenv.config();

const USAGE = `Usage: npm run delete:purchasing-inventory

Permanently deletes ALL rows from the material purchasing and inventory
transaction tables. All writes run in one database transaction. If any
delete or post-delete check fails, the entire run is rolled back.

This script requires three interactive confirmations. There is no --force flag.

Tables deleted (child rows first):
  inventory_transaction_items
  inventory_transactions
  material_purchase_receipt_items
  material_purchase_receipts
  material_purchase_order_item_contract_items   (required FK child)
  material_purchase_order_items
  material_purchase_orders

Also restarts the MPO / MPR / IVT code sequences to 1.

Options:
  -h, --help    Show this help`;

const CONFIRM_PHRASE = 'DELETE ALL';

const TARGET_TABLES = [
  { name: 'inventory_transaction_items', table: schema.inventoryTransactionItems },
  { name: 'inventory_transactions', table: schema.inventoryTransactions },
  { name: 'material_purchase_receipt_items', table: schema.materialPurchaseReceiptItems },
  { name: 'material_purchase_receipts', table: schema.materialPurchaseReceipts },
  { name: 'material_purchase_order_item_contract_items', table: schema.materialPurchaseOrderItemContractItems },
  { name: 'material_purchase_order_items', table: schema.materialPurchaseOrderItems },
  { name: 'material_purchase_orders', table: schema.materialPurchaseOrders },
] as const;

const CODE_SEQUENCES = [
  'inventory_transactions_code_seq',
  'material_purchase_receipts_code_seq',
  'material_purchase_orders_code_seq',
] as const;

type SeedClient = Pick<ReturnType<typeof drizzle<typeof schema>>, 'select' | 'delete' | 'execute'>;

function parseCliArgs() {
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

async function countRows(db: SeedClient): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};

  for (const target of TARGET_TABLES) {
    const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(target.table);
    counts[target.name] = toCount(row?.count);
  }

  return counts;
}

function printCounts(counts: Record<string, number>, title: string) {
  console.log(title);
  let total = 0;
  for (const target of TARGET_TABLES) {
    const count = counts[target.name] ?? 0;
    total += count;
    console.log(`  ${count.toString().padStart(8)}  ${target.name}`);
  }
  console.log(`  ${total.toString().padStart(8)}  TOTAL`);
  return total;
}

async function promptExact(rl: readline.Interface, prompt: string, expected: string): Promise<void> {
  const answer = (await rl.question(prompt)).trim();
  if (answer !== expected) {
    throw new Error(`Confirmation failed. Expected "${expected}", got "${answer || '(empty)'}". No rows were deleted.`);
  }
}

async function confirmDeletion(counts: Record<string, number>, databaseUrl: string, total: number) {
  const rl = readline.createInterface({ input, output });

  try {
    console.log('\n========== DELETE PURCHASING + INVENTORY ==========');
    console.log('This permanently deletes ALL rows in the tables below.');
    console.log('inventory_transactions includes every source type (receipt, issue, return).');
    console.log('material_purchase_order_item_contract_items is included because it references order items.');
    console.log('MPO / MPR / IVT code sequences will restart at 1.');
    console.log('materials.quantity and materials.unit_price are app-cached and will NOT be changed.');
    console.log(`Database: ${maskConnectionString(databaseUrl)}`);
    console.log('All deletes run in one transaction. A failure rolls back the entire run.\n');

    printCounts(counts, 'Step 1 of 3 — current row counts');

    if (total === 0) {
      console.log('\nNothing to delete. All target tables are already empty.');
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

async function deleteAllRows(tx: SeedClient, expected: Record<string, number>) {
  for (const target of TARGET_TABLES) {
    await tx.delete(target.table);
    console.log(`  deleted ${String(expected[target.name] ?? 0).padStart(8)}  ${target.name}`);
  }

  for (const sequence of CODE_SEQUENCES) {
    await tx.execute(sql.raw(`ALTER SEQUENCE ${sequence} RESTART WITH 1`));
    console.log(`  restarted sequence ${sequence}`);
  }
}

function assertEmpty(counts: Record<string, number>) {
  const leftover = TARGET_TABLES.filter((target) => (counts[target.name] ?? 0) > 0);
  if (leftover.length === 0) return;

  const details = leftover.map((target) => `  ${counts[target.name]} remaining in ${target.name}`).join('\n');
  throw new Error(`Post-delete verification failed; rolling back.\n${details}`);
}

async function main() {
  parseCliArgs();

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is not defined in .env');

  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle(pool, { schema });
  let transactionStarted = false;

  try {
    const before = await countRows(db);
    const total = Object.values(before).reduce((sum, count) => sum + count, 0);
    const confirmed = await confirmDeletion(before, databaseUrl, total);

    if (!confirmed) return;

    console.log('\nDeleting in one database transaction...');
    await db.transaction(async (tx) => {
      transactionStarted = true;
      await tx.execute(sql`SET LOCAL statement_timeout = 0`);
      await tx.execute(sql`SET LOCAL idle_in_transaction_session_timeout = 0`);

      await deleteAllRows(tx, before);

      const after = await countRows(tx);
      assertEmpty(after);
      printCounts(after, '\nPost-delete verification (inside transaction)');
    });

    console.log('\nDelete completed. All target tables are empty.');
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    if (transactionStarted) {
      console.error('Delete failed; all database changes from this run were rolled back.');
    }
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

void main();
