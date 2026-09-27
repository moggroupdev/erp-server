import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq, sql } from 'drizzle-orm';
import { parse } from 'csv-parse/sync';
import { parseArgs } from 'node:util';
import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import * as schema from '../../src/database/schema';
import { CUSTOMER_CLASSIFICATION_VALUES } from '../../src/utils/constants';
import { type CustomerClassification } from '../../src/utils/types';
import { SEED_IMPORT_NOTE } from '../_utils/seed-constants';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config();

const USAGE = `Usage: npm run seed:customers [-- --email <email> | --id <uuid>]

Seeds customers from data/customers/all-customers.csv.

Rows that share the same trimmed name are combined into one customer.
Classification is taken from the non-empty value in the group.

If --email / --id are omitted, you will be prompted for an email or user ID.
The user must be an active admin.

Options:
  -e, --email <email>  Existing user email stamped as createdBy
  -i, --id <uuid>      Existing user ID stamped as createdBy
  -h, --help           Show this help

Examples:
  npm run seed:customers
  npm run seed:customers -- --email admin@example.com
  npm run seed:customers -- --id 00000000-0000-0000-0000-000000000001`;

type CustomerCsvRow = {
  م: string;
  السنة: string;
  الرقم: string;
  'العميل - مشمول التعاقد': string;
  مكرر: string;
  التصنيف: string;
};

