import { and, gte, isNull, lte, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { parseArgs } from 'node:util';
import { stdin as input, stdout as output } from 'node:process';
import * as readline from 'node:readline/promises';
import * as schema from '../../src/database/schema';
import * as dotenv from 'dotenv';

dotenv.config();

const USAGE = `Usage: npm run delete:anonymous-audit-logs -- [options]

Permanently deletes audit_logs rows where actor_user_id IS NULL.
These are anonymous/system-generated audit trail entries (e.g. scripts,
migrations, or background jobs that did not set an actor).

Optionally restrict the deletion to a created_at date range (inclusive).
Dates are parsed as ISO 8601 and compared against created_at (timestamptz).
Examples:
  npm run delete:anonymous-audit-logs
  npm run delete:anonymous-audit-logs -- --from-date 2024-01-01 --to-date 2024-06-30
  npm run delete:anonymous-audit-logs -- --to-date 2024-12-31T23:59:59Z

All matching deletes run in one database transaction. A failure rolls back.

This script requires interactive confirmations. There is no --force flag.

Options:
  --from-date <ISO 8601>  Only delete rows with created_at >= this value
  --to-date <ISO 8601>    Only delete rows with created_at <= this value
  -h, --help              Show this help`;

const CONFIRM_PHRASE = 'DELETE ANONYMOUS AUDIT LOGS';

type SeedClient = Pick<
  ReturnType<typeof drizzle<typeof schema>>,
  'select' | 'delete' | 'execute' | 'transaction'
>;

type DateRange = {
  fromDate: Date | undefined;
  toDate: Date | undefined;
};

function parseCliArgs(): DateRange {
  try {
    const { values } = parseArgs({
      options: {
        help: { type: 'boolean', short: 'h' },
        'from-date': { type: 'string' },
        'to-date': { type: 'string' },
      },
      allowPositionals: false,
    });

    if (values.help) {
      console.log(USAGE);
      process.exit(0);
    }

    const fromDate = values['from-date'] ? parseIsoDate(values['from-date']) : undefined;
    const toDate = values['to-date'] ? parseIsoDate(values['to-date']) : undefined;

    if (fromDate && toDate && fromDate.getTime() > toDate.getTime()) {
      throw new Error(`--from-date (${fromDate.toISOString()}) is after --to-date (${toDate.toISOString()}).`);
    }

    return { fromDate, toDate };
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

function parseIsoDate(value: string): Date {
  const trimmed = value.trim();
  const date = new Date(trimmed);

  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid date: "${trimmed}". Use ISO 8601 format, e.g. 2024-01-01T00:00:00Z.`);
  }

  return date;
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

function buildFilter(range: DateRange) {
  const conditions = [isNull(schema.auditLogs.actorUserId)];

  if (range.fromDate) {
    conditions.push(gte(schema.auditLogs.createdAt, range.fromDate));
  }

  if (range.toDate) {
    conditions.push(lte(schema.auditLogs.createdAt, range.toDate));
  }

  return conditions.length === 1 ? conditions[0] : and(...conditions);
}

function formatDateBoundary(date: Date | undefined, label: string): string {
  if (!date) return `  ${label}: (none)`;
  return `  ${label}: ${date.toISOString()}`;
}

async function countMatching(db: SeedClient, filter: ReturnType<typeof buildFilter>): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.auditLogs)
    .where(filter);

  return toCount(row?.count);
}

async function promptExact(rl: readline.Interface, prompt: string, expected: string): Promise<void> {
  const answer = (await rl.question(prompt)).trim();
  if (answer !== expected) {
    throw new Error(`Confirmation failed. Expected "${expected}", got "${answer || '(empty)'}". No rows were deleted.`);
  }
}

async function confirmDeletion(
  db: SeedClient,
  range: DateRange,
  databaseUrl: string,
): Promise<{ confirmed: boolean; total: number }> {
  const filter = buildFilter(range);
  const total = await countMatching(db, filter);
  const rl = readline.createInterface({ input, output });

  try {
    console.log('\n========== DELETE ANONYMOUS AUDIT LOGS ==========');
    console.log('This permanently deletes audit_logs rows where actor_user_id IS NULL.');
    console.log('These rows are normally produced by scripts, migrations, or background jobs.');
    console.log('Date range (inclusive, on created_at):');
    console.log(formatDateBoundary(range.fromDate, 'From'));
    console.log(formatDateBoundary(range.toDate, 'To'));
    console.log(`Database: ${maskConnectionString(databaseUrl)}`);
    console.log('All deletes run in one transaction. A failure rolls back the entire run.\n');

    console.log(`Step 1 of 3 — rows that match the filter: ${total}`);

    if (total === 0) {
      console.log('\nNothing to delete. No anonymous audit logs match the filter.');
      return { confirmed: false, total };
    }

    await promptExact(rl, '\nType "continue" to review the delete plan: ', 'continue');

    console.log('\nStep 2 of 3 — type the exact phrase to confirm deletion.');
    console.log(`Phrase: ${CONFIRM_PHRASE}`);
    await promptExact(rl, `Type ${CONFIRM_PHRASE}: `, CONFIRM_PHRASE);

    console.log(`\nStep 3 of 3 — type the TOTAL row count shown above (${total}).`);
    await promptExact(rl, `Type ${total}: `, String(total));

    return { confirmed: true, total };
  } finally {
    rl.close();
  }
}

async function deleteAndVerify(
  tx: SeedClient,
  range: DateRange,
  expectedTotal: number,
): Promise<number> {
  const filter = buildFilter(range);

  const deleted = await tx
    .delete(schema.auditLogs)
    .where(filter)
    .returning({ id: schema.auditLogs.id });

  const deletedCount = deleted.length;
  console.log(`  deleted ${String(deletedCount).padStart(8)}  audit_logs`);

  if (deletedCount !== expectedTotal) {
    throw new Error(
      `Deleted row count mismatch: expected ${expectedTotal}, actually deleted ${deletedCount}. Rolling back.`,
    );
  }

  const remaining = await countMatching(tx, filter);
  if (remaining !== 0) {
    throw new Error(`Post-delete verification failed: ${remaining} matching row(s) still exist. Rolling back.`);
  }

  return deletedCount;
}

async function main() {
  const range = parseCliArgs();

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is not defined in .env');

  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle(pool, { schema });
  let transactionStarted = false;

  try {
    const { confirmed, total } = await confirmDeletion(db, range, databaseUrl);
    if (!confirmed) return;

    console.log('\nDeleting in one database transaction...');
    await db.transaction(async (tx) => {
      transactionStarted = true;
      await tx.execute(sql`SET LOCAL statement_timeout = 0`);
      await tx.execute(sql`SET LOCAL idle_in_transaction_session_timeout = 0`);

      const deletedCount = await deleteAndVerify(tx, range, total);

      console.log(`\nPost-delete verification: ${deletedCount} anonymous audit log(s) removed.`);
    });

    console.log('\nDelete completed.');
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
