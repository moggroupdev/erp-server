import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import { parseArgs } from 'node:util';
import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import * as schema from '../src/database/schema';
import { PRODUCT_SOURCE_TYPE_VALUES, DIMENSION_UNIT_VALUES } from '../src/utils/constants';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

dotenv.config();

const USAGE = `Usage: npm run seed:products [-- --email <email> | --id <uuid>]

Seeds products from data/products/results/clean-products.json.

Requires:
  - npm run seed:categories (so product categories exist)

If --email / --id are omitted, you will be prompted for an email or user ID.
The user must be an active admin.

Options:
  -e, --email <email>  Existing user email stamped as createdBy
  -i, --id <uuid>      Existing user ID stamped as createdBy
  -h, --help           Show this help

Examples:
  npm run seed:products
  npm run seed:products -- --email admin@example.com
  npm run seed:products -- --id 00000000-0000-0000-0000-000000000001`;

type CleanProduct = {
  title: string;
  description: string | null;
  mainCategoryLegacyCode: string;
  subCategoryLegacyCode: string;
  sourceType: string;
  estimatedProductionTime: number | null;
  pricingFactor: number;
  dimensions: CleanDimension[];
};

type CleanDimension = {
  length: number | null;
  depth: number | null;
  height: number | null;
  dimensionUnit: string;
  isDefault: boolean;
};

type ValidDimension = {
  length: number;
  depth: number;
  height: number;
  dimensionUnit: string;
  isDefault: boolean;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BATCH_SIZE = 100;

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
    throw new Error(`User ${label} is not an admin. Only admins can seed products.`);
  }

  return user;
}

function normalizeTitle(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toLowerCase();
}

function isValidDimension(
  d: CleanDimension,
): d is { length: number; depth: number; height: number; dimensionUnit: string; isDefault: boolean } {
  return d.length != null && d.depth != null && d.height != null;
}

function normalizeDimensions(dims: CleanDimension[]): ValidDimension[] {
  const valid = dims.filter(isValidDimension);
  if (valid.length > 0) {
    valid[0].isDefault = true;
    for (let i = 1; i < valid.length; i++) {
      valid[i].isDefault = false;
    }
  }
  return valid;
}

