import { and, eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { parseArgs } from 'node:util';
import { stdin as input, stdout as output } from 'node:process';
import * as readline from 'node:readline/promises';
import * as schema from '../../src/database/schema';
import type { CustomerClassification } from '../../src/utils/types';
import * as dotenv from 'dotenv';

dotenv.config();

const USAGE = `Usage: npm run merge:customers [-- [--keep <code>] [--remove <code>] [--dry-run]]

Repoints every reference from the removed customer to the kept one, fills empty
identity/profile fields on the kept row, then hard-deletes the removed customer.

If --keep / --remove are omitted, the script prompts for the two codes.

Guards:
  - Both customers must exist and be different codes
  - Unique identity fields (phone, email, tax_number, commercial_registration_number)
    abort when both are non-null and differ
  - App-rule links abort when a third customer would still disagree after merge
    (contract/inquiry, contract/delivery address, maintenance order/address,
    reception/unit contract)

Partial uniques (one default address, one primary contact) are resolved by
clearing the removed side when the kept side already has the flag.

Name stays on the kept customer. Audit logging stays on.

This script requires interactive confirmation unless --dry-run is set.
There is no --force flag.

Options:
      --keep <code>     Customer to keep (prompted if omitted)
      --remove <code>   Customer to merge into the kept one, then delete (prompted if omitted)
      --dry-run         Print the plan and exit without writing
  -h, --help            Show this help

Examples:
  npm run merge:customers
  npm run merge:customers -- --keep CUS-00000001 --remove CUS-00000002 --dry-run`;

const CONFIRM_PHRASE = 'MERGE CUSTOMERS';
const ID_PRINT_LIMIT = 20;

type Db = ReturnType<typeof drizzle<typeof schema>>;
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

type CliArgs = {
  keep?: string;
  remove?: string;
  dryRun: boolean;
};

type CustomerRow = {
  id: string;
  code: string;
  name: string;
  phone: string | null;
  email: string | null;
  website: string | null;
  taxNumber: string | null;
  commercialRegistrationNumber: string | null;
  classification: CustomerClassification | null;
  notes: string | null;
  blacklistedAt: Date | null;
  addedToBlacklistBy: string | null;
};

type Collision = { label: string; ids: string[] };

type RefCount = { name: string; count: number };

type UniqueFieldPlan = {
  column: keyof Pick<CustomerRow, 'phone' | 'email' | 'taxNumber' | 'commercialRegistrationNumber'>;
  dbColumn: 'phone' | 'email' | 'tax_number' | 'commercial_registration_number';
  keepValue: string | null;
  removeValue: string | null;
  fill: boolean;
};

type FillFieldPlan = {
  label: string;
  keepValue: string | null;
  removeValue: string | null;
  fill: boolean;
  drop: boolean;
};

type FlagClearPlan = {
  clearRemovedDefaultAddress: boolean;
  clearRemovedPrimaryContact: boolean;
  keptHasDefaultAddress: boolean;
  removedHasDefaultAddress: boolean;
  keptHasPrimaryContact: boolean;
  removedHasPrimaryContact: boolean;
};

type FieldMergePlan = {
  uniqueFields: UniqueFieldPlan[];
  fillFields: FillFieldPlan[];
  copyBlacklist: boolean;
  nameKept: string;
  nameDropped: string | null;
};

type ScanResult = {
  refCounts: RefCount[];
  followCounts: RefCount[];
  collisions: Collision[];
  flagClear: FlagClearPlan;
};

const CUSTOMER_REF_COLUMNS: { name: string; table: string; column: string }[] = [
  { name: 'customer_addresses', table: 'customer_addresses', column: 'customer_id' },
  { name: 'customer_contact_persons', table: 'customer_contact_persons', column: 'customer_id' },
  { name: 'inquiries', table: 'inquiries', column: 'customer_id' },
  { name: 'contracts', table: 'contracts', column: 'customer_id' },
  { name: 'customer_receptions', table: 'customer_receptions', column: 'customer_id' },
  { name: 'maintenance_orders', table: 'maintenance_orders', column: 'customer_id' },
  { name: 'legacy_issue_permits', table: 'legacy_issue_permits', column: 'customer_id' },
];

function parseCliArgs(): CliArgs {
  try {
    const { values } = parseArgs({
      options: {
        help: { type: 'boolean', short: 'h' },
        keep: { type: 'string' },
        remove: { type: 'string' },
        'dry-run': { type: 'boolean', default: false },
      },
      allowPositionals: false,
    });

    if (values.help) {
      console.log(USAGE);
      process.exit(0);
    }

    return {
      keep: values.keep?.trim() || undefined,
      remove: values.remove?.trim() || undefined,
      dryRun: Boolean(values['dry-run']),
    };
  } catch (e) {
    if (e instanceof Error && e.message.startsWith('--')) {
      console.error(e.message);
    } else if (e instanceof Error) {
      console.error(`Error: ${e.message}`);
    }
    console.error(`\n${USAGE}`);
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

function executeRows(result: unknown): Record<string, unknown>[] {
  if (Array.isArray(result)) return result as Record<string, unknown>[];
  if (result && typeof result === 'object' && 'rows' in result && Array.isArray((result as { rows: unknown }).rows)) {
    return (result as { rows: Record<string, unknown>[] }).rows;
  }
  throw new Error('Unexpected execute() result shape.');
}

function asStringIds(rows: Record<string, unknown>[], column = 'parent_id'): string[] {
  return rows.map((row) => String(row[column] ?? '')).filter(Boolean);
}

function formatIdList(ids: string[]): string {
  if (ids.length === 0) return '(none)';
  const shown = ids.slice(0, ID_PRINT_LIMIT);
  const extra = ids.length - shown.length;
  return extra > 0 ? `${shown.join(', ')} ... +${extra} more` : shown.join(', ');
}

function displayNullable(value: string | null | undefined): string {
  return value ?? '(null)';
}

async function promptExact(rl: readline.Interface, prompt: string, expected: string): Promise<void> {
  const answer = (await rl.question(prompt)).trim();
  if (answer !== expected) {
    throw new Error(`Confirmation failed. Expected "${expected}", got "${answer || '(empty)'}". No rows were changed.`);
  }
}

async function loadCustomer(db: Db, code: string): Promise<CustomerRow | undefined> {
  const [row] = await db
    .select({
      id: schema.customers.id,
      code: schema.customers.code,
      name: schema.customers.name,
      phone: schema.customers.phone,
      email: schema.customers.email,
      website: schema.customers.website,
      taxNumber: schema.customers.taxNumber,
      commercialRegistrationNumber: schema.customers.commercialRegistrationNumber,
      classification: schema.customers.classification,
      notes: schema.customers.notes,
      blacklistedAt: schema.customers.blacklistedAt,
      addedToBlacklistBy: schema.customers.addedToBlacklistBy,
    })
    .from(schema.customers)
    .where(eq(schema.customers.code, code))
    .limit(1);

  return row;
}

async function countSql(db: Pick<Db, 'execute'>, query: ReturnType<typeof sql>): Promise<number> {
  const rows = executeRows(await db.execute(query));
  return toCount(rows[0]?.count ?? 0);
}

async function collisionParentIds(db: Db, query: ReturnType<typeof sql>): Promise<string[]> {
  return asStringIds(executeRows(await db.execute(query)));
}

function planFieldMerge(kept: CustomerRow, removed: CustomerRow): FieldMergePlan {
  const uniqueSpecs: {
    column: UniqueFieldPlan['column'];
    dbColumn: UniqueFieldPlan['dbColumn'];
    keepValue: string | null;
    removeValue: string | null;
  }[] = [
    { column: 'phone', dbColumn: 'phone', keepValue: kept.phone, removeValue: removed.phone },
    { column: 'email', dbColumn: 'email', keepValue: kept.email, removeValue: removed.email },
    {
      column: 'taxNumber',
      dbColumn: 'tax_number',
      keepValue: kept.taxNumber,
      removeValue: removed.taxNumber,
    },
    {
      column: 'commercialRegistrationNumber',
      dbColumn: 'commercial_registration_number',
      keepValue: kept.commercialRegistrationNumber,
      removeValue: removed.commercialRegistrationNumber,
    },
  ];

  const uniqueFields: UniqueFieldPlan[] = uniqueSpecs.map((spec) => ({
    ...spec,
    fill: spec.keepValue == null && spec.removeValue != null,
  }));

  const fillSpecs: { label: string; keepValue: string | null; removeValue: string | null }[] = [
    { label: 'classification', keepValue: kept.classification, removeValue: removed.classification },
    { label: 'website', keepValue: kept.website, removeValue: removed.website },
    { label: 'notes', keepValue: kept.notes, removeValue: removed.notes },
  ];

  const fillFields: FillFieldPlan[] = fillSpecs.map((spec) => ({
    ...spec,
    fill: spec.keepValue == null && spec.removeValue != null,
    drop: spec.keepValue != null && spec.removeValue != null && spec.keepValue !== spec.removeValue,
  }));

  const copyBlacklist = kept.blacklistedAt == null && removed.blacklistedAt != null;
  const nameDropped = kept.name !== removed.name ? removed.name : null;

  return {
    uniqueFields,
    fillFields,
    copyBlacklist,
    nameKept: kept.name,
    nameDropped,
  };
}

function assertUniqueIdentityCompatible(plan: FieldMergePlan): void {
  const conflicts = plan.uniqueFields.filter(
    (field) => field.keepValue != null && field.removeValue != null && field.keepValue !== field.removeValue,
  );
  if (conflicts.length === 0) return;

  const details = conflicts
    .map((field) => `${field.dbColumn}: keep=${field.keepValue}, remove=${field.removeValue}`)
    .join('; ');
  throw new Error(`Unique identity conflict (aborting): ${details}`);
}

async function loadFlagClearPlan(db: Db, keepId: string, removeId: string): Promise<FlagClearPlan> {
  const keptHasDefaultAddress =
    (await countSql(
      db,
      sql`SELECT count(*)::int AS count FROM customer_addresses WHERE customer_id = ${keepId} AND is_default = true`,
    )) > 0;
  const removedHasDefaultAddress =
    (await countSql(
      db,
      sql`SELECT count(*)::int AS count FROM customer_addresses WHERE customer_id = ${removeId} AND is_default = true`,
    )) > 0;
  const keptHasPrimaryContact =
    (await countSql(
      db,
      sql`SELECT count(*)::int AS count FROM customer_contact_persons WHERE customer_id = ${keepId} AND is_primary = true`,
    )) > 0;
  const removedHasPrimaryContact =
    (await countSql(
      db,
      sql`SELECT count(*)::int AS count FROM customer_contact_persons WHERE customer_id = ${removeId} AND is_primary = true`,
    )) > 0;

  return {
    clearRemovedDefaultAddress: keptHasDefaultAddress && removedHasDefaultAddress,
    clearRemovedPrimaryContact: keptHasPrimaryContact && removedHasPrimaryContact,
    keptHasDefaultAddress,
    removedHasDefaultAddress,
    keptHasPrimaryContact,
    removedHasPrimaryContact,
  };
}

async function scanReferences(db: Db, keepId: string, removeId: string): Promise<ScanResult> {
  const refCounts: RefCount[] = [];
  for (const target of CUSTOMER_REF_COLUMNS) {
    refCounts.push({
      name: target.name,
      count: await countSql(
        db,
        sql`SELECT count(*)::int AS count FROM ${sql.raw(target.table)} WHERE ${sql.raw(target.column)} = ${removeId}`,
      ),
    });
  }

  const followCounts: RefCount[] = [
    {
      name: 'service_agreements (via removed addresses)',
      count: await countSql(
        db,
        sql`
          SELECT count(*)::int AS count
          FROM service_agreements sa
          INNER JOIN customer_addresses ca ON ca.id = sa.customer_address_id
          WHERE ca.customer_id = ${removeId}
        `,
      ),
    },
    {
      name: 'contracts.delivery_address_id (via removed addresses)',
      count: await countSql(
        db,
        sql`
          SELECT count(*)::int AS count
          FROM contracts c
          INNER JOIN customer_addresses ca ON ca.id = c.delivery_address_id
          WHERE ca.customer_id = ${removeId}
        `,
      ),
    },
    {
      name: 'maintenance_orders.customer_address_id (via removed addresses)',
      count: await countSql(
        db,
        sql`
          SELECT count(*)::int AS count
          FROM maintenance_orders mo
          INNER JOIN customer_addresses ca ON ca.id = mo.customer_address_id
          WHERE ca.customer_id = ${removeId}
        `,
      ),
    },
    {
      name: 'maintenance_orders.service_agreement_id (via removed addresses)',
      count: await countSql(
        db,
        sql`
          SELECT count(*)::int AS count
          FROM maintenance_orders mo
          INNER JOIN service_agreements sa ON sa.id = mo.service_agreement_id
          INNER JOIN customer_addresses ca ON ca.id = sa.customer_address_id
          WHERE ca.customer_id = ${removeId}
        `,
      ),
    },
  ];

  const flagClear = await loadFlagClearPlan(db, keepId, removeId);

  const collisions: Collision[] = [
    {
      label: 'contracts.customer_id vs inquiries.customer_id (third customer after merge)',
      ids: await collisionParentIds(
        db,
        sql`
          SELECT c.code AS parent_id
          FROM contracts c
          INNER JOIN inquiries i ON i.id = c.inquiry_id
          WHERE (c.customer_id = ${keepId} OR c.customer_id = ${removeId} OR i.customer_id = ${keepId} OR i.customer_id = ${removeId})
            AND CASE
                  WHEN c.customer_id IN (${keepId}, ${removeId}) THEN ${keepId}
                  ELSE c.customer_id
                END
                IS DISTINCT FROM
                CASE
                  WHEN i.customer_id IN (${keepId}, ${removeId}) THEN ${keepId}
                  ELSE i.customer_id
                END
        `,
      ),
    },
    {
      label: 'contracts.customer_id vs delivery address customer (third customer after merge)',
      ids: await collisionParentIds(
        db,
        sql`
          SELECT c.code AS parent_id
          FROM contracts c
          INNER JOIN customer_addresses ca ON ca.id = c.delivery_address_id
          WHERE (c.customer_id = ${keepId} OR c.customer_id = ${removeId} OR ca.customer_id = ${keepId} OR ca.customer_id = ${removeId})
            AND CASE
                  WHEN c.customer_id IN (${keepId}, ${removeId}) THEN ${keepId}
                  ELSE c.customer_id
                END
                IS DISTINCT FROM
                CASE
                  WHEN ca.customer_id IN (${keepId}, ${removeId}) THEN ${keepId}
                  ELSE ca.customer_id
                END
        `,
      ),
    },
    {
      label: 'maintenance_orders.customer_id vs address customer (third customer after merge)',
      ids: await collisionParentIds(
        db,
        sql`
          SELECT mo.code AS parent_id
          FROM maintenance_orders mo
          LEFT JOIN customer_addresses direct_ca ON direct_ca.id = mo.customer_address_id
          LEFT JOIN service_agreements sa ON sa.id = mo.service_agreement_id
          LEFT JOIN customer_addresses sa_ca ON sa_ca.id = sa.customer_address_id
          WHERE (
              mo.customer_id = ${keepId}
              OR mo.customer_id = ${removeId}
              OR direct_ca.customer_id = ${keepId}
              OR direct_ca.customer_id = ${removeId}
              OR sa_ca.customer_id = ${keepId}
              OR sa_ca.customer_id = ${removeId}
            )
            AND COALESCE(direct_ca.customer_id, sa_ca.customer_id) IS NOT NULL
            AND CASE
                  WHEN mo.customer_id IN (${keepId}, ${removeId}) THEN ${keepId}
                  ELSE mo.customer_id
                END
                IS DISTINCT FROM
                CASE
                  WHEN COALESCE(direct_ca.customer_id, sa_ca.customer_id) IN (${keepId}, ${removeId}) THEN ${keepId}
                  ELSE COALESCE(direct_ca.customer_id, sa_ca.customer_id)
                END
        `,
      ),
    },
    {
      label: 'customer_receptions.customer_id vs unit contract customer (third customer after merge)',
      ids: await collisionParentIds(
        db,
        sql`
          SELECT DISTINCT cr.code AS parent_id
          FROM customer_receptions cr
          INNER JOIN customer_reception_items cri ON cri.customer_reception_id = cr.id
          INNER JOIN product_units pu ON pu.id = cri.product_unit_id
          INNER JOIN contract_items ci ON ci.id = pu.contract_item_id
          INNER JOIN contracts c ON c.id = ci.contract_id
          WHERE (
              cr.customer_id = ${keepId}
              OR cr.customer_id = ${removeId}
              OR c.customer_id = ${keepId}
              OR c.customer_id = ${removeId}
            )
            AND CASE
                  WHEN cr.customer_id IN (${keepId}, ${removeId}) THEN ${keepId}
                  ELSE cr.customer_id
                END
                IS DISTINCT FROM
                CASE
                  WHEN c.customer_id IN (${keepId}, ${removeId}) THEN ${keepId}
                  ELSE c.customer_id
                END
        `,
      ),
    },
  ];

  return { refCounts, followCounts, collisions, flagClear };
}

function printCustomer(label: string, customer: CustomerRow): void {
  const blacklisted = customer.blacklistedAt ? ` blacklistedAt=${customer.blacklistedAt.toISOString()}` : '';
  console.log(`${label}: ${customer.code}  ${customer.name}  id=${customer.id}${blacklisted}`);
  console.log(`  phone=${displayNullable(customer.phone)}  email=${displayNullable(customer.email)}`);
  console.log(
    `  taxNumber=${displayNullable(customer.taxNumber)}  commercialRegistrationNumber=${displayNullable(customer.commercialRegistrationNumber)}`,
  );
  console.log(
    `  classification=${displayNullable(customer.classification)}  website=${displayNullable(customer.website)}`,
  );
  console.log(`  notes=${displayNullable(customer.notes)}`);
}

async function countRemaining(db: Pick<Db, 'execute'>, removeId: string): Promise<RefCount[]> {
  const counts: RefCount[] = [];
  for (const target of CUSTOMER_REF_COLUMNS) {
    counts.push({
      name: target.name,
      count: await countSql(
        db,
        sql`SELECT count(*)::int AS count FROM ${sql.raw(target.table)} WHERE ${sql.raw(target.column)} = ${removeId}`,
      ),
    });
  }
  return counts;
}

function expectUpdated(name: string, expected: number, actual: number): void {
  if (actual !== expected) {
    throw new Error(`${name}: expected to update ${expected} row(s), actually updated ${actual}. Rolling back.`);
  }
}

async function runMerge(
  tx: Tx,
  keepId: string,
  removeId: string,
  kept: CustomerRow,
  removed: CustomerRow,
  fieldPlan: FieldMergePlan,
  scan: ScanResult,
): Promise<void> {
  await tx.execute(sql`SET LOCAL statement_timeout = 0`);
  await tx.execute(sql`SET LOCAL idle_in_transaction_session_timeout = 0`);

  if (scan.flagClear.clearRemovedDefaultAddress) {
    const cleared = await tx
      .update(schema.customerAddresses)
      .set({ isDefault: false })
      .where(and(eq(schema.customerAddresses.customerId, removeId), eq(schema.customerAddresses.isDefault, true)))
      .returning({ id: schema.customerAddresses.id });
    expectUpdated('customer_addresses (clear removed default)', 1, cleared.length);
    console.log(`  cleared  ${String(cleared.length).padStart(8)}  customer_addresses.is_default on removed`);
  }

  if (scan.flagClear.clearRemovedPrimaryContact) {
    const cleared = await tx
      .update(schema.customerContactPersons)
      .set({ isPrimary: false })
      .where(
        and(eq(schema.customerContactPersons.customerId, removeId), eq(schema.customerContactPersons.isPrimary, true)),
      )
      .returning({ id: schema.customerContactPersons.id });
    expectUpdated('customer_contact_persons (clear removed primary)', 1, cleared.length);
    console.log(`  cleared  ${String(cleared.length).padStart(8)}  customer_contact_persons.is_primary on removed`);
  }

  const fillsToApply = fieldPlan.uniqueFields.filter((field) => field.fill);
  if (fillsToApply.length > 0) {
    const clearSet: Partial<Record<'phone' | 'email' | 'taxNumber' | 'commercialRegistrationNumber', null>> = {};
    for (const field of fillsToApply) {
      clearSet[field.column] = null;
    }
    const cleared = await tx
      .update(schema.customers)
      .set(clearSet)
      .where(eq(schema.customers.id, removeId))
      .returning({ id: schema.customers.id });
    expectUpdated('customers (clear unique fields on removed)', 1, cleared.length);
    console.log(`  cleared  ${String(1).padStart(8)}  unique identity fields on removed`);
  }

  const countByName = (name: string) => scan.refCounts.find((row) => row.name === name)?.count ?? 0;

  const simpleUpdates: { name: string; run: () => Promise<{ id: string }[]> }[] = [
    {
      name: 'customer_addresses',
      run: () =>
        tx
          .update(schema.customerAddresses)
          .set({ customerId: keepId })
          .where(eq(schema.customerAddresses.customerId, removeId))
          .returning({ id: schema.customerAddresses.id }),
    },
    {
      name: 'customer_contact_persons',
      run: () =>
        tx
          .update(schema.customerContactPersons)
          .set({ customerId: keepId })
          .where(eq(schema.customerContactPersons.customerId, removeId))
          .returning({ id: schema.customerContactPersons.id }),
    },
    {
      name: 'inquiries',
      run: () =>
        tx
          .update(schema.inquiries)
          .set({ customerId: keepId })
          .where(eq(schema.inquiries.customerId, removeId))
          .returning({ id: schema.inquiries.id }),
    },
    {
      name: 'contracts',
      run: () =>
        tx
          .update(schema.contracts)
          .set({ customerId: keepId })
          .where(eq(schema.contracts.customerId, removeId))
          .returning({ id: schema.contracts.id }),
    },
    {
      name: 'customer_receptions',
      run: () =>
        tx
          .update(schema.customerReceptions)
          .set({ customerId: keepId })
          .where(eq(schema.customerReceptions.customerId, removeId))
          .returning({ id: schema.customerReceptions.id }),
    },
    {
      name: 'maintenance_orders',
      run: () =>
        tx
          .update(schema.maintenanceOrders)
          .set({ customerId: keepId })
          .where(eq(schema.maintenanceOrders.customerId, removeId))
          .returning({ id: schema.maintenanceOrders.id }),
    },
    {
      name: 'legacy_issue_permits',
      run: () =>
        tx
          .update(schema.legacyIssuePermits)
          .set({ customerId: keepId })
          .where(eq(schema.legacyIssuePermits.customerId, removeId))
          .returning({ id: schema.legacyIssuePermits.id }),
    },
  ];

  for (const target of simpleUpdates) {
    const updated = await target.run();
    expectUpdated(target.name, countByName(target.name), updated.length);
    console.log(`  updated ${String(updated.length).padStart(8)}  ${target.name}`);
  }

  const keptUpdate: {
    phone?: string | null;
    email?: string | null;
    taxNumber?: string | null;
    commercialRegistrationNumber?: string | null;
    classification?: CustomerClassification | null;
    website?: string | null;
    notes?: string | null;
    blacklistedAt?: Date | null;
    addedToBlacklistBy?: string | null;
  } = {};

  for (const field of fieldPlan.uniqueFields) {
    if (field.fill) {
      keptUpdate[field.column] = field.removeValue;
    }
  }
  for (const field of fieldPlan.fillFields) {
    if (!field.fill) continue;
    if (field.label === 'classification') keptUpdate.classification = removed.classification;
    if (field.label === 'website') keptUpdate.website = removed.website;
    if (field.label === 'notes') keptUpdate.notes = removed.notes;
  }
  if (fieldPlan.copyBlacklist) {
    keptUpdate.blacklistedAt = removed.blacklistedAt;
    keptUpdate.addedToBlacklistBy = removed.addedToBlacklistBy;
  }

  if (Object.keys(keptUpdate).length > 0) {
    const updated = await tx
      .update(schema.customers)
      .set(keptUpdate)
      .where(eq(schema.customers.id, keepId))
      .returning({ id: schema.customers.id });
    expectUpdated('customers (kept fields)', 1, updated.length);
    console.log(`  updated ${String(1).padStart(8)}  customers ${kept.code} filled fields`);
  } else {
    console.log(`  updated ${String(0).padStart(8)}  customers ${kept.code} filled fields`);
  }

  const deleted = await tx
    .delete(schema.customers)
    .where(eq(schema.customers.id, removeId))
    .returning({ id: schema.customers.id });
  expectUpdated('customers (delete removed)', 1, deleted.length);
  console.log(`  deleted ${String(1).padStart(8)}  customers ${removed.code}`);

  const remaining = await countRemaining(tx, removeId);
  const leftover = remaining.filter((row) => row.count > 0);
  if (leftover.length > 0) {
    const details = leftover.map((row) => `${row.name}=${row.count}`).join(', ');
    throw new Error(`Post-merge verification failed: ${details} still reference ${removed.code}. Rolling back.`);
  }
}

async function promptForCodes(partial: { keep?: string; remove?: string }): Promise<{ keep: string; remove: string }> {
  if (partial.keep && partial.remove) return { keep: partial.keep, remove: partial.remove };

  const rl = readline.createInterface({ input, output });
  try {
    console.log('\nEnter the two customer codes to merge.');
    const keep = partial.keep ?? (await rl.question('Code to keep: ')).trim();
    if (!keep) throw new Error('Kept customer code is required.');

    const remove = partial.remove ?? (await rl.question('Code to remove (merged into the kept one, then deleted): ')).trim();
    if (!remove) throw new Error('Removed customer code is required.');

    return { keep, remove };
  } finally {
    rl.close();
  }
}

async function confirmMerge(remove: string): Promise<void> {
  const rl = readline.createInterface({ input, output });
  try {
    console.log('\nStep 1 of 2 - type the exact phrase to confirm the merge.');
    console.log(`Phrase: ${CONFIRM_PHRASE}`);
    await promptExact(rl, `Type ${CONFIRM_PHRASE}: `, CONFIRM_PHRASE);

    console.log(`\nStep 2 of 2 - type the removed customer code (${remove}).`);
    await promptExact(rl, `Type ${remove}: `, remove);
  } finally {
    rl.close();
  }
}

async function main() {
  const args = parseCliArgs();
  const { keep, remove } = await promptForCodes(args);
  const dryRun = args.dryRun;

  if (keep === remove) throw new Error('Keep and remove must be different codes.');

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is not defined in .env');

  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle(pool, { schema });
  let transactionStarted = false;

  try {
    const kept = await loadCustomer(db, keep);
    const removed = await loadCustomer(db, remove);

    if (!kept) throw new Error(`Kept customer "${keep}" was not found.`);
    if (!removed) throw new Error(`Removed customer "${remove}" was not found.`);

    const fieldPlan = planFieldMerge(kept, removed);
    assertUniqueIdentityCompatible(fieldPlan);

    const scan = await scanReferences(db, kept.id, removed.id);
    const liveCollisions = scan.collisions.filter((row) => row.ids.length > 0);

    console.log('\n========== MERGE CUSTOMERS ==========');
    console.log(`Database: ${maskConnectionString(databaseUrl)}`);
    console.log(`Mode:     ${dryRun ? 'dry-run (no writes)' : 'write'}`);
    console.log('');
    printCustomer('KEEP  ', kept);
    console.log('');
    printCustomer('REMOVE', removed);

    console.log('\nReferences on the removed customer:');
    for (const row of scan.refCounts) {
      console.log(`  ${String(row.count).padStart(8)}  ${row.name}`);
    }

    console.log('\nFollow-on rows via removed addresses (repoint with addresses, no customer_id rewrite):');
    for (const row of scan.followCounts) {
      console.log(`  ${String(row.count).padStart(8)}  ${row.name}`);
    }

    console.log('\nPartial-unique flags:');
    console.log(
      `  default address: kept=${scan.flagClear.keptHasDefaultAddress ? 'yes' : 'no'}, removed=${scan.flagClear.removedHasDefaultAddress ? 'yes' : 'no'}, clear removed=${scan.flagClear.clearRemovedDefaultAddress ? 'yes' : 'no'}`,
    );
    console.log(
      `  primary contact: kept=${scan.flagClear.keptHasPrimaryContact ? 'yes' : 'no'}, removed=${scan.flagClear.removedHasPrimaryContact ? 'yes' : 'no'}, clear removed=${scan.flagClear.clearRemovedPrimaryContact ? 'yes' : 'no'}`,
    );

    console.log('\nKept customer fields after merge:');
    console.log(`  name stays: ${fieldPlan.nameKept}`);
    if (fieldPlan.nameDropped) {
      console.log(`  name dropped from removed: ${fieldPlan.nameDropped}`);
    }
    for (const field of fieldPlan.uniqueFields) {
      if (field.fill) {
        console.log(`  ${field.dbColumn}: (null) -> ${field.removeValue}`);
      } else {
        console.log(`  ${field.dbColumn}: ${displayNullable(field.keepValue)} (unchanged)`);
      }
    }
    for (const field of fieldPlan.fillFields) {
      if (field.fill) {
        console.log(`  ${field.label}: (null) -> ${field.removeValue}`);
      } else if (field.drop) {
        console.log(
          `  ${field.label}: ${displayNullable(field.keepValue)} (unchanged; dropped removed=${field.removeValue})`,
        );
      } else {
        console.log(`  ${field.label}: ${displayNullable(field.keepValue)} (unchanged)`);
      }
    }
    if (fieldPlan.copyBlacklist) {
      console.log(
        `  blacklist: copy from removed (blacklistedAt=${removed.blacklistedAt?.toISOString() ?? '(null)'})`,
      );
    } else if (kept.blacklistedAt) {
      console.log(`  blacklist: kept already blacklisted (unchanged)`);
    } else {
      console.log(`  blacklist: neither blacklisted`);
    }

    if (liveCollisions.length > 0) {
      console.error('\nApp-rule collisions (aborting):');
      for (const collision of liveCollisions) {
        console.error(`  ${collision.label}`);
        console.error(`    ${formatIdList(collision.ids)}`);
      }
      throw new Error(
        'Merge aborted because a related document would still disagree on customer after treating keep/remove as one. Resolve those rows manually, then re-run.',
      );
    }

    if (dryRun) {
      console.log('\nDry-run complete. No rows were changed.');
      return;
    }

    await confirmMerge(remove);

    console.log('\nMerging in one database transaction...');
    await db.transaction(async (tx) => {
      transactionStarted = true;
      await runMerge(tx, kept.id, removed.id, kept, removed, fieldPlan, scan);
    });

    console.log('\nMerge completed.');
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    if (transactionStarted) {
      console.error('Merge failed; all database changes from this run were rolled back.');
    }
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

void main();
