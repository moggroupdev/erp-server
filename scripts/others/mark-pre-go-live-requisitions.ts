import { count, eq, inArray, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { parseArgs } from 'node:util';
import { stdin as input, stdout as output } from 'node:process';
import * as readline from 'node:readline/promises';
import * as schema from '../../src/database/schema';
import { APPROVAL_DECISIONS } from '../../src/utils/constants';
import * as dotenv from 'dotenv';

dotenv.config();

const USAGE = `Usage: npm run mark:pre-go-live-requisitions

Resets all approval gates on material_purchase_requisitions that are not yet
flagged, then sets is_pre_go_live = true on every unflagged row.

Use this once at go-live cutover so historical requisitions stay read-only and
out of live demand (open items, MPO allocations, follow-up report, dashboard).

Aborts if any of those requisitions already has a material purchase order
allocation (material_purchase_order_item_requisition_items), because resetting
gates would break the "linked only when fully approved" rule.

All updates run in one database transaction. A failure rolls back.

This script requires interactive confirmations. There is no --force flag.

Options:
  -h, --help  Show this help`;

const CONFIRM_PHRASE = 'MARK PRE GO LIVE';

type SeedClient = Pick<
  ReturnType<typeof drizzle<typeof schema>>,
  'select' | 'update' | 'execute' | 'transaction'
>;

type Preview = {
  total: number;
  approved: number;
  pending: number;
  rejected: number;
  allocationLinks: number;
};

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
  } catch (e) {
    if (e instanceof Error) {
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
  const n = Number(value);
  if (!Number.isFinite(n)) throw new Error(`Could not parse row count: ${String(value)}`);
  return n;
}

function isRejected(row: {
  planningDecision: string;
  inventoryControlDecision: string;
  managerDecision: string;
}) {
  return (
    row.planningDecision === APPROVAL_DECISIONS.REJECTED ||
    row.inventoryControlDecision === APPROVAL_DECISIONS.REJECTED ||
    row.managerDecision === APPROVAL_DECISIONS.REJECTED
  );
}

function isApproved(row: {
  planningDecision: string;
  inventoryControlDecision: string;
  managerDecision: string;
}) {
  return (
    row.planningDecision === APPROVAL_DECISIONS.APPROVED &&
    row.inventoryControlDecision === APPROVAL_DECISIONS.APPROVED &&
    row.managerDecision === APPROVAL_DECISIONS.APPROVED
  );
}

async function buildPreview(db: SeedClient): Promise<Preview> {
  const unflagged = await db
    .select({
      id: schema.materialPurchaseRequisitions.id,
      planningDecision: schema.materialPurchaseRequisitions.planningDecision,
      inventoryControlDecision: schema.materialPurchaseRequisitions.inventoryControlDecision,
      managerDecision: schema.materialPurchaseRequisitions.managerDecision,
    })
    .from(schema.materialPurchaseRequisitions)
    .where(eq(schema.materialPurchaseRequisitions.isPreGoLive, false));

  let approved = 0;
  let pending = 0;
  let rejected = 0;
  for (const row of unflagged) {
    if (isRejected(row)) rejected += 1;
    else if (isApproved(row)) approved += 1;
    else pending += 1;
  }

  const unflaggedIds = unflagged.map((row) => row.id);
  let allocationLinks = 0;
  if (unflaggedIds.length > 0) {
    const [linkRow] = await db
      .select({ count: count() })
      .from(schema.materialPurchaseOrderItemRequisitionItems)
      .innerJoin(
        schema.materialPurchaseRequisitionItems,
        eq(
          schema.materialPurchaseOrderItemRequisitionItems.materialPurchaseRequisitionItemId,
          schema.materialPurchaseRequisitionItems.id,
        ),
      )
      .where(inArray(schema.materialPurchaseRequisitionItems.materialPurchaseRequisitionId, unflaggedIds));
    allocationLinks = toCount(linkRow?.count);
  }

  return {
    total: unflagged.length,
    approved,
    pending,
    rejected,
    allocationLinks,
  };
}

async function promptExact(rl: readline.Interface, prompt: string, expected: string): Promise<void> {
  const answer = (await rl.question(prompt)).trim();
  if (answer !== expected) {
    throw new Error(
      `Confirmation failed. Expected "${expected}", got "${answer || '(empty)'}". No rows were updated.`,
    );
  }
}

async function confirmRun(
  db: SeedClient,
  databaseUrl: string,
): Promise<{ confirmed: boolean; preview: Preview }> {
  const preview = await buildPreview(db);
  const rl = readline.createInterface({ input, output });

  try {
    console.log('\n========== MARK PRE-GO-LIVE REQUISITIONS ==========');
    console.log('Resets planning / inventory-control / manager gates to pending');
    console.log('(clears decided_at, decided_by, decision_reason) and sets is_pre_go_live = true');
    console.log('on every material_purchase_requisitions row that is not already flagged.');
    console.log(`Database: ${maskConnectionString(databaseUrl)}`);
    console.log('All updates run in one transaction. A failure rolls back the entire run.\n');

    console.log(`Step 1 of 3 — unflagged requisitions: ${preview.total}`);
    console.log(`  approved (all gates): ${preview.approved}`);
    console.log(`  pending:              ${preview.pending}`);
    console.log(`  rejected (any gate):  ${preview.rejected}`);
    console.log(`  MPO allocation links: ${preview.allocationLinks}`);

    if (preview.total === 0) {
      console.log('\nNothing to update. Every requisition is already flagged.');
      return { confirmed: false, preview };
    }

    if (preview.allocationLinks > 0) {
      throw new Error(
        `Abort: ${preview.allocationLinks} MPO allocation link(s) exist on unflagged requisitions. ` +
          'Resetting gates would break "linked only when fully approved". Resolve links first.',
      );
    }

    await promptExact(rl, '\nType "continue" to review the update plan: ', 'continue');

    console.log('\nStep 2 of 3 — type the exact phrase to confirm.');
    console.log(`Phrase: ${CONFIRM_PHRASE}`);
    await promptExact(rl, `Type ${CONFIRM_PHRASE}: `, CONFIRM_PHRASE);

    console.log(`\nStep 3 of 3 — type the TOTAL unflagged count shown above (${preview.total}).`);
    await promptExact(rl, `Type ${preview.total}: `, String(preview.total));

    return { confirmed: true, preview };
  } finally {
    rl.close();
  }
}

async function updateAndVerify(tx: SeedClient, expectedTotal: number): Promise<number> {
  const updated = await tx
    .update(schema.materialPurchaseRequisitions)
    .set({
      planningDecision: APPROVAL_DECISIONS.PENDING,
      planningDecidedAt: null,
      planningDecidedBy: null,
      planningDecisionReason: null,
      inventoryControlDecision: APPROVAL_DECISIONS.PENDING,
      inventoryControlDecidedAt: null,
      inventoryControlDecidedBy: null,
      inventoryControlDecisionReason: null,
      managerDecision: APPROVAL_DECISIONS.PENDING,
      managerDecidedAt: null,
      managerDecidedBy: null,
      managerDecisionReason: null,
      isPreGoLive: true,
    })
    .where(eq(schema.materialPurchaseRequisitions.isPreGoLive, false))
    .returning({ id: schema.materialPurchaseRequisitions.id });

  const updatedCount = updated.length;
  console.log(`  updated ${String(updatedCount).padStart(8)}  material_purchase_requisitions`);

  if (updatedCount !== expectedTotal) {
    throw new Error(
      `Updated row count mismatch: expected ${expectedTotal}, actually updated ${updatedCount}. Rolling back.`,
    );
  }

  const [remaining] = await tx
    .select({ count: count() })
    .from(schema.materialPurchaseRequisitions)
    .where(eq(schema.materialPurchaseRequisitions.isPreGoLive, false));

  const remainingCount = toCount(remaining?.count);
  if (remainingCount !== 0) {
    throw new Error(
      `Post-update verification failed: ${remainingCount} unflagged requisition(s) still exist. Rolling back.`,
    );
  }

  return updatedCount;
}

async function main() {
  parseCliArgs();

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is not defined in .env');

  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle(pool, { schema });
  let transactionStarted = false;

  try {
    const { confirmed, preview } = await confirmRun(db, databaseUrl);
    if (!confirmed) return;

    console.log('\nUpdating in one database transaction...');
    await db.transaction(async (tx) => {
      transactionStarted = true;
      await tx.execute(sql`SET LOCAL statement_timeout = 0`);
      await tx.execute(sql`SET LOCAL idle_in_transaction_session_timeout = 0`);

      const updatedCount = await updateAndVerify(tx, preview.total);
      console.log(`\nPost-update verification: ${updatedCount} requisition(s) flagged as pre-go-live.`);
    });

    console.log('\nMark pre-go-live completed.');
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