type CollapsedCustomer = {
  name: string;
  classification: CustomerClassification | null;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BATCH_SIZE = 100;
const NAME_COLUMN = 'العميل - مشمول التعاقد';
const CLASSIFICATION_COLUMN = 'التصنيف';

/** Base createdAt: 1/1/2026 midnight Cairo (UTC+3). */
const CUSTOMER_CREATED_AT_BASE_MS = Date.parse('2026-01-01T10:00:00+03:00');
/** Gap so insert/code order matches createdAt order. now() is the same for the whole transaction. */
const CUSTOMER_CREATED_AT_STEP_MS = 10;

function customerCreatedAt(index: number): Date {
  return new Date(CUSTOMER_CREATED_AT_BASE_MS + index * CUSTOMER_CREATED_AT_STEP_MS);
}

function parseCliArgs(): { email?: string; id?: string } {
  try {
    const { values } = parseArgs({
      options: {
        email: { type: 'string', short: 'e' },
        id: { type: 'string', short: 'i' },
        help: { type: 'boolean', short: 'h' },
      },
      allowPositionals: false,
    });

    if (values.help) {
      console.log(USAGE);
      process.exit(0);
    }

    return {
      email: values.email?.trim() || undefined,
      id: values.id?.trim() || undefined,
    };
  } catch {
    console.error(USAGE);
    process.exit(1);
  }
}

async function promptForUserIdentifier(partial: { email?: string; id?: string }): Promise<{ email?: string; id?: string }> {
  if (partial.email || partial.id) return partial;

  const rl = readline.createInterface({ input, output });
  try {
    console.log('\nEnter the user to stamp as createdBy (email or user ID).');
    const answer = (await rl.question('Email or user ID: ')).trim();
    if (!answer) throw new Error('Email or user ID is required.');

    if (UUID_RE.test(answer)) return { id: answer };
    return { email: answer };
  } finally {
    rl.close();
  }
}

async function resolveUser(db: ReturnType<typeof drizzle<typeof schema>>, identifier: { email?: string; id?: string }) {
  const user = identifier.id
    ? await db.query.users.findFirst({
        where: eq(schema.users.id, identifier.id),
        columns: { id: true, email: true, name: true, deletedAt: true, isAdmin: true },
      })
    : await db.query.users.findFirst({
        where: eq(schema.users.email, identifier.email!),
        columns: { id: true, email: true, name: true, deletedAt: true, isAdmin: true },
      });

  if (!user || user.deletedAt) {
    const label = identifier.email ? `email "${identifier.email}"` : `id "${identifier.id}"`;
    throw new Error(`No active user found with ${label}.`);
  }

  if (!user.isAdmin) {
    const label = user.email ? `${user.name} <${user.email}>` : `${user.name} (${user.id})`;
    throw new Error(`User ${label} is not an admin. Only admins can seed customers.`);
  }

  return user;
}

function parseClassification(raw: string, name: string): CustomerClassification {
  if ((CUSTOMER_CLASSIFICATION_VALUES as readonly string[]).includes(raw)) {
    return raw as CustomerClassification;
  }
  throw new Error(`Invalid classification "${raw}" for customer "${name}".`);
}

function collapseCustomers(rows: CustomerCsvRow[]): { customers: CollapsedCustomer[]; collapsedRows: number } {
  const groups = new Map<string, CollapsedCustomer>();
  let collapsedRows = 0;

  for (const row of rows) {
    const name = row[NAME_COLUMN]?.trim();
    if (!name) throw new Error('CSV row is missing a customer name.');

    const rawClassification = row[CLASSIFICATION_COLUMN]?.trim() ?? '';
    const classification = rawClassification ? parseClassification(rawClassification, name) : null;

    const existing = groups.get(name);
    if (!existing) {
      groups.set(name, { name, classification });
      continue;
    }

    collapsedRows++;
    if (classification && existing.classification && classification !== existing.classification) {
      throw new Error(`Conflicting classifications for "${name}": ${existing.classification} and ${classification}.`);
    }
    if (!existing.classification && classification) existing.classification = classification;
  }

  return { customers: [...groups.values()], collapsedRows };
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not defined in .env');

  const cli = parseCliArgs();
  const identifier = await promptForUserIdentifier(cli);

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool, { schema });

  try {
    const user = await resolveUser(db, identifier);
    console.log(`Using createdBy: ${user.name} <${user.email ?? 'no email'}> (${user.id})`);

    const csvPath = path.join(__dirname, '../../data/customers/all-customers.csv');
    const csvData = fs.readFileSync(csvPath, 'utf-8');
    const rows = parse<CustomerCsvRow>(csvData, { columns: true, skip_empty_lines: true, bom: true });
    const { customers, collapsedRows } = collapseCustomers(rows);

    const existingCustomers = await db.select({ name: schema.customers.name }).from(schema.customers);
    const existingNames = new Set(existingCustomers.map((row) => row.name.trim()));

    const customersToInsert: {
      code: ReturnType<typeof sql>;
      name: string;
      classification: CustomerClassification | null;
      notes: string;
      createdAt: Date;
      createdBy: string;
    }[] = [];
    let skippedExisting = 0;

    for (const customer of customers) {
      if (existingNames.has(customer.name)) {
        skippedExisting++;
        continue;
      }

      customersToInsert.push({
        code: sql`DEFAULT`,
        name: customer.name,
        classification: customer.classification,
        notes: SEED_IMPORT_NOTE,
        createdAt: customerCreatedAt(customersToInsert.length),
        createdBy: user.id,
      });
    }

    console.log(`CSV rows: ${rows.length}`);
    console.log(`Unique names: ${customers.length} (${collapsedRows} duplicate rows combined)`);
    console.log(`Already in database: ${skippedExisting}`);
    console.log(`To insert: ${customersToInsert.length}`);

    if (customersToInsert.length === 0) {
      console.log('No new customers to insert.');
      return;
    }

    console.log('Writing all inserts in one database transaction. A failure rolls back the entire run.');

    let inserted = 0;
    await db.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL statement_timeout = 0`);
      await tx.execute(sql`SET LOCAL idle_in_transaction_session_timeout = 0`);
      await tx.execute(sql`SET LOCAL erp.audit_skip = 'true'`);

      for (let i = 0; i < customersToInsert.length; i += BATCH_SIZE) {
        const batch = customersToInsert.slice(i, i + BATCH_SIZE);
        const result = await tx.insert(schema.customers).values(batch).returning({ code: schema.customers.code });
        inserted += result.length;
        process.stdout.write(
          `\rInserted ${Math.min(i + BATCH_SIZE, customersToInsert.length)} / ${customersToInsert.length} customers`,
        );
      }
      console.log();
    });

    console.log('\n========== CUSTOMERS SEED STATS ==========');
    console.log(`CSV rows loaded:                 ${rows.length}`);
    console.log(`Duplicate rows combined:         ${collapsedRows}`);
    console.log(`Inserted (new customers):        ${inserted}`);
    console.log(`Skipped (already exist):         ${skippedExisting}`);
    console.log('==========================================\n');
    console.log('Customers seed completed successfully.');
  } catch (e) {
    const err = e as Error & { cause?: { message?: string; code?: string; detail?: string } };
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
