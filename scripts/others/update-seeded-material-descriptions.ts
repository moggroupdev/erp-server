import { and, eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { parseArgs } from 'node:util';
import { stdin as input, stdout as output } from 'node:process';
import * as readline from 'node:readline/promises';
import * as schema from '../../src/database/schema';
import * as dotenv from 'dotenv';
import { SEED_IMPORT_NOTE } from '../_utils/seed-constants';

dotenv.config();

/** User who created the seeded materials (legacy import). */
const CREATED_BY_USER_ID = '94a90250-5b8e-49d1-8ffe-42290911471a';

const USAGE = `Usage: npm run update:seeded-material-descriptions [-- --help]

Sets materials.description to SEED_IMPORT_NOTE for every material created by:
  ${CREATED_BY_USER_ID}

Soft-deleted materials are included. Rows that already have the note are left
unchanged. All updates run in one transaction with audit logging skipped.

SEED_IMPORT_NOTE:
  ${SEED_IMPORT_NOTE}

This script requires interactive confirmation. There is no --force flag.

Options:
  -h, --help  Show this help`;

type SeedClient = Pick<
  ReturnType<typeof drizzle<typeof schema>>,
  'select' | 'update' | 'execute' | 'query'
>;

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

const createdByFilter = eq(schema.materials.createdBy, CREATED_BY_USER_ID);
const needsUpdateFilter = and(
  createdByFilter,
  sql`${schema.materials.description} is distinct from ${SEED_IMPORT_NOTE}`,
);

async function countMatching(db: SeedClient, filter: typeof createdByFilter | typeof needsUpdateFilter): Promise<number> {
  const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(schema.materials).where(filter);
  return toCount(row?.count);
}

async function resolveUser(db: SeedClient) {
  const user = await db.query.users.findFirst({
    where: eq(schema.users.id, CREATED_BY_USER_ID),
    columns: { id: true, email: true, name: true, deletedAt: true },
  });

  if (!user) {
    throw new Error(`No user found with id "${CREATED_BY_USER_ID}".`);
  }

  return user;
}

async function confirmUpdate(
  db: SeedClient,
  databaseUrl: string,
): Promise<{ confirmed: boolean; toUpdate: number }> {
  const user = await resolveUser(db);
  const totalForUser = await countMatching(db, createdByFilter);
  const toUpdate = await countMatching(db, needsUpdateFilter);
  const alreadyStamped = totalForUser - toUpdate;
  const userLabel = user.email ? `${user.name} <${user.email}>` : `${user.name} (${user.id})`;
  const deletedLabel = user.deletedAt ? ' (deleted)' : '';

  console.log('\n========== UPDATE SEEDED MATERIAL DESCRIPTIONS ==========');
  console.log(`Created by: ${userLabel}${deletedLabel}`);
  console.log(`User id:    ${user.id}`);
  console.log(`Database:   ${maskConnectionString(databaseUrl)}`);
  console.log(`Note:       ${SEED_IMPORT_NOTE}`);
  console.log('Soft-deleted materials are included. Audit logging is skipped.\n');
  console.log(`  ${String(totalForUser).padStart(8)}  materials created by this user`);
  console.log(`  ${String(alreadyStamped).padStart(8)}  already have the seed note`);
  console.log(`  ${String(toUpdate).padStart(8)}  will be updated`);

  if (toUpdate === 0) {
    console.log('\nNothing to update. Matching materials already have the seed note.');
    return { confirmed: false, toUpdate };
  }

  const rl = readline.createInterface({ input, output });
  try {
    const answer = (await rl.question('\nType "yes" to update descriptions, anything else to abort: ')).trim();
    return { confirmed: answer === 'yes', toUpdate };
  } finally {
    rl.close();
  }
}

async function main() {
  parseCliArgs();

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is not defined in .env');

  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle(pool, { schema });
  let transactionStarted = false;

  try {
    const { confirmed, toUpdate } = await confirmUpdate(db, databaseUrl);
    if (!confirmed) {
      if (toUpdate > 0) console.log('Aborted. No rows were updated.');
      return;
    }

    console.log('\nUpdating in one database transaction...');
    await db.transaction(async (tx) => {
      transactionStarted = true;
      await tx.execute(sql`SET LOCAL statement_timeout = 0`);
      await tx.execute(sql`SET LOCAL idle_in_transaction_session_timeout = 0`);
      await tx.execute(sql`SET LOCAL erp.audit_skip = 'true'`);

      const updated = await tx
        .update(schema.materials)
        .set({ description: SEED_IMPORT_NOTE })
        .where(needsUpdateFilter)
        .returning({ code: schema.materials.code });

      if (updated.length !== toUpdate) {
        throw new Error(
          `Updated row count mismatch: expected ${toUpdate}, actually updated ${updated.length}. Rolling back.`,
        );
      }

      const remaining = await countMatching(tx, needsUpdateFilter);
      if (remaining !== 0) {
        throw new Error(`Post-update verification failed: ${remaining} matching row(s) still need the note. Rolling back.`);
      }

      console.log(`  updated ${String(updated.length).padStart(8)}  materials.description`);
    });

    console.log('\nUpdate completed.');
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    if (transactionStarted) {
      console.error('Update failed; all database changes from this run were rolled back.');
    }
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

void main();
