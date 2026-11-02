import { and, eq, inArray, notInArray, or, sql, type SQL } from 'drizzle-orm';
import type { AnyPgColumn, PgTable } from 'drizzle-orm/pg-core';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { parseArgs } from 'node:util';
import { stdin as input, stdout as output } from 'node:process';
import * as readline from 'node:readline/promises';
import * as schema from '../../src/database/schema';
import * as dotenv from 'dotenv';

dotenv.config();

const USAGE = `Usage: npm run delete:product-category-main -- [options]

Permanently deletes one product_category_mains row and every catalog / line
row under it (subcategories, products, dimensions, BOM lines, production
routes, sales lines, serial units, and unit-linked child lines).

Parent documents (inquiries, previews, offers, contracts, deliveries,
installations, receptions, production plans, product purchase orders,
maintenance orders) are listed and KEPT. Inventory transaction rows stay;
production_plan_item_id is set to null when it pointed at a deleted plan
line. Materials, stock quantities, and audit_logs are not deleted.

All writes run in one database transaction. A failure rolls back the run.

This script requires interactive confirmations unless --dry-run is set.
There is no --force flag.

Options:
      --id <uuid>   product_category_mains.id (prompted if omitted)
      --dry-run     Print the plan and exit without writing
  -h, --help        Show this help

Examples:
  npm run delete:product-category-main
  npm run delete:product-category-main -- --id 00000000-0000-0000-0000-000000000000
  npm run delete:product-category-main -- --id 00000000-0000-0000-0000-000000000000 --dry-run`;

const CONFIRM_PHRASE = 'DELETE PRODUCT CATEGORY';
const ID_PRINT_LIMIT = 20;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Db = ReturnType<typeof drizzle<typeof schema>>;
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
type Client = Pick<Db, 'select' | 'delete' | 'update' | 'execute'>;

type CliArgs = {
  id?: string;
  dryRun: boolean;
};

type CountTarget = { name: string; count: number };

type IdCreatedDoc = { id: string; createdAt: Date; lineCount: number };
type CodedDoc = { id: string; code: string };

type Scope = {
  main: { id: string; title: string; legacyCode: string };
  subs: { id: string; title: string; legacyCode: string }[];
  products: { code: string; title: string; deletedAt: Date | null }[];
  dimensionIds: string[];
  contractItemIds: string[];
  unitIds: string[];
  planItemIds: string[];
  ppoItemIds: string[];
  productCodes: string[];
  subIds: string[];
  counts: CountTarget[];
  unlinkInventoryCount: number;
  documents: {
    inquiries: IdCreatedDoc[];
    previews: IdCreatedDoc[];
    offers: IdCreatedDoc[];
    contracts: CodedDoc[];
    deliveries: CodedDoc[];
    installations: CodedDoc[];
    receptions: CodedDoc[];
    productionPlans: CodedDoc[];
    productPurchaseOrders: CodedDoc[];
    maintenanceOrders: CodedDoc[];
  };
};

