import { eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { parseArgs } from 'node:util';
import { stdin as input, stdout as output } from 'node:process';
import * as crypto from 'crypto';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as readline from 'node:readline/promises';
import * as schema from '../src/database/schema';
import * as xlsx from 'xlsx';
import { INVENTORY_TRANSACTION_TYPES, MATERIAL_TYPES, MATERIAL_UNITS, MATERIAL_UNIT_VALUES } from '../src/utils/constants';

dotenv.config();

const USAGE = `Usage: npm run seed:inventory-receipts [-- --email <email> | --id <uuid>]

Seeds historical goods-receipt workbooks from:
  - data/transactions/أذونات الإضافة لشهر 1.xlsx
  - data/transactions/أذونات الإضافة لشهر 2.xlsx
  - data/transactions/أذونات الإضافة لشهر 4.xlsx

If --email / --id are omitted, you will be prompted for an email or user ID.
The user must be an active admin.

Options:
  -e, --email <email>  Existing user email stamped as createdBy / receivedBy
  -i, --id <uuid>      Existing user ID stamped as createdBy / receivedBy
  -h, --help           Show this help

Examples:
  npm run seed:inventory-receipts
  npm run seed:inventory-receipts -- --email admin@example.com
  npm run seed:inventory-receipts -- --id 00000000-0000-0000-0000-000000000001`;

const DATA_FILES = [
  'أذونات الإضافة لشهر 1.xlsx',
  'أذونات الإضافة لشهر 2.xlsx',
  'أذونات الإضافة لشهر 4.xlsx',
] as const;

const DATA_DIR = path.join(__dirname, '../data/transactions');
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALID_UNITS = new Set<string>(MATERIAL_UNIT_VALUES);
const UNIT_MAP: Record<string, (typeof MATERIAL_UNIT_VALUES)[number]> = {
  عدد: MATERIAL_UNITS.COUNT,
  كيلو: MATERIAL_UNITS.KG,
  كجم: MATERIAL_UNITS.KG,
  متر: MATERIAL_UNITS.METER,
  count: MATERIAL_UNITS.COUNT,
  kg: MATERIAL_UNITS.KG,
  meter: MATERIAL_UNITS.METER,
};

type WorkbookRow = {
  sourceFile: string;
  sourceRowNumber: number;
  materialLegacyCode: string;
  title: string;
  unitRaw: string;
  quantity: number;
  unitPrice: number;
  invoiceNumber: string;
  invoiceDate: Date;
  vendorName: string;
  permitNumber: string;
  receiptDate: Date;
};

type InvalidRow = {
  sourceFile: string;
  sourceRowNumber: number;
  reason: string;
  materialLegacyCode?: string;
  title?: string;
};

type SkippedMaterial = {
  sourceFile: string;
  sourceRowNumber: number;
  legacyCode: string;
  title: string;
  reason: string;
};

type DuplicateOrderItemWarning = {
  groupKey: string;
  materialLegacyCode: string;
  titles: string[];
  quantities: number[];
  unitPrices: number[];
};

type Summary = {
  rowsLoaded: number;
  ordersCreated: number;
  orderItemsCreated: number;
  receiptsCreated: number;
  receiptItemsCreated: number;
  inventoryTransactionsCreated: number;
  inventoryTransactionItemsCreated: number;
  vendorsCreated: number;
  materialsCreated: number;
  skippedExistingPermitGroups: number;
  skippedPartialPermitGroups: number;
  invalidRowsSkipped: number;
  skippedRowsMissingMaterials: number;
};

type UserIdentifier = { email?: string; id?: string };
type DbClient = ReturnType<typeof drizzle<typeof schema>>;

function parseCliArgs(): UserIdentifier {
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

async function promptForUserIdentifier(partial: UserIdentifier): Promise<UserIdentifier> {
  if (partial.email || partial.id) return partial;

  const rl = readline.createInterface({ input, output });
  try {
    console.log('\nEnter the user to stamp as createdBy / receivedBy (email or user ID).');
    const answer = (await rl.question('Email or user ID: ')).trim();
    if (!answer) throw new Error('Email or user ID is required.');

    if (UUID_RE.test(answer)) return { id: answer };
    return { email: answer };
  } finally {
    rl.close();
  }
}

async function resolveUser(db: DbClient, identifier: UserIdentifier) {
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
    throw new Error(`User ${label} is not an admin. Only admins can seed inventory receipts.`);
  }

  return user;
}

function generateUniqueMaterialCode(existing: Set<string>): string {
  for (let attempt = 0; attempt < 1000; attempt++) {
    const code = String(crypto.randomInt(100_000, 1_000_000));
    if (!existing.has(code)) {
      existing.add(code);
      return code;
    }
  }

  throw new Error('Failed to generate a unique 6-digit material code after 1000 attempts.');
}

function normalizeText(value: unknown): string {
  if (value == null) return '';
  return String(value).replace(/\s+/g, ' ').trim();
}

function normalizeIdentifier(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'number') {
    return Number.isInteger(value) ? String(value) : String(value);
  }

  const trimmed = normalizeText(value);
  const asNumber = Number(trimmed);
  if (trimmed && Number.isFinite(asNumber) && String(asNumber) === trimmed && Number.isInteger(asNumber)) {
    return String(asNumber);
  }

  return trimmed;
}