function generateUniqueCode(existing: Set<string>): string {
  for (let attempt = 0; attempt < 1000; attempt++) {
    const code = String(crypto.randomInt(100_000, 1_000_000));
    if (!existing.has(code)) {
      existing.add(code);
      return code;
    }
  }
  throw new Error('Failed to generate a unique 6-digit product code after 1000 attempts.');
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

    const productsPath = path.join(__dirname, '../data/products/results/clean-products.json');
    if (!fs.existsSync(productsPath)) {
      throw new Error(`Products JSON not found: ${productsPath}\nRun npm run extract:products first.`);
    }

    const cleanProducts = JSON.parse(fs.readFileSync(productsPath, 'utf-8')) as CleanProduct[];

    const categoryRows = await db
      .select({
        subId: schema.productCategorySubs.id,
        subLegacyCode: schema.productCategorySubs.legacyCode,
        mainLegacyCode: schema.productCategoryMains.legacyCode,
      })
      .from(schema.productCategorySubs)
      .innerJoin(schema.productCategoryMains, eq(schema.productCategorySubs.mainCategoryId, schema.productCategoryMains.id));

    const categoryMap = new Map<string, string>();
    for (const row of categoryRows) {
      categoryMap.set(`${row.mainLegacyCode}:${row.subLegacyCode}`, row.subId);
    }
    console.log(`Loaded ${categoryMap.size} product subcategory mappings`);

    const existingProducts = await db
      .select({
        code: schema.products.code,
        title: schema.products.title,
        subCategoryId: schema.products.subCategoryId,
      })
      .from(schema.products);

    const existingKeys = new Set<string>();
    const usedCodes = new Set<string>();
    for (const row of existingProducts) {
      existingKeys.add(`${row.subCategoryId}:${normalizeTitle(row.title)}`);
      usedCodes.add(row.code);
    }
    console.log(`Existing products in DB: ${existingProducts.length}`);

    const productsToInsert: (typeof schema.products.$inferInsert)[] = [];
    const dimensionsByProductIndex: ValidDimension[][] = [];
    const unresolved: CleanProduct[] = [];
    let skippedExisting = 0;
    let productsWithNoValidDimensions = 0;
    let totalValidDimensions = 0;

    for (const product of cleanProducts) {
      const subCategoryId = categoryMap.get(`${product.mainCategoryLegacyCode}:${product.subCategoryLegacyCode}`);
      if (!subCategoryId) {
        unresolved.push(product);
        continue;
      }

      const existingKey = `${subCategoryId}:${normalizeTitle(product.title)}`;
      if (existingKeys.has(existingKey)) {
        skippedExisting++;
        continue;
      }

      const validDimensions = normalizeDimensions(product.dimensions);
      if (validDimensions.length === 0) {
        productsWithNoValidDimensions++;
      }
      totalValidDimensions += validDimensions.length;

      productsToInsert.push({
        code: generateUniqueCode(usedCodes),
        title: product.title,
        description: product.description,
        subCategoryId,
        sourceType: product.sourceType as (typeof PRODUCT_SOURCE_TYPE_VALUES)[number],
        estimatedProductionTime: product.estimatedProductionTime,
        pricingFactor: product.pricingFactor,
        createdBy: user.id,
      });
      dimensionsByProductIndex.push(validDimensions);
    }

    console.log(
      `\nPrepared ${productsToInsert.length} new products (${skippedExisting} already exist, ${unresolved.length} unresolved categories)`,
    );
    console.log(`Valid dimensions to seed: ${totalValidDimensions}`);

    if (productsToInsert.length === 0) {
      console.log('No new products to insert.');
      return;
    }

    const insertedCodes: string[] = [];
    for (let i = 0; i < productsToInsert.length; i += BATCH_SIZE) {
      const batch = productsToInsert.slice(i, i + BATCH_SIZE);
      const result = await db.insert(schema.products).values(batch).returning({ code: schema.products.code });
      for (const row of result) insertedCodes.push(row.code);
      process.stdout.write(
        `\rInserted ${Math.min(i + BATCH_SIZE, productsToInsert.length)} / ${productsToInsert.length} products`,
      );
    }
    console.log();

    const dimensionsToInsert: (typeof schema.productDimensions.$inferInsert)[] = [];
    for (let i = 0; i < insertedCodes.length; i++) {
      const code = insertedCodes[i];
      for (const dim of dimensionsByProductIndex[i]) {
        dimensionsToInsert.push({
          productCode: code,
          length: dim.length,
          depth: dim.depth,
          height: dim.height,
          dimensionUnit: dim.dimensionUnit as (typeof DIMENSION_UNIT_VALUES)[number],
          isDefault: dim.isDefault,
          createdBy: user.id,
        });
      }
    }

    if (dimensionsToInsert.length > 0) {
      for (let i = 0; i < dimensionsToInsert.length; i += BATCH_SIZE) {
        const batch = dimensionsToInsert.slice(i, i + BATCH_SIZE);
        await db.insert(schema.productDimensions).values(batch);
        process.stdout.write(
          `\rInserted ${Math.min(i + BATCH_SIZE, dimensionsToInsert.length)} / ${dimensionsToInsert.length} dimensions`,
        );
      }
      console.log();
    }

    console.log('\n========== PRODUCTS SEED STATS ==========');
    console.log(`JSON products loaded:            ${cleanProducts.length}`);
    console.log(`Inserted (new products):         ${insertedCodes.length}`);
    console.log(`Inserted (dimensions):           ${dimensionsToInsert.length}`);
    console.log(`Skipped (already exist):         ${skippedExisting}`);
    console.log(`Skipped (unresolved category):   ${unresolved.length}`);
    console.log(`Products with no valid dims:     ${productsWithNoValidDimensions}`);
    console.log('=========================================\n');
    console.log('Products seed completed successfully.');
  } catch (e) {
    const err = e as Error & { cause?: { message?: string; code?: string; detail?: string } };
    console.error(err.message);
    if (err.cause?.message) console.error(`Cause: ${err.cause.message}`);
    if (err.cause?.detail) console.error(`Detail: ${err.cause.detail}`);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

void main();