function parseCliArgs(): CliArgs {
  try {
    const { values } = parseArgs({
      options: {
        help: { type: 'boolean', short: 'h' },
        id: { type: 'string' },
        'dry-run': { type: 'boolean', default: false },
      },
      allowPositionals: false,
    });

    if (values.help) {
      console.log(USAGE);
      process.exit(0);
    }

    return {
      id: values.id?.trim() || undefined,
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

function assertUuid(value: string, label: string): string {
  const trimmed = value.trim();
  if (!UUID_RE.test(trimmed)) {
    throw new Error(`Invalid ${label}: "${trimmed || '(empty)'}". Expected a UUID.`);
  }
  return trimmed;
}

async function promptExact(rl: readline.Interface, prompt: string, expected: string): Promise<void> {
  const answer = (await rl.question(prompt)).trim();
  if (answer !== expected) {
    throw new Error(`Confirmation failed. Expected "${expected}", got "${answer || '(empty)'}". No rows were deleted.`);
  }
}

async function promptForId(partial: string | undefined): Promise<string> {
  if (partial) return assertUuid(partial, 'main category id');

  const rl = readline.createInterface({ input, output });
  try {
    const answer = (await rl.question('Main category id: ')).trim();
    if (!answer) throw new Error('Main category id is required.');
    return assertUuid(answer, 'main category id');
  } finally {
    rl.close();
  }
}

function printCapped(title: string, lines: string[]): void {
  console.log(`${title} (${lines.length})`);
  if (lines.length === 0) {
    console.log('  (none)');
    return;
  }

  for (const line of lines.slice(0, ID_PRINT_LIMIT)) {
    console.log(`  ${line}`);
  }

  const extra = lines.length - ID_PRINT_LIMIT;
  if (extra > 0) console.log(`  ... and ${extra} more`);
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

function productScopeFilter(
  productCodeCol: AnyPgColumn,
  dimensionCol: AnyPgColumn,
  productCodes: string[],
  dimensionIds: string[],
): SQL | undefined {
  if (productCodes.length > 0 && dimensionIds.length > 0) {
    return or(inArray(productCodeCol, productCodes), inArray(dimensionCol, dimensionIds));
  }
  if (productCodes.length > 0) return inArray(productCodeCol, productCodes);
  if (dimensionIds.length > 0) return inArray(dimensionCol, dimensionIds);
  return undefined;
}

async function countIn(db: Client, table: PgTable, column: AnyPgColumn, ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(table)
    .where(inArray(column, ids));
  return toCount(row?.count);
}

async function loadCodedDocs(rows: Promise<{ id: string; code: string }[]>): Promise<CodedDoc[]> {
  const list = await rows;
  list.sort((a, b) => a.code.localeCompare(b.code));
  return list;
}

async function loadScope(db: Client, mainId: string): Promise<Scope> {
  const [main] = await db
    .select({
      id: schema.productCategoryMains.id,
      title: schema.productCategoryMains.title,
      legacyCode: schema.productCategoryMains.legacyCode,
    })
    .from(schema.productCategoryMains)
    .where(eq(schema.productCategoryMains.id, mainId))
    .limit(1);

  if (!main) throw new Error(`No product_category_mains row for id ${mainId}.`);

  const subs = await db
    .select({
      id: schema.productCategorySubs.id,
      title: schema.productCategorySubs.title,
      legacyCode: schema.productCategorySubs.legacyCode,
    })
    .from(schema.productCategorySubs)
    .where(eq(schema.productCategorySubs.mainCategoryId, main.id));

  const subIds = subs.map((row) => row.id);

  const products =
    subIds.length === 0
      ? []
      : await db
          .select({
            code: schema.products.code,
            title: schema.products.title,
            deletedAt: schema.products.deletedAt,
          })
          .from(schema.products)
          .where(inArray(schema.products.subCategoryId, subIds));

  const productCodes = products.map((row) => row.code);

  const dimensionIds =
    productCodes.length === 0
      ? []
      : (
          await db
            .select({ id: schema.productDimensions.id })
            .from(schema.productDimensions)
            .where(inArray(schema.productDimensions.productCode, productCodes))
        ).map((row) => row.id);

  const itemFilter = productScopeFilter(
    schema.inquiryItems.productCode,
    schema.inquiryItems.productDimensionId,
    productCodes,
    dimensionIds,
  );

  const contractItemIds = itemFilter
    ? (
        await db
          .select({ id: schema.contractItems.id })
          .from(schema.contractItems)
          .where(
            productScopeFilter(
              schema.contractItems.productCode,
              schema.contractItems.productDimensionId,
              productCodes,
              dimensionIds,
            )!,
          )
      ).map((row) => row.id)
    : [];

  const unitIds =
    contractItemIds.length === 0
      ? []
      : (
          await db
            .select({ id: schema.productUnits.id })
            .from(schema.productUnits)
            .where(inArray(schema.productUnits.contractItemId, contractItemIds))
        ).map((row) => row.id);

  const planItemIds =
    unitIds.length === 0
      ? []
      : (
          await db
            .select({ id: schema.productionPlanItems.id })
            .from(schema.productionPlanItems)
            .where(inArray(schema.productionPlanItems.productUnitId, unitIds))
        ).map((row) => row.id);

  const ppoItemIds =
    contractItemIds.length === 0
      ? []
      : (
          await db
            .select({ id: schema.productPurchaseOrderItems.id })
            .from(schema.productPurchaseOrderItems)
            .where(inArray(schema.productPurchaseOrderItems.contractItemId, contractItemIds))
        ).map((row) => row.id);

  const [standardBomCount, routeCount, noteCount, inquiryItemCount, previewItemCount, offerItemCount] =
    await Promise.all([
      countIn(db, schema.productStandardBoms, schema.productStandardBoms.productDimensionId, dimensionIds),
      countIn(db, schema.productProductionRoutes, schema.productProductionRoutes.productCode, productCodes),
      countIn(db, schema.productionPlanItemNotes, schema.productionPlanItemNotes.planItemId, planItemIds),
      itemFilter
        ? toCount(
            (
              await db
                .select({ count: sql<number>`count(*)::int` })
                .from(schema.inquiryItems)
                .where(
                  productScopeFilter(
                    schema.inquiryItems.productCode,
                    schema.inquiryItems.productDimensionId,
                    productCodes,
                    dimensionIds,
                  )!,
                )
            )[0]?.count,
          )
        : 0,
      itemFilter
        ? toCount(
            (
              await db
                .select({ count: sql<number>`count(*)::int` })
                .from(schema.previewItems)
                .where(
                  productScopeFilter(
                    schema.previewItems.productCode,
                    schema.previewItems.productDimensionId,
                    productCodes,
                    dimensionIds,
                  )!,
                )
            )[0]?.count,
          )
        : 0,
      itemFilter
        ? toCount(
            (
              await db
                .select({ count: sql<number>`count(*)::int` })
                .from(schema.offerItems)
                .where(
                  productScopeFilter(
                    schema.offerItems.productCode,
                    schema.offerItems.productDimensionId,
                    productCodes,
                    dimensionIds,
                  )!,
                )
            )[0]?.count,
          )
        : 0,
    ]);

  const [deliveryItemCount, installationItemCount, receptionItemCount, maintenanceItemCount, requisitionLinkCount] =
    await Promise.all([
      countIn(db, schema.deliveryItems, schema.deliveryItems.productUnitId, unitIds),
      countIn(db, schema.installationItems, schema.installationItems.productUnitId, unitIds),
      countIn(db, schema.customerReceptionItems, schema.customerReceptionItems.productUnitId, unitIds),
      countIn(db, schema.maintenanceOrderItems, schema.maintenanceOrderItems.productUnitId, unitIds),
      countIn(
        db,
        schema.materialPurchaseRequisitionItemContractItems,
        schema.materialPurchaseRequisitionItemContractItems.contractItemId,
        contractItemIds,
      ),
    ]);

  let receiptItemCount = 0;
  if (unitIds.length > 0 || ppoItemIds.length > 0) {
    const parts: SQL[] = [];
    if (unitIds.length > 0) parts.push(inArray(schema.productPurchaseReceiptItems.productUnitId, unitIds));
    if (ppoItemIds.length > 0) {
      parts.push(inArray(schema.productPurchaseReceiptItems.productPurchaseOrderItemId, ppoItemIds));
    }
    const where = parts.length === 1 ? parts[0] : or(...parts);
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.productPurchaseReceiptItems)
      .where(where);
    receiptItemCount = toCount(row?.count);
  }

  const unlinkInventoryCount = await countIn(
    db,
    schema.inventoryTransactions,
    schema.inventoryTransactions.productionPlanItemId,
    planItemIds,
  );

  const inquiries = itemFilter
    ? await db
        .select({
          id: schema.inquiries.id,
          createdAt: schema.inquiries.createdAt,
          lineCount: sql<number>`count(*)::int`,
        })
        .from(schema.inquiryItems)
        .innerJoin(schema.inquiries, eq(schema.inquiryItems.inquiryId, schema.inquiries.id))
        .where(
          productScopeFilter(
            schema.inquiryItems.productCode,
            schema.inquiryItems.productDimensionId,
            productCodes,
            dimensionIds,
          )!,
        )
        .groupBy(schema.inquiries.id, schema.inquiries.createdAt)
    : [];

  const previews = itemFilter
    ? await db
        .select({
          id: schema.previews.id,
          createdAt: schema.previews.createdAt,
          lineCount: sql<number>`count(*)::int`,
        })
        .from(schema.previewItems)
        .innerJoin(schema.previews, eq(schema.previewItems.previewId, schema.previews.id))
        .where(
          productScopeFilter(
            schema.previewItems.productCode,
            schema.previewItems.productDimensionId,
            productCodes,
            dimensionIds,
          )!,
        )
        .groupBy(schema.previews.id, schema.previews.createdAt)
    : [];

  const offers = itemFilter
    ? await db
        .select({
          id: schema.offers.id,
          createdAt: schema.offers.createdAt,
          lineCount: sql<number>`count(*)::int`,
        })
        .from(schema.offerItems)
        .innerJoin(schema.offers, eq(schema.offerItems.offerId, schema.offers.id))
        .where(
          productScopeFilter(
            schema.offerItems.productCode,
            schema.offerItems.productDimensionId,
            productCodes,
            dimensionIds,
          )!,
        )
        .groupBy(schema.offers.id, schema.offers.createdAt)
    : [];

  const contracts = itemFilter
    ? await loadCodedDocs(
        db
          .select({ id: schema.contracts.id, code: schema.contracts.code })
          .from(schema.contractItems)
          .innerJoin(schema.contracts, eq(schema.contractItems.contractId, schema.contracts.id))
          .where(
            productScopeFilter(
              schema.contractItems.productCode,
              schema.contractItems.productDimensionId,
              productCodes,
              dimensionIds,
            )!,
          )
          .groupBy(schema.contracts.id, schema.contracts.code),
      )
    : [];

  const deliveries =
    unitIds.length === 0
      ? []
      : await loadCodedDocs(
          db
            .select({ id: schema.deliveries.id, code: schema.deliveries.code })
            .from(schema.deliveryItems)
            .innerJoin(schema.deliveries, eq(schema.deliveryItems.deliveryId, schema.deliveries.id))
            .where(inArray(schema.deliveryItems.productUnitId, unitIds))
            .groupBy(schema.deliveries.id, schema.deliveries.code),
        );

  const installations =
    unitIds.length === 0
      ? []
      : await loadCodedDocs(
          db
            .select({ id: schema.installations.id, code: schema.installations.code })
            .from(schema.installationItems)
            .innerJoin(schema.installations, eq(schema.installationItems.installationId, schema.installations.id))
            .where(inArray(schema.installationItems.productUnitId, unitIds))
            .groupBy(schema.installations.id, schema.installations.code),
        );

  const receptions =
    unitIds.length === 0
      ? []
      : await loadCodedDocs(
          db
            .select({ id: schema.customerReceptions.id, code: schema.customerReceptions.code })
            .from(schema.customerReceptionItems)
            .innerJoin(
              schema.customerReceptions,
              eq(schema.customerReceptionItems.customerReceptionId, schema.customerReceptions.id),
            )
            .where(inArray(schema.customerReceptionItems.productUnitId, unitIds))
            .groupBy(schema.customerReceptions.id, schema.customerReceptions.code),
        );

  const productionPlans =
    unitIds.length === 0
      ? []
      : await loadCodedDocs(
          db
            .select({ id: schema.productionPlans.id, code: schema.productionPlans.code })
            .from(schema.productionPlanItems)
            .innerJoin(schema.productionPlans, eq(schema.productionPlanItems.planId, schema.productionPlans.id))
            .where(inArray(schema.productionPlanItems.productUnitId, unitIds))
            .groupBy(schema.productionPlans.id, schema.productionPlans.code),
        );

  const productPurchaseOrders =
    contractItemIds.length === 0
      ? []
      : await loadCodedDocs(
          db
            .select({ id: schema.productPurchaseOrders.id, code: schema.productPurchaseOrders.code })
            .from(schema.productPurchaseOrderItems)
            .innerJoin(
              schema.productPurchaseOrders,
              eq(schema.productPurchaseOrderItems.productPurchaseOrderId, schema.productPurchaseOrders.id),
            )
            .where(inArray(schema.productPurchaseOrderItems.contractItemId, contractItemIds))
            .groupBy(schema.productPurchaseOrders.id, schema.productPurchaseOrders.code),
        );

  const maintenanceOrders =
    unitIds.length === 0
      ? []
      : await loadCodedDocs(
          db
            .select({ id: schema.maintenanceOrders.id, code: schema.maintenanceOrders.code })
            .from(schema.maintenanceOrderItems)
            .innerJoin(
              schema.maintenanceOrders,
              eq(schema.maintenanceOrderItems.maintenanceOrderId, schema.maintenanceOrders.id),
            )
            .where(inArray(schema.maintenanceOrderItems.productUnitId, unitIds))
            .groupBy(schema.maintenanceOrders.id, schema.maintenanceOrders.code),
        );

  inquiries.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  previews.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  offers.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  const counts: CountTarget[] = [
    { name: 'production_plan_item_notes', count: noteCount },
    { name: 'production_plan_items', count: planItemIds.length },
    { name: 'delivery_items', count: deliveryItemCount },
    { name: 'installation_items', count: installationItemCount },
    { name: 'customer_reception_items', count: receptionItemCount },
    { name: 'maintenance_order_items', count: maintenanceItemCount },
    { name: 'product_purchase_receipt_items', count: receiptItemCount },
    { name: 'product_purchase_order_items', count: ppoItemIds.length },
    { name: 'product_units', count: unitIds.length },
    { name: 'material_purchase_requisition_item_contract_items', count: requisitionLinkCount },
    { name: 'contract_items', count: contractItemIds.length },
    { name: 'inquiry_items', count: inquiryItemCount },
    { name: 'preview_items', count: previewItemCount },
    { name: 'offer_items', count: offerItemCount },
    { name: 'product_standard_boms', count: standardBomCount },
    { name: 'product_production_routes', count: routeCount },
    { name: 'product_dimensions', count: dimensionIds.length },
    { name: 'products', count: products.length },
    { name: 'product_category_subs', count: subs.length },
    { name: 'product_category_mains', count: 1 },
  ];

  return {
    main,
    subs,
    products,
    dimensionIds,
    contractItemIds,
    unitIds,
    planItemIds,
    ppoItemIds,
    productCodes,
    subIds,
    counts,
    unlinkInventoryCount,
    documents: {
      inquiries,
      previews,
      offers,
      contracts,
      deliveries,
      installations,
      receptions,
      productionPlans,
      productPurchaseOrders,
      maintenanceOrders,
    },
  };
}

function formatIdCreated(row: IdCreatedDoc): string {
  return `${row.id}  ${row.createdAt.toISOString()}  ${toCount(row.lineCount)} line(s)`;
}

function printScope(scope: Scope, databaseUrl: string, dryRun: boolean): void {
  console.log('\n========== DELETE PRODUCT MAIN CATEGORY ==========');
  console.log(`Main: ${scope.main.title}`);
  console.log(`  id:           ${scope.main.id}`);
  console.log(`  legacy_code:  ${scope.main.legacyCode}`);
  if (dryRun) console.log('Mode: dry-run (no writes)');
  console.log(`Database: ${maskConnectionString(databaseUrl)}`);
  console.log('All deletes run in one transaction. A failure rolls back the entire run.\n');

  printCapped(
    'Subcategories',
    scope.subs.map((row) => `${row.title}  (${row.legacyCode})  ${row.id}`),
  );
  printCapped(
    'Products',
    scope.products.map((row) => `${row.code}  ${row.title}${row.deletedAt ? '  [deleted]' : ''}`),
  );

  console.log('\nRelated documents (headers KEPT; matching child lines deleted):');
  printCapped('  Inquiries', scope.documents.inquiries.map(formatIdCreated));
  printCapped('  Previews', scope.documents.previews.map(formatIdCreated));
  printCapped('  Offers', scope.documents.offers.map(formatIdCreated));
  printCapped(
    '  Contracts',
    scope.documents.contracts.map((row) => row.code),
  );
  printCapped(
    '  Deliveries',
    scope.documents.deliveries.map((row) => row.code),
  );
  printCapped(
    '  Installations',
    scope.documents.installations.map((row) => row.code),
  );
  printCapped(
    '  Customer receptions',
    scope.documents.receptions.map((row) => row.code),
  );
  printCapped(
    '  Production plans',
    scope.documents.productionPlans.map((row) => row.code),
  );
  printCapped(
    '  Product purchase orders',
    scope.documents.productPurchaseOrders.map((row) => row.code),
  );
  printCapped(
    '  Maintenance orders',
    scope.documents.maintenanceOrders.map((row) => row.code),
  );

  console.log('\nNot deleted:');
  console.log('  Parent document headers listed above');
  console.log('  materials, materials.quantity / unit_price');
  console.log(
    `  inventory_transactions rows (${scope.unlinkInventoryCount} production_plan_item_id value(s) will be set to null)`,
  );
  console.log('  audit_logs');

  console.log('');
  printCounts(scope.counts, 'Rows that will be deleted');
}

async function confirmDeletion(mainId: string): Promise<void> {
  const rl = readline.createInterface({ input, output });
  try {
    await promptExact(rl, '\nType "continue" to review the delete plan: ', 'continue');

    console.log('\nStep 2 of 3 - type the exact phrase to confirm deletion.');
    console.log(`Phrase: ${CONFIRM_PHRASE}`);
    await promptExact(rl, `Type ${CONFIRM_PHRASE}: `, CONFIRM_PHRASE);

    console.log(`\nStep 3 of 3 - type the main category id (${mainId}).`);
    await promptExact(rl, `Type ${mainId}: `, mainId);
  } finally {
    rl.close();
  }
}

function logDeleted(name: string, count: number): void {
  console.log(`  deleted ${String(count).padStart(8)}  ${name}`);
}

async function deleteIn(
  tx: Tx,
  table: PgTable,
  column: AnyPgColumn,
  ids: string[],
  name: string,
): Promise<number> {
  if (ids.length === 0) {
    logDeleted(name, 0);
    return 0;
  }

  const deleted = await tx.delete(table).where(inArray(column, ids)).returning();
  logDeleted(name, deleted.length);
  return deleted.length;
}

async function deleteWhere(tx: Tx, table: PgTable, where: SQL, name: string): Promise<number> {
  const deleted = await tx.delete(table).where(where).returning();
  logDeleted(name, deleted.length);
  return deleted.length;
}

async function deleteCategory(tx: Tx, scope: Scope): Promise<void> {
  if (scope.planItemIds.length > 0) {
    const unlinked = await tx
      .update(schema.inventoryTransactions)
      .set({ productionPlanItemId: null })
      .where(inArray(schema.inventoryTransactions.productionPlanItemId, scope.planItemIds))
      .returning({ id: schema.inventoryTransactions.id });
    console.log(
      `  unlinked ${String(unlinked.length).padStart(8)}  inventory_transactions.production_plan_item_id`,
    );
  } else {
    console.log(`  unlinked ${String(0).padStart(8)}  inventory_transactions.production_plan_item_id`);
  }

  await deleteIn(
    tx,
    schema.productionPlanItemNotes,
    schema.productionPlanItemNotes.planItemId,
    scope.planItemIds,
    'production_plan_item_notes',
  );
  await deleteIn(tx, schema.productionPlanItems, schema.productionPlanItems.id, scope.planItemIds, 'production_plan_items');
  await deleteIn(tx, schema.deliveryItems, schema.deliveryItems.productUnitId, scope.unitIds, 'delivery_items');
  await deleteIn(
    tx,
    schema.installationItems,
    schema.installationItems.productUnitId,
    scope.unitIds,
    'installation_items',
  );
  await deleteIn(
    tx,
    schema.customerReceptionItems,
    schema.customerReceptionItems.productUnitId,
    scope.unitIds,
    'customer_reception_items',
  );
  await deleteIn(
    tx,
    schema.maintenanceOrderItems,
    schema.maintenanceOrderItems.productUnitId,
    scope.unitIds,
    'maintenance_order_items',
  );

  if (scope.unitIds.length > 0 || scope.ppoItemIds.length > 0) {
    const parts: SQL[] = [];
    if (scope.unitIds.length > 0) {
      parts.push(inArray(schema.productPurchaseReceiptItems.productUnitId, scope.unitIds));
    }
    if (scope.ppoItemIds.length > 0) {
      parts.push(inArray(schema.productPurchaseReceiptItems.productPurchaseOrderItemId, scope.ppoItemIds));
    }
    const where = parts.length === 1 ? parts[0]! : or(...parts)!;
    await deleteWhere(tx, schema.productPurchaseReceiptItems, where, 'product_purchase_receipt_items');
  } else {
    logDeleted('product_purchase_receipt_items', 0);
  }

  await deleteIn(
    tx,
    schema.productPurchaseOrderItems,
    schema.productPurchaseOrderItems.id,
    scope.ppoItemIds,
    'product_purchase_order_items',
  );
  await deleteIn(tx, schema.productUnits, schema.productUnits.id, scope.unitIds, 'product_units');
  await deleteIn(
    tx,
    schema.materialPurchaseRequisitionItemContractItems,
    schema.materialPurchaseRequisitionItemContractItems.contractItemId,
    scope.contractItemIds,
    'material_purchase_requisition_item_contract_items',
  );

  if (scope.contractItemIds.length > 0) {
    const cleared = await tx
      .update(schema.contractItems)
      .set({ previousVersionId: null })
      .where(
        and(
          inArray(schema.contractItems.previousVersionId, scope.contractItemIds),
          notInArray(schema.contractItems.id, scope.contractItemIds),
        ),
      )
      .returning({ id: schema.contractItems.id });
    console.log(
      `  cleared  ${String(cleared.length).padStart(8)}  contract_items.previous_version_id (outside scope)`,
    );
  }

  await deleteIn(tx, schema.contractItems, schema.contractItems.id, scope.contractItemIds, 'contract_items');

  const inquiryFilter = productScopeFilter(
    schema.inquiryItems.productCode,
    schema.inquiryItems.productDimensionId,
    scope.productCodes,
    scope.dimensionIds,
  );
  if (inquiryFilter) {
    await deleteWhere(tx, schema.inquiryItems, inquiryFilter, 'inquiry_items');
    await deleteWhere(
      tx,
      schema.previewItems,
      productScopeFilter(
        schema.previewItems.productCode,
        schema.previewItems.productDimensionId,
        scope.productCodes,
        scope.dimensionIds,
      )!,
      'preview_items',
    );
    await deleteWhere(
      tx,
      schema.offerItems,
      productScopeFilter(
        schema.offerItems.productCode,
        schema.offerItems.productDimensionId,
        scope.productCodes,
        scope.dimensionIds,
      )!,
      'offer_items',
    );
  } else {
    logDeleted('inquiry_items', 0);
    logDeleted('preview_items', 0);
    logDeleted('offer_items', 0);
  }

  await deleteIn(
    tx,
    schema.productStandardBoms,
    schema.productStandardBoms.productDimensionId,
    scope.dimensionIds,
    'product_standard_boms',
  );
  await deleteIn(
    tx,
    schema.productProductionRoutes,
    schema.productProductionRoutes.productCode,
    scope.productCodes,
    'product_production_routes',
  );
  await deleteIn(tx, schema.productDimensions, schema.productDimensions.id, scope.dimensionIds, 'product_dimensions');
  await deleteIn(tx, schema.products, schema.products.code, scope.productCodes, 'products');
  await deleteIn(tx, schema.productCategorySubs, schema.productCategorySubs.id, scope.subIds, 'product_category_subs');

  const mains = await tx
    .delete(schema.productCategoryMains)
    .where(eq(schema.productCategoryMains.id, scope.main.id))
    .returning({ id: schema.productCategoryMains.id });
  logDeleted('product_category_mains', mains.length);
  if (mains.length !== 1) {
    throw new Error(`Expected to delete 1 product_category_mains row, deleted ${mains.length}.`);
  }
}

async function assertGone(tx: Client, scope: Scope): Promise<void> {
  const leftover: string[] = [];

  const [main] = await tx
    .select({ id: schema.productCategoryMains.id })
    .from(schema.productCategoryMains)
    .where(eq(schema.productCategoryMains.id, scope.main.id))
    .limit(1);
  if (main) leftover.push('product_category_mains');

  if (scope.subIds.length > 0) {
    const remainingSubs = await countIn(tx, schema.productCategorySubs, schema.productCategorySubs.id, scope.subIds);
    if (remainingSubs > 0) leftover.push(`product_category_subs (${remainingSubs})`);
  }

  if (scope.productCodes.length > 0) {
    const remainingProducts = await countIn(tx, schema.products, schema.products.code, scope.productCodes);
    if (remainingProducts > 0) leftover.push(`products (${remainingProducts})`);
  }

  if (scope.planItemIds.length > 0) {
    const remainingLinks = await countIn(
      tx,
      schema.inventoryTransactions,
      schema.inventoryTransactions.productionPlanItemId,
      scope.planItemIds,
    );
    if (remainingLinks > 0) leftover.push(`inventory_transactions.production_plan_item_id (${remainingLinks})`);
  }

  if (leftover.length > 0) {
    throw new Error(`Post-delete verification failed; rolling back.\n  ${leftover.join('\n  ')}`);
  }
}

async function main() {
  const args = parseCliArgs();

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is not defined in .env');

  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle(pool, { schema });
  let transactionStarted = false;

  try {
    const mainId = await promptForId(args.id);
    const scope = await loadScope(db, mainId);
    printScope(scope, databaseUrl, args.dryRun);

    if (args.dryRun) {
      console.log('\nDry run. No rows were deleted.');
      return;
    }

    console.log('\nStep 1 of 3 - review the listing above.');
    await confirmDeletion(scope.main.id);

    console.log('\nDeleting in one database transaction...');
    await db.transaction(async (tx) => {
      transactionStarted = true;
      await tx.execute(sql`SET LOCAL statement_timeout = 0`);
      await tx.execute(sql`SET LOCAL idle_in_transaction_session_timeout = 0`);

      await deleteCategory(tx, scope);
      await assertGone(tx, scope);
      console.log('\nPost-delete verification: main category and scoped catalog rows are gone.');
    });

    console.log('\nDelete completed. Parent document headers were kept.');
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