function excelDateToDate(value: unknown, label: string): Date {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;

  if (typeof value === 'number') {
    const parsed = xlsx.SSF.parse_date_code(value);
    if (!parsed) throw new Error(`Invalid Excel serial date for ${label}: ${value}`);
    return new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d, 12, 0, 0));
  }

  const trimmed = normalizeText(value);
  if (!trimmed) throw new Error(`Missing ${label}`);

  const match = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) throw new Error(`Unsupported ${label} format: "${trimmed}"`);

  const [, dayStr, monthStr, yearStr] = match;
  const day = Number(dayStr);
  const month = Number(monthStr);
  const year = Number(yearStr);

  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
}

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function normalizeUnit(raw: string): (typeof MATERIAL_UNIT_VALUES)[number] {
  const trimmed = normalizeText(raw);
  if (!trimmed) return MATERIAL_UNITS.COUNT;
  const mapped = UNIT_MAP[trimmed];
  if (mapped && VALID_UNITS.has(mapped)) return mapped;
  if (VALID_UNITS.has(trimmed)) return trimmed as (typeof MATERIAL_UNIT_VALUES)[number];
  return MATERIAL_UNITS.COUNT;
}

function normalizeNumber(value: unknown, label: string): number {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`Invalid ${label}: ${value}`);
    return value;
  }

  const trimmed = normalizeText(value);
  if (!trimmed) throw new Error(`Missing ${label}`);

  const normalized = trimmed.replace(/,/g, '');
  const result = Number(normalized);
  if (!Number.isFinite(result)) throw new Error(`Invalid ${label}: "${trimmed}"`);
  return result;
}

function findColumnIndex(header: unknown[], aliases: string[]): number {
  const normalizedAliases = new Set(aliases.map((alias) => normalizeText(alias)));

  for (let i = 0; i < header.length; i++) {
    const cell = normalizeText(header[i]);
    if (normalizedAliases.has(cell)) return i;
  }

  return -1;
}

