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
transaction tables. Optionally also deletes all material purchase
requisitions (and their items), and/or all suppliers (and their
addresses, contacts, quotation emails, and RFQ quotations). All writes
run in one database transaction. If any delete or post-delete check fails,
the entire run is rolled back.

This script requires interactive confirmations. There is no --force flag.

Tables deleted (child rows first):
  inventory_transaction_items
  inventory_transactions
  material_purchase_receipt_items
  material_purchase_receipts
  supplier_invoices
  material_purchase_order_item_requisition_items   (required FK child)
  material_purchase_order_items
  material_purchase_order_payment_terms            (required FK child)
  material_purchase_orders

When --with-requisitions / interactive yes is chosen, also:
  material_purchase_requisition_item_contract_items
  material_purchase_requisition_items
  material_purchase_requisitions

When --with-suppliers / interactive yes is chosen, also:
  supplier_quotation_items                         (required FK child)
  supplier_quotations
  supplier_quotation_emails
  supplier_contact_persons
  supplier_addresses
  suppliers

Always restarts the MPO / MPR / IVT code sequences to 1 after deletes
(so the next insert is MPO-00000001 / MPR-00000001 / IVT-00000001).
If target tables are already empty, the script still offers a sequences-only reset.
With requisitions, also restarts material_purchase_requisitions_code_seq to 1.
With suppliers, also restarts suppliers_code_seq to 1.

