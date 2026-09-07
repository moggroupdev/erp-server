import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { parseArgs } from 'node:util';
import { stdin as input, stdout as output } from 'node:process';
import * as readline from 'node:readline/promises';
import * as schema from '../../src/database/schema';
import * as dotenv from 'dotenv';

dotenv.config();

const USAGE = `Usage: npm run delete:purchasing-inventory -- [options]

Permanently deletes ALL rows from the material purchasing and inventory
transaction tables. Optionally also deletes all suppliers (and their
addresses / quotation emails). All writes run in one database transaction.
If any delete or post-delete check fails, the entire run is rolled back.

This script requires interactive confirmations. There is no --force flag.

Tables deleted (child rows first):
  inventory_transaction_items
  inventory_transactions
  material_purchase_receipt_items
  material_purchase_receipts
  material_purchase_order_item_contract_items   (required FK child)
  material_purchase_order_items
  material_purchase_orders

When --with-suppliers / interactive yes is chosen, also:
  supplier_quotation_emails
  supplier_addresses
  suppliers

Also restarts the MPO / MPR / IVT code sequences to 1.
With suppliers, also restarts suppliers_code_seq to 1.

Options:
  --with-suppliers     Also delete all suppliers (+ addresses, quotation emails)
  --no-suppliers       Keep suppliers (skip the interactive prompt)
  -h, --help           Show this help`;

const CONFIRM_PHRASE = 'DELETE ALL';

const PURCHASING_INVENTORY_TABLES = [
  { name: 'inventory_transaction_items', table: schema.inventoryTransactionItems },
  { name: 'inventory_transactions', table: schema.inventoryTransactions },
  { name: 'material_purchase_receipt_items', table: schema.materialPurchaseReceiptItems },
  { name: 'material_purchase_receipts', table: schema.materialPurchaseReceipts },
  { name: 'material_purchase_order_item_contract_items', table: schema.materialPurchaseOrderItemContractItems },
  { name: 'material_purchase_order_items', table: schema.materialPurchaseOrderItems },
  { name: 'material_purchase_orders', table: schema.materialPurchaseOrders },
] as const;

const SUPPLIER_TABLES = [
  { name: 'supplier_quotation_emails', table: schema.supplierQuotationEmails },
  { name: 'supplier_addresses', table: schema.supplierAddresses },
  { name: 'suppliers', table: schema.suppliers },
] as const;

const PURCHASING_INVENTORY_SEQUENCES = [
  'inventory_transactions_code_seq',
  'material_purchase_receipts_code_seq',
  'material_purchase_orders_code_seq',
] as const;

const SUPPLIER_SEQUENCES = ['suppliers_code_seq'] as const;

/** Tables that reference suppliers and are NOT cleared by this script. */
const SUPPLIER_BLOCKING_TABLES = [
  { name: 'product_purchase_orders', table: schema.productPurchaseOrders },
  { name: 'outsourcing_orders', table: schema.outsourcingOrders },
] as const;

type TargetTable = (typeof PURCHASING_INVENTORY_TABLES)[number] | (typeof SUPPLIER_TABLES)[number];
type SeedClient = Pick<ReturnType<typeof drizzle<typeof schema>>, 'select' | 'delete' | 'execute'>;

type CliOptions = {
  withSuppliers: boolean | undefined;
};

function parseCliArgs(): CliOptions {
  try {
    const { values } = parseArgs({
      options: {
        help: { type: 'boolean', short: 'h' },
        'with-suppliers': { type: 'boolean' },
        'no-suppliers': { type: 'boolean' },
      },
      allowPositionals: false,
    });

    if (values.help) {
      console.log(USAGE);
      process.exit(0);
    }

    if (values['with-suppliers'] && values['no-suppliers']) {
      throw new Error('Use either --with-suppliers or --no-suppliers, not both.');
    }

    let withSuppliers: boolean | undefined;
    if (values['with-suppliers'] === true) withSuppliers = true;
    else if (values['no-suppliers'] === true) withSuppliers = false;

    return { withSuppliers };
  } catch (e) {
    if (e instanceof Error && e.message.includes('--with-suppliers')) {
      console.error(e.message);
    } else {
      console.error(USAGE);
    }
    process.exit(1);
  }
}

function targetTables(withSuppliers: boolean): TargetTable[] {
  return withSuppliers
    ? [...PURCHASING_INVENTORY_TABLES, ...SUPPLIER_TABLES]
    : [...PURCHASING_INVENTORY_TABLES];
}

function targetSequences(withSuppliers: boolean): readonly string[] {
  return withSuppliers
    ? [...PURCHASING_INVENTORY_SEQUENCES, ...SUPPLIER_SEQUENCES]
    : PURCHASING_INVENTORY_SEQUENCES;
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

async function countRows(db: SeedClient, tables: readonly TargetTable[]): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};

  for (const target of tables) {
    const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(target.table);
    counts[target.name] = toCount(row?.count);
  }

  return counts;
}