function loadWorkbookRows(): { rows: WorkbookRow[]; invalidRows: InvalidRow[] } {
  const rows: WorkbookRow[] = [];
  const invalidRows: InvalidRow[] = [];

  for (const fileName of DATA_FILES) {
    const workbookPath = path.join(DATA_DIR, fileName);
    const workbook = xlsx.readFile(workbookPath);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rawRows = xlsx.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null, raw: true });
    const headerRowIndex = rawRows.findIndex((row) =>
      row.some((cell) => typeof cell === 'string' && normalizeText(cell).includes('رقم إذن الإضافة')),
    );

    if (headerRowIndex < 0) {
      throw new Error(`Could not locate the header row in ${fileName}.`);
    }

    const header = rawRows[headerRowIndex];
    const materialCodeIdx = findColumnIndex(header, ['كود الصنف']);
    const titleIdx = findColumnIndex(header, ['الصنف']);
    const unitIdx = findColumnIndex(header, ['الوحدة']);
    const quantityIdx = findColumnIndex(header, ['الكمية']);
    const unitPriceIdx = findColumnIndex(header, ['السعر']);
    const invoiceNumberIdx = findColumnIndex(header, ['رقم الفاتورة']);
    const invoiceDateIdx = findColumnIndex(header, ['تاريخ الفاتورة']);
    const vendorNameIdx = findColumnIndex(header, ['اسم المورد', 'أسم المورد']);
    const permitNumberIdx = findColumnIndex(header, ['رقم إذن الإضافة']);
    const receiptDateIdx = findColumnIndex(header, ['تاريخ الإضافة']);

    const requiredIndices = [
      materialCodeIdx,
      titleIdx,
      unitIdx,
      quantityIdx,
      unitPriceIdx,
      invoiceNumberIdx,
      invoiceDateIdx,
      vendorNameIdx,
      permitNumberIdx,
      receiptDateIdx,
    ];
    if (requiredIndices.some((idx) => idx < 0)) {
      throw new Error(`Some expected columns were not found in ${fileName}.`);
    }

    for (let i = headerRowIndex + 1; i < rawRows.length; i++) {
      const rawRow = rawRows[i];
      const materialLegacyCode = normalizeIdentifier(rawRow[materialCodeIdx]);
      if (!materialLegacyCode) continue;

      try {
        const title = normalizeText(rawRow[titleIdx]);
        const vendorName = normalizeText(rawRow[vendorNameIdx]);
        const invoiceNumber = normalizeIdentifier(rawRow[invoiceNumberIdx]);
        const permitNumber = normalizeIdentifier(rawRow[permitNumberIdx]);
        const quantity = normalizeNumber(rawRow[quantityIdx], 'quantity');
        const unitPrice = normalizeNumber(rawRow[unitPriceIdx], 'unit price');
        const invoiceDate = excelDateToDate(rawRow[invoiceDateIdx], 'invoice date');
        const receiptDate = excelDateToDate(rawRow[receiptDateIdx], 'receipt date');

        if (!title) throw new Error('Missing material title');
        if (!vendorName) throw new Error('Missing vendor name');
        if (!invoiceNumber) throw new Error('Missing invoice number');
        if (!permitNumber) throw new Error('Missing permit number');
        if (quantity <= 0) throw new Error(`Quantity must be positive, got ${quantity}`);
        if (unitPrice <= 0) throw new Error(`Unit price must be positive, got ${unitPrice}`);

        rows.push({
          sourceFile: fileName,
          sourceRowNumber: i + 1,
          materialLegacyCode,
          title,
          unitRaw: normalizeText(rawRow[unitIdx]),
          quantity,
          unitPrice,
          invoiceNumber,
          invoiceDate,
          vendorName,
          permitNumber,
          receiptDate,
        });
      } catch (error) {
        invalidRows.push({
          sourceFile: fileName,
          sourceRowNumber: i + 1,
          reason: (error as Error).message,
          materialLegacyCode,
          title: normalizeText(rawRow[titleIdx]),
        });
      }
    }
  }

  return { rows, invalidRows };
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not defined in .env');

  const cli = parseCliArgs();
  const identifier = await promptForUserIdentifier(cli);
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool, { schema });

  const summary: Summary = {
    rowsLoaded: 0,
    ordersCreated: 0,
    orderItemsCreated: 0,
    receiptsCreated: 0,
    receiptItemsCreated: 0,
    inventoryTransactionsCreated: 0,
    inventoryTransactionItemsCreated: 0,
    vendorsCreated: 0,
    materialsCreated: 0,
    skippedExistingPermitGroups: 0,
    skippedPartialPermitGroups: 0,
    invalidRowsSkipped: 0,
    skippedRowsMissingMaterials: 0,
  };

  const skippedMaterials: SkippedMaterial[] = [];
  const duplicateOrderItemWarnings: DuplicateOrderItemWarning[] = [];

  try {
    const user = await resolveUser(db, identifier);
    console.log(`Using createdBy: ${user.name} <${user.email ?? 'no email'}> (${user.id})`);

    const { rows, invalidRows } = loadWorkbookRows();
    summary.rowsLoaded = rows.length;
    summary.invalidRowsSkipped = invalidRows.length;
    console.log(`Loaded ${rows.length} valid workbook rows`);
    if (invalidRows.length > 0) {
      console.log(`Skipped ${invalidRows.length} invalid row(s) during parsing`);
    }

    const categoryRows = await db
      .select({
        subId: schema.materialCategorySubs.id,
        subLegacyCode: schema.materialCategorySubs.legacyCode,
        mainLegacyCode: schema.materialCategoryMains.legacyCode,
      })
      .from(schema.materialCategorySubs)
      .innerJoin(
        schema.materialCategoryMains,
        eq(schema.materialCategorySubs.mainCategoryId, schema.materialCategoryMains.id),
      );

    const subcategoryByLegacyPair = new Map<string, string>();
    for (const row of categoryRows) {
      subcategoryByLegacyPair.set(`${row.mainLegacyCode}:${row.subLegacyCode}`, row.subId);
    }

    const existingMaterials = await db
      .select({
        code: schema.materials.code,
        legacyCode: schema.materials.legacyCode,
      })
      .from(schema.materials);

    const materialCodeByLegacy = new Map<string, string>();
    const usedMaterialCodes = new Set<string>();
    for (const material of existingMaterials) {
      usedMaterialCodes.add(material.code);
      if (material.legacyCode) materialCodeByLegacy.set(material.legacyCode, material.code);
    }

    const vendorRows = await db
      .select({
        id: schema.vendors.id,
        name: schema.vendors.name,
      })
      .from(schema.vendors);

    const vendorIdByName = new Map<string, string>();
    for (const vendor of vendorRows) {
      vendorIdByName.set(normalizeText(vendor.name), vendor.id);
    }

    const existingTransactions = await db
      .select({
        legacyNumber: schema.inventoryTransactions.legacyNumber,
      })
      .from(schema.inventoryTransactions);

    const existingPermitNumbers = new Set(
      existingTransactions.map((transaction) => transaction.legacyNumber).filter((value): value is string => Boolean(value)),
    );

    const orderGroups = new Map<string, WorkbookRow[]>();
    for (const row of rows) {
      const groupKey = `${row.vendorName}|${row.invoiceNumber}|${isoDay(row.invoiceDate)}`;
      const groupRows = orderGroups.get(groupKey);
      if (groupRows) groupRows.push(row);
      else orderGroups.set(groupKey, [row]);
    }

    let processedGroups = 0;
    for (const [groupKey, groupRows] of orderGroups) {
      const permitNumbers = [...new Set(groupRows.map((row) => row.permitNumber))];
      const existingPermits = permitNumbers.filter((permitNumber) => existingPermitNumbers.has(permitNumber));

      if (existingPermits.length === permitNumbers.length) {
        summary.skippedExistingPermitGroups++;
        continue;
      }

      if (existingPermits.length > 0) {
        summary.skippedPartialPermitGroups++;
        console.log(`Skipping partially seeded order group ${groupKey}; existing permits: ${existingPermits.join(', ')}`);
        continue;
      }

      await db.transaction(async (tx) => {
        const vendorName = groupRows[0].vendorName;
        let vendorId = vendorIdByName.get(vendorName);

        if (!vendorId) {
          const [createdVendor] = await tx
            .insert(schema.vendors)
            .values({
              code: sql`DEFAULT`,
              name: vendorName,
              createdBy: user.id,
            })
            .returning({ id: schema.vendors.id });

          vendorId = createdVendor.id;
          vendorIdByName.set(vendorName, vendorId);
          summary.vendorsCreated++;
        }

        const usableRows: Array<WorkbookRow & { materialCode: string }> = [];
        for (const row of groupRows) {
          let materialCode = materialCodeByLegacy.get(row.materialLegacyCode);
          if (!materialCode) {
            if (!/^1\d{7}$/.test(row.materialLegacyCode)) {
              skippedMaterials.push({
                sourceFile: row.sourceFile,
                sourceRowNumber: row.sourceRowNumber,
                legacyCode: row.materialLegacyCode,
                title: row.title,
                reason: 'Legacy material code must be 8 digits and start with 1',
              });
              summary.skippedRowsMissingMaterials++;
              continue;
            }

            const mainCategoryLegacyCode = row.materialLegacyCode.slice(1, 3);
            const subCategoryLegacyCode = row.materialLegacyCode.slice(3, 5);
            const subCategoryId = subcategoryByLegacyPair.get(`${mainCategoryLegacyCode}:${subCategoryLegacyCode}`);

            if (!subCategoryId) {
              skippedMaterials.push({
                sourceFile: row.sourceFile,
                sourceRowNumber: row.sourceRowNumber,
                legacyCode: row.materialLegacyCode,
                title: row.title,
                reason: `No material subcategory found for ${mainCategoryLegacyCode}/${subCategoryLegacyCode}`,
              });
              summary.skippedRowsMissingMaterials++;
              continue;
            }

            const [createdMaterial] = await tx
              .insert(schema.materials)
              .values({
                code: generateUniqueMaterialCode(usedMaterialCodes),
                legacyCode: row.materialLegacyCode,
                title: row.title,
                subCategoryId,
                materialType: MATERIAL_TYPES.RAW_MATERIALS,
                unitOfMeasurement: normalizeUnit(row.unitRaw),
                unitPrice: 0,
                quantity: 0,
                openingUnitPrice: 0,
                openingQuantity: 0,
                createdBy: user.id,
              })
              .returning({ code: schema.materials.code });

            materialCode = createdMaterial.code;
            materialCodeByLegacy.set(row.materialLegacyCode, materialCode);
            summary.materialsCreated++;
          }

          usableRows.push({ ...row, materialCode });
        }

        if (usableRows.length === 0) return;

        const invoiceDate = usableRows[0].invoiceDate;
        const completedAt = usableRows.reduce(
          (latest, row) => (row.receiptDate.getTime() > latest.getTime() ? row.receiptDate : latest),
          usableRows[0].receiptDate,
        );

        const orderItemGroups = new Map<string, Array<WorkbookRow & { materialCode: string }>>();
        for (const row of usableRows) {
          const existing = orderItemGroups.get(row.materialCode);
          if (existing) existing.push(row);
          else orderItemGroups.set(row.materialCode, [row]);
        }

        let totalAmount = 0;
        const mergedOrderItems = [...orderItemGroups.entries()].map(([materialCode, itemRows]) => {
          const quantityOrdered = itemRows.reduce((sum, row) => sum + row.quantity, 0);
          const totalCost = itemRows.reduce((sum, row) => sum + row.quantity * row.unitPrice, 0);
          const unitPrice = totalCost / quantityOrdered;

          if (itemRows.length > 1) {
            duplicateOrderItemWarnings.push({
              groupKey,
              materialLegacyCode: itemRows[0].materialLegacyCode,
              titles: itemRows.map((row) => row.title),
              quantities: itemRows.map((row) => row.quantity),
              unitPrices: itemRows.map((row) => row.unitPrice),
            });
          }

          totalAmount += quantityOrdered * unitPrice;
          return { materialCode, quantityOrdered, unitPrice };
        });

        const [createdOrder] = await tx
          .insert(schema.materialPurchaseOrders)
          .values({
            code: sql`DEFAULT`,
            vendorId,
            legacyInvoiceNumber: usableRows[0].invoiceNumber,
            totalAmount,
            completedAt,
            createdAt: invoiceDate,
            createdBy: user.id,
          })
          .returning({ id: schema.materialPurchaseOrders.id });

        summary.ordersCreated++;

        const createdOrderItems = await tx
          .insert(schema.materialPurchaseOrderItems)
          .values(
            mergedOrderItems.map((item) => ({
              materialPurchaseOrderId: createdOrder.id,
              materialCode: item.materialCode,
              quantityOrdered: item.quantityOrdered,
              unitPrice: item.unitPrice,
            })),
          )
          .returning({
            id: schema.materialPurchaseOrderItems.id,
            materialCode: schema.materialPurchaseOrderItems.materialCode,
          });

        summary.orderItemsCreated += createdOrderItems.length;

        const orderItemIdByMaterialCode = new Map(createdOrderItems.map((item) => [item.materialCode, item.id]));
        const receiptGroups = new Map<string, Array<WorkbookRow & { materialCode: string }>>();
        for (const row of usableRows) {
          const existing = receiptGroups.get(row.permitNumber);
          if (existing) existing.push(row);
          else receiptGroups.set(row.permitNumber, [row]);
        }

        for (const [permitNumber, receiptRows] of receiptGroups) {
          const receiptDate = receiptRows[0].receiptDate;

          const [createdReceipt] = await tx
            .insert(schema.materialPurchaseReceipts)
            .values({
              code: sql`DEFAULT`,
              materialPurchaseOrderId: createdOrder.id,
              receivedAt: receiptDate,
              receivedBy: user.id,
              createdAt: receiptDate,
              createdBy: user.id,
            })
            .returning({ id: schema.materialPurchaseReceipts.id });

          summary.receiptsCreated++;

          const createdReceiptItems = await tx
            .insert(schema.materialPurchaseReceiptItems)
            .values(
              receiptRows.map((row) => ({
                materialPurchaseReceiptId: createdReceipt.id,
                materialPurchaseOrderItemId: orderItemIdByMaterialCode.get(row.materialCode)!,
                quantityReceived: row.quantity,
                quantityRejected: 0,
              })),
            )
            .returning({
              id: schema.materialPurchaseReceiptItems.id,
              materialPurchaseOrderItemId: schema.materialPurchaseReceiptItems.materialPurchaseOrderItemId,
            });

          summary.receiptItemsCreated += createdReceiptItems.length;

          const receiptItemIdByOrderItemId = new Map(
            createdReceiptItems.map((item) => [item.materialPurchaseOrderItemId, item.id]),
          );

          const [createdTransaction] = await tx
            .insert(schema.inventoryTransactions)
            .values({
              code: sql`DEFAULT`,
              legacyNumber: permitNumber,
              transactionType: INVENTORY_TRANSACTION_TYPES.RECEIPT,
              createdAt: receiptDate,
              createdBy: user.id,
            })
            .returning({ id: schema.inventoryTransactions.id });

          summary.inventoryTransactionsCreated++;
          existingPermitNumbers.add(permitNumber);

          const createdInventoryItems = await tx.insert(schema.inventoryTransactionItems).values(
            receiptRows.map((row) => ({
              transactionId: createdTransaction.id,
              materialCode: row.materialCode,
              quantity: row.quantity,
              unitPrice: row.unitPrice,
              materialPurchaseReceiptItemId: receiptItemIdByOrderItemId.get(
                orderItemIdByMaterialCode.get(row.materialCode)!,
              )!,
            })),
          );

          summary.inventoryTransactionItemsCreated += receiptRows.length;
          void createdInventoryItems;
        }
      });

      processedGroups++;
      process.stdout.write(`\rProcessed ${processedGroups} / ${orderGroups.size} order groups`);
    }

    console.log();
    console.log('\n========== INVENTORY RECEIPTS SEED STATS ==========');
    console.log(`Workbook rows loaded:            ${summary.rowsLoaded}`);
    console.log(`Invalid rows skipped:           ${summary.invalidRowsSkipped}`);
    console.log(`Orders created:                 ${summary.ordersCreated}`);
    console.log(`Order items created:            ${summary.orderItemsCreated}`);
    console.log(`Receipts created:               ${summary.receiptsCreated}`);
    console.log(`Receipt items created:          ${summary.receiptItemsCreated}`);
    console.log(`Inventory transactions created: ${summary.inventoryTransactionsCreated}`);
    console.log(`Inventory items created:        ${summary.inventoryTransactionItemsCreated}`);
    console.log(`Vendors created:                ${summary.vendorsCreated}`);
    console.log(`Materials created:              ${summary.materialsCreated}`);
    console.log(`Existing permit groups skipped: ${summary.skippedExistingPermitGroups}`);
    console.log(`Partial groups skipped:         ${summary.skippedPartialPermitGroups}`);
    console.log(`Rows skipped for materials:     ${summary.skippedRowsMissingMaterials}`);

    if (invalidRows.length > 0) {
      console.log('\n--- Invalid rows skipped (samples) ---');
      for (const row of invalidRows.slice(0, 20)) {
        console.log(
          `  ${row.sourceFile} row ${row.sourceRowNumber}: ${row.materialLegacyCode ?? '(no code)'} | ${row.title ?? '(no title)'} | ${row.reason}`,
        );
      }
      if (invalidRows.length > 20) {
        console.log(`  ... and ${invalidRows.length - 20} more`);
      }
    }

    if (skippedMaterials.length > 0) {
      console.log('\n--- Rows skipped because materials could not be resolved/created ---');
      for (const row of skippedMaterials.slice(0, 30)) {
        console.log(`  ${row.sourceFile} row ${row.sourceRowNumber}: ${row.legacyCode} | ${row.title} | ${row.reason}`);
      }
      if (skippedMaterials.length > 30) {
        console.log(`  ... and ${skippedMaterials.length - 30} more`);
      }
    }

    if (duplicateOrderItemWarnings.length > 0) {
      console.log('\n--- Duplicate material rows merged inside one order group ---');
      for (const warning of duplicateOrderItemWarnings.slice(0, 20)) {
        console.log(
          `  ${warning.groupKey} | ${warning.materialLegacyCode} | titles=${warning.titles.join(' || ')} | qty=${warning.quantities.join(', ')} | prices=${warning.unitPrices.join(', ')}`,
        );
      }
      if (duplicateOrderItemWarnings.length > 20) {
        console.log(`  ... and ${duplicateOrderItemWarnings.length - 20} more`);
      }
    }

    console.log('===================================================');
    console.log('Legacy inventory receipt seed script completed.');
  } catch (error) {
    const err = error as Error & { cause?: { message?: string; detail?: string } };
    console.error(err.message);
    if (err.cause?.message) console.error(`Cause: ${err.cause.message}`);
    if (err.cause?.detail) console.error(`Detail: ${err.cause.detail}`);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

void main();