Options:
  --with-requisitions  Also delete all material purchase requisitions (+ items)
  --no-requisitions    Keep requisitions (skip the interactive prompt)
  --with-suppliers     Also delete all suppliers (+ contacts, addresses, quotations)
  --no-suppliers       Keep suppliers (skip the interactive prompt)
  -h, --help           Show this help`;

const CONFIRM_PHRASE = 'DELETE ALL';

const PURCHASING_INVENTORY_TABLES = [
  { name: 'inventory_transaction_items', table: schema.inventoryTransactionItems },
  { name: 'inventory_transactions', table: schema.inventoryTransactions },
  { name: 'material_purchase_receipt_items', table: schema.materialPurchaseReceiptItems },
  { name: 'material_purchase_receipts', table: schema.materialPurchaseReceipts },
  { name: 'supplier_invoices', table: schema.supplierInvoices },
  { name: 'material_purchase_order_item_requisition_items', table: schema.materialPurchaseOrderItemRequisitionItems },
  { name: 'material_purchase_order_items', table: schema.materialPurchaseOrderItems },
  { name: 'material_purchase_order_payment_terms', table: schema.materialPurchaseOrderPaymentTerms },
  { name: 'material_purchase_orders', table: schema.materialPurchaseOrders },
] as const;

const REQUISITION_TABLES = [
  { name: 'material_purchase_requisition_item_contract_items', table: schema.materialPurchaseRequisitionItemContractItems },
  { name: 'material_purchase_requisition_items', table: schema.materialPurchaseRequisitionItems },
  { name: 'material_purchase_requisitions', table: schema.materialPurchaseRequisitions },
] as const;

const SUPPLIER_TABLES = [
  { name: 'supplier_quotation_items', table: schema.supplierQuotationItems },
  { name: 'supplier_quotations', table: schema.supplierQuotations },
  { name: 'supplier_quotation_emails', table: schema.supplierQuotationEmails },
  { name: 'supplier_contact_persons', table: schema.supplierContactPersons },
  { name: 'supplier_addresses', table: schema.supplierAddresses },
  { name: 'suppliers', table: schema.suppliers },
] as const;

const PURCHASING_INVENTORY_SEQUENCES = [
  'inventory_transactions_code_seq',
  'material_purchase_receipts_code_seq',
  'material_purchase_orders_code_seq',
] as const;

const REQUISITION_SEQUENCES = ['material_purchase_requisitions_code_seq'] as const;
const SUPPLIER_SEQUENCES = ['suppliers_code_seq'] as const;

/** Tables that reference suppliers and are NOT cleared by this script. */
const SUPPLIER_BLOCKING_TABLES = [
  { name: 'product_purchase_orders', table: schema.productPurchaseOrders },
  { name: 'outsourcing_orders', table: schema.outsourcingOrders },
] as const;

type TargetTable =
  | (typeof PURCHASING_INVENTORY_TABLES)[number]
  | (typeof REQUISITION_TABLES)[number]
  | (typeof SUPPLIER_TABLES)[number];
type SeedClient = Pick<ReturnType<typeof drizzle<typeof schema>>, 'select' | 'delete' | 'execute'>;

type CliOptions = {
  withRequisitions: boolean | undefined;
  withSuppliers: boolean | undefined;
};

function parseCliArgs(): CliOptions {
  try {
    const { values } = parseArgs({
      options: {
        help: { type: 'boolean', short: 'h' },
        'with-requisitions': { type: 'boolean' },
        'no-requisitions': { type: 'boolean' },
        'with-suppliers': { type: 'boolean' },
        'no-suppliers': { type: 'boolean' },
      },
      allowPositionals: false,
    });

    if (values.help) {
      console.log(USAGE);
      process.exit(0);
    }

    if (values['with-requisitions'] && values['no-requisitions']) {
      throw new Error('Use either --with-requisitions or --no-requisitions, not both.');
    }

    if (values['with-suppliers'] && values['no-suppliers']) {
      throw new Error('Use either --with-suppliers or --no-suppliers, not both.');
    }

    let withRequisitions: boolean | undefined;
    if (values['with-requisitions'] === true) withRequisitions = true;
    else if (values['no-requisitions'] === true) withRequisitions = false;

    let withSuppliers: boolean | undefined;
    if (values['with-suppliers'] === true) withSuppliers = true;
    else if (values['no-suppliers'] === true) withSuppliers = false;

    return { withRequisitions, withSuppliers };
  } catch (e) {
    if (
      e instanceof Error &&
      (e.message.includes('--with-suppliers') || e.message.includes('--with-requisitions'))
    ) {
      console.error(e.message);
    } else {
      console.error(USAGE);
    }
    process.exit(1);
  }
}

function targetTables(withRequisitions: boolean, withSuppliers: boolean): TargetTable[] {
  return [
    ...PURCHASING_INVENTORY_TABLES,
    ...(withRequisitions ? REQUISITION_TABLES : []),
    ...(withSuppliers ? SUPPLIER_TABLES : []),
  ];
}

function targetSequences(withRequisitions: boolean, withSuppliers: boolean): readonly string[] {
  return [
    ...PURCHASING_INVENTORY_SEQUENCES,
    ...(withRequisitions ? REQUISITION_SEQUENCES : []),
    ...(withSuppliers ? SUPPLIER_SEQUENCES : []),
  ];
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

async function resolveYesNo(
  cliChoice: boolean | undefined,
  {
    intro,
    prompt,
  }: {
    intro: string[];
    prompt: string;
  },
): Promise<boolean> {
  if (cliChoice !== undefined) return cliChoice;

  const rl = readline.createInterface({ input, output });
  try {
    console.log('');
    for (const line of intro) console.log(line);
    const answer = (await rl.question(prompt)).trim().toLowerCase();
    if (answer === 'yes') return true;
    if (answer === 'no') return false;
    throw new Error(`Expected "yes" or "no", got "${answer || '(empty)'}". No rows were deleted.`);
  } finally {
    rl.close();
  }
}

async function resolveWithRequisitions(cliChoice: boolean | undefined): Promise<boolean> {
  return resolveYesNo(cliChoice, {
    intro: [
      'Also delete ALL material purchase requisitions (plus items)?',
      'Type "yes" to include requisitions, or "no" to keep them.',
      'Note: MPO↔requisition allocation rows are always cleared with purchase orders.',
    ],
    prompt: 'Delete material purchase requisitions? [yes/no]: ',
  });
}

async function resolveWithSuppliers(cliChoice: boolean | undefined): Promise<boolean> {
  return resolveYesNo(cliChoice, {
    intro: [
      'Also delete ALL suppliers (plus contacts, addresses, quotation emails, and RFQ quotations)?',
      'Type "yes" to include suppliers, or "no" to keep them.',
      'Note: request_for_quotations headers are kept; only supplier-linked quotation rows are cleared.',
    ],
    prompt: 'Delete suppliers? [yes/no]: ',
  });
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
  withRequisitions: boolean,
  withSuppliers: boolean,
) {
  const rl = readline.createInterface({ input, output });

  try {
    console.log('\n========== DELETE PURCHASING + INVENTORY ==========');
    console.log('This permanently deletes ALL rows in the tables below.');
    console.log('inventory_transactions includes every source type (receipt, issue, return).');
    console.log('material_purchase_order_item_requisition_items is included because it references order items.');
    console.log('MPO / MPR / IVT code sequences will restart at 1.');
    if (withRequisitions) {
      console.log(
        'Requisitions ARE included: material_purchase_requisition_item_contract_items, material_purchase_requisition_items, material_purchase_requisitions.',
      );
      console.log('material_purchase_requisitions_code_seq will also restart at 1.');
    } else {
      console.log('Material purchase requisitions are NOT included (kept intact; MPO allocations cleared).');
    }
    if (withSuppliers) {
      console.log(
        'Suppliers ARE included: supplier_quotation_items, supplier_quotations, supplier_quotation_emails, supplier_contact_persons, supplier_addresses, suppliers.',
      );
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
      console.log('Code sequences can still be restarted so the next insert is …-00000001.');
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

async function restartCodeSequences(tx: SeedClient, sequences: readonly string[]) {
  for (const sequence of sequences) {
    // RESTART WITH 1 → next nextval() returns 1 (MPO-00000001 / MPR-… / IVT-…).
    await tx.execute(sql.raw(`ALTER SEQUENCE ${sequence} RESTART WITH 1`));
    console.log(`  restarted sequence ${sequence} → next code serial = 1`);
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

  await restartCodeSequences(tx, sequences);
}

async function confirmSequenceOnlyReset(
  databaseUrl: string,
  withRequisitions: boolean,
  withSuppliers: boolean,
): Promise<boolean> {
  const rl = readline.createInterface({ input, output });

  try {
    console.log('\n========== RESET CODE SEQUENCES ONLY ==========');
    console.log('Target tables are already empty. No rows will be deleted.');
    console.log('This will restart MPO / MPR / IVT code sequences to 1.');
    if (withRequisitions) console.log('Also restarts material_purchase_requisitions_code_seq to 1.');
    if (withSuppliers) console.log('Also restarts suppliers_code_seq to 1.');
    console.log(`Database: ${maskConnectionString(databaseUrl)}`);
    await promptExact(rl, '\nType "continue" to reset sequences: ', 'continue');
    await promptExact(rl, `Type ${CONFIRM_PHRASE}: `, CONFIRM_PHRASE);
    return true;
  } finally {
    rl.close();
  }
}

function assertEmpty(counts: Record<string, number>, tables: readonly TargetTable[]) {
  const leftover = tables.filter((target) => (counts[target.name] ?? 0) > 0);
  if (leftover.length === 0) return;

  const details = leftover.map((target) => `  ${counts[target.name]} remaining in ${target.name}`).join('\n');
  throw new Error(`Post-delete verification failed; rolling back.\n${details}`);
}

function completionMessage(withRequisitions: boolean, withSuppliers: boolean): string {
  const parts = ['Purchasing', 'inventory'];
  if (withRequisitions) parts.push('requisition');
  if (withSuppliers) parts.push('supplier');

  const kept: string[] = [];
  if (!withRequisitions) kept.push('Requisitions were kept.');
  if (!withSuppliers) kept.push('Suppliers were kept.');

  const cleared = parts.length === 2 ? 'Purchasing and inventory tables are empty.' : `${parts.join(', ')} tables are empty.`;

  return kept.length === 0 ? `\nDelete completed. ${cleared}` : `\nDelete completed. ${cleared} ${kept.join(' ')}`;
}

async function main() {
  const cli = parseCliArgs();

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is not defined in .env');

  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle(pool, { schema });
  let transactionStarted = false;

  try {
    const withRequisitions = await resolveWithRequisitions(cli.withRequisitions);
    const withSuppliers = await resolveWithSuppliers(cli.withSuppliers);
    const tables = targetTables(withRequisitions, withSuppliers);
    const sequences = targetSequences(withRequisitions, withSuppliers);

    if (withSuppliers) {
      await assertNoBlockingSupplierRefs(db);
    }

    const before = await countRows(db, tables);
    const total = Object.values(before).reduce((sum, count) => sum + count, 0);
    const confirmed = await confirmDeletion(
      before,
      tables,
      databaseUrl,
      total,
      withRequisitions,
      withSuppliers,
    );

    if (!confirmed) {
      // Tables empty: still allow resetting code sequences so the next seed
      // gets MPO-00000001 / MPR-00000001 / IVT-00000001 (and optional extras).
      if (total !== 0) return;

      const resetSequences = await confirmSequenceOnlyReset(
        databaseUrl,
        withRequisitions,
        withSuppliers,
      );
      if (!resetSequences) return;

      console.log('\nRestarting code sequences in one database transaction...');
      await db.transaction(async (tx) => {
        transactionStarted = true;
        await restartCodeSequences(tx, sequences);
      });
      console.log(
        '\nSequence reset completed. Next inserts will use MPO-/MPR-/IVT-00000001 (and any optional seqs you included).',
      );
      return;
    }

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

    console.log(completionMessage(withRequisitions, withSuppliers));
    console.log('Code sequences restarted: next MPO / MPR / IVT codes start at …-00000001.');
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