function printCounts(counts: Record<string, number>, tables: readonly TargetTable[], title: string) {
  console.log(title);
  let total = 0;
  for (const target of tables) {
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

async function resolveWithSuppliers(cliChoice: boolean | undefined): Promise<boolean> {
  if (cliChoice !== undefined) return cliChoice;

  const rl = readline.createInterface({ input, output });
  try {
    console.log('\nAlso delete ALL suppliers (plus addresses and quotation emails)?');
    console.log('Type "yes" to include suppliers, or "no" to keep them.');
    const answer = (await rl.question('Delete suppliers? [yes/no]: ')).trim().toLowerCase();
    if (answer === 'yes') return true;
    if (answer === 'no') return false;
    throw new Error(`Expected "yes" or "no", got "${answer || '(empty)'}". No rows were deleted.`);
  } finally {
    rl.close();
  }
}

async function assertNoBlockingSupplierRefs(db: SeedClient) {
  const blockers: string[] = [];

  for (const target of SUPPLIER_BLOCKING_TABLES) {
    const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(target.table);
    const count = toCount(row?.count);
    if (count > 0) blockers.push(`  ${count} row(s) in ${target.name}`);
  }

  if (blockers.length === 0) return;

  throw new Error(
    [
      'Cannot delete suppliers while other order tables still reference them.',
      'Clear or remove these first, then re-run with --with-suppliers:',
      ...blockers,
    ].join('\n'),
  );
}

async function confirmDeletion(
  counts: Record<string, number>,
  tables: readonly TargetTable[],
  databaseUrl: string,
  total: number,
  withSuppliers: boolean,
) {
  const rl = readline.createInterface({ input, output });

  try {
    console.log('\n========== DELETE PURCHASING + INVENTORY ==========');
    console.log('This permanently deletes ALL rows in the tables below.');
    console.log('inventory_transactions includes every source type (receipt, issue, return).');
    console.log('material_purchase_order_item_contract_items is included because it references order items.');
    console.log('MPO / MPR / IVT code sequences will restart at 1.');
    if (withSuppliers) {
      console.log('Suppliers ARE included: supplier_quotation_emails, supplier_addresses, suppliers.');
      console.log('suppliers_code_seq will also restart at 1.');
    } else {
      console.log('Suppliers are NOT included (kept intact).');
    }
    console.log('materials.quantity and materials.unit_price are app-cached and will NOT be changed.');
    console.log(`Database: ${maskConnectionString(databaseUrl)}`);
    console.log('All deletes run in one transaction. A failure rolls back the entire run.\n');

    printCounts(counts, tables, 'Step 1 of 3 — current row counts');

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

async function deleteAllRows(
  tx: SeedClient,
  tables: readonly TargetTable[],
  sequences: readonly string[],
  expected: Record<string, number>,
) {
  for (const target of tables) {
    await tx.delete(target.table);
    console.log(`  deleted ${String(expected[target.name] ?? 0).padStart(8)}  ${target.name}`);
  }

  for (const sequence of sequences) {
    await tx.execute(sql.raw(`ALTER SEQUENCE ${sequence} RESTART WITH 1`));
    console.log(`  restarted sequence ${sequence}`);
  }
}

function assertEmpty(counts: Record<string, number>, tables: readonly TargetTable[]) {
  const leftover = tables.filter((target) => (counts[target.name] ?? 0) > 0);
  if (leftover.length === 0) return;

  const details = leftover.map((target) => `  ${counts[target.name]} remaining in ${target.name}`).join('\n');
  throw new Error(`Post-delete verification failed; rolling back.\n${details}`);
}

async function main() {
  const cli = parseCliArgs();

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is not defined in .env');

  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle(pool, { schema });
  let transactionStarted = false;

  try {
    const withSuppliers = await resolveWithSuppliers(cli.withSuppliers);
    const tables = targetTables(withSuppliers);
    const sequences = targetSequences(withSuppliers);

    if (withSuppliers) {
      await assertNoBlockingSupplierRefs(db);
    }

    const before = await countRows(db, tables);
    const total = Object.values(before).reduce((sum, count) => sum + count, 0);
    const confirmed = await confirmDeletion(before, tables, databaseUrl, total, withSuppliers);

    if (!confirmed) return;

    console.log('\nDeleting in one database transaction...');
    await db.transaction(async (tx) => {
      transactionStarted = true;
      await tx.execute(sql`SET LOCAL statement_timeout = 0`);
      await tx.execute(sql`SET LOCAL idle_in_transaction_session_timeout = 0`);

      await deleteAllRows(tx, tables, sequences, before);

      const after = await countRows(tx, tables);
      assertEmpty(after, tables);
      printCounts(after, tables, '\nPost-delete verification (inside transaction)');
    });

    console.log(
      withSuppliers
        ? '\nDelete completed. Purchasing, inventory, and supplier tables are empty.'
        : '\nDelete completed. Purchasing and inventory tables are empty. Suppliers were kept.',
    );
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
