import { and, eq, isNull, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { parseArgs } from 'node:util';
import { stdin as input, stdout as output } from 'node:process';
import * as readline from 'node:readline/promises';
import * as crypto from 'crypto';
import * as schema from '../../src/database/schema';
import { MATERIAL_TYPES, MATERIAL_UNITS, PRODUCT_SOURCE_TYPES } from '../../src/utils/constants';
import * as dotenv from 'dotenv';

dotenv.config();

const MAIN_CATEGORY_LEGACY_CODE = 'SUPPLIED_PRODUCTS';
const MAIN_CATEGORY_TITLE = 'منتجات موردة';

const USAGE = `Usage: npm run create:supplied-products-from-imported [-- --dry-run] [-- --help]

Creates materials (material_type = supplied_products, unit = count) from every
active imported product (products.source_type = imported, deleted_at IS NULL).

Category mapping:
  - Ensures one material_category_mains row:
      legacy_code = ${MAIN_CATEGORY_LEGACY_CODE}
      title       = ${MAIN_CATEGORY_TITLE}
  - For each distinct product_category_mains used by those products, ensures a
    material_category_subs row under that main category:
      legacy_code = product_category_mains.legacy_code
      title       = product_category_mains.title
  - Product subcategories are ignored.

Materials:
  - code: unique 6-digit string (100000-999999)
  - legacy_code: null
  - title / description / created_by copied from the product
  - Titles that already exist in materials (including soft-deleted) are skipped
    and reported

All writes run in one transaction with audit logging skipped.

Options:
      --dry-run  Print the plan and exit without writing
  -h, --help     Show this help

Examples:
  npm run create:supplied-products-from-imported -- --dry-run
  npm run create:supplied-products-from-imported`;

type Db = ReturnType<typeof drizzle<typeof schema>>;
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
type Client = Pick<Db, 'select' | 'insert' | 'execute' | 'query'>;

type CliArgs = {
  dryRun: boolean;
};

type ExistingMaterial = {
  code: string;
  title: string;
  materialType: string;
  deletedAt: Date | null;
};

type ImportedProduct = {
  code: string;
  title: string;
  description: string | null;
  createdBy: string;
  productMainCategoryId: string;
  productMainCategoryLegacyCode: string;
  productMainCategoryTitle: string;
};

type ProductMainCategory = {
  id: string;
  legacyCode: string;
  title: string;
};

type TitleCollision = {
  productCode: string;
  productTitle: string;
  existingMaterialCode: string;
  existingMaterialType: string;
  existingSoftDeleted: boolean;
};

type MaterialToCreate = {
  code: string;
  title: string;
  description: string | null;
  createdBy: string;
  productCode: string;
  productMainCategoryLegacyCode: string;
};

type SubcategoryPlan = {
  productMain: ProductMainCategory;
  existingSubId: string | null;
  action: 'create' | 'reuse';
};

type Plan = {
  mainCategory: {
    existingId: string | null;
    action: 'create' | 'reuse';
  };
  subcategories: SubcategoryPlan[];
  materialsToCreate: MaterialToCreate[];
  collisions: TitleCollision[];
  importedProductCount: number;
};

function parseCliArgs(): CliArgs {
  try {
    const { values } = parseArgs({
      options: {
        help: { type: 'boolean', short: 'h' },
        'dry-run': { type: 'boolean', default: false },
      },
      allowPositionals: false,
    });

    if (values.help) {
      console.log(USAGE);
      process.exit(0);
    }

    return { dryRun: Boolean(values['dry-run']) };
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

function generateUniqueCode(existing: Set<string>): string {
  for (let attempt = 0; attempt < 1000; attempt++) {
    // Full 6-digit range (100000–999999) so codes never have leading zeros
    const code = String(crypto.randomInt(100_000, 1_000_000));
    if (!existing.has(code)) {
      existing.add(code);
      return code;
    }
  }
  throw new Error('Failed to generate a unique 6-digit material code after 1000 attempts.');
}

async function loadImportedProducts(db: Client): Promise<ImportedProduct[]> {
  return db
    .select({
      code: schema.products.code,
      title: schema.products.title,
      description: schema.products.description,
      createdBy: schema.products.createdBy,
      productMainCategoryId: schema.productCategoryMains.id,
      productMainCategoryLegacyCode: schema.productCategoryMains.legacyCode,
      productMainCategoryTitle: schema.productCategoryMains.title,
    })
    .from(schema.products)
    .innerJoin(schema.productCategorySubs, eq(schema.products.subCategoryId, schema.productCategorySubs.id))
    .innerJoin(schema.productCategoryMains, eq(schema.productCategorySubs.mainCategoryId, schema.productCategoryMains.id))
    .where(and(eq(schema.products.sourceType, PRODUCT_SOURCE_TYPES.IMPORTED), isNull(schema.products.deletedAt)))
    .orderBy(schema.products.code);
}

async function loadExistingMaterials(db: Client): Promise<ExistingMaterial[]> {
  return db
    .select({
      code: schema.materials.code,
      title: schema.materials.title,
      materialType: schema.materials.materialType,
      deletedAt: schema.materials.deletedAt,
    })
    .from(schema.materials);
}

async function buildPlan(db: Client): Promise<Plan> {
  const [importedProducts, existingMaterials, existingMain] = await Promise.all([
    loadImportedProducts(db),
    loadExistingMaterials(db),
    db.query.materialCategoryMains.findFirst({
      where: eq(schema.materialCategoryMains.legacyCode, MAIN_CATEGORY_LEGACY_CODE),
      columns: { id: true, title: true, legacyCode: true },
    }),
  ]);

  const existingCodes = new Set(existingMaterials.map((m) => m.code));
  const materialsByTitle = new Map(existingMaterials.map((m) => [m.title, m]));

  const productMainsById = new Map<string, ProductMainCategory>();
  for (const product of importedProducts) {
    if (!productMainsById.has(product.productMainCategoryId)) {
      productMainsById.set(product.productMainCategoryId, {
        id: product.productMainCategoryId,
        legacyCode: product.productMainCategoryLegacyCode,
        title: product.productMainCategoryTitle,
      });
    }
  }

  const existingSubsByLegacyCode = new Map<string, string>();
  if (existingMain) {
    const existingSubs = await db
      .select({
        id: schema.materialCategorySubs.id,
        legacyCode: schema.materialCategorySubs.legacyCode,
      })
      .from(schema.materialCategorySubs)
      .where(eq(schema.materialCategorySubs.mainCategoryId, existingMain.id));

    for (const sub of existingSubs) {
      existingSubsByLegacyCode.set(sub.legacyCode, sub.id);
    }
  }

  const subcategories: SubcategoryPlan[] = [...productMainsById.values()]
    .sort((a, b) => a.legacyCode.localeCompare(b.legacyCode))
    .map((productMain) => {
      const existingSubId = existingSubsByLegacyCode.get(productMain.legacyCode) ?? null;
      return {
        productMain,
        existingSubId,
        action: existingSubId ? ('reuse' as const) : ('create' as const),
      };
    });

  const collisions: TitleCollision[] = [];
  const materialsToCreate: MaterialToCreate[] = [];

  for (const product of importedProducts) {
    const existing = materialsByTitle.get(product.title);
    if (existing) {
      collisions.push({
        productCode: product.code,
        productTitle: product.title,
        existingMaterialCode: existing.code,
        existingMaterialType: existing.materialType,
        existingSoftDeleted: existing.deletedAt != null,
      });
      continue;
    }

    materialsToCreate.push({
      code: generateUniqueCode(existingCodes),
      title: product.title,
      description: product.description,
      createdBy: product.createdBy,
      productCode: product.code,
      productMainCategoryLegacyCode: product.productMainCategoryLegacyCode,
    });
  }

  return {
    mainCategory: {
      existingId: existingMain?.id ?? null,
      action: existingMain ? 'reuse' : 'create',
    },
    subcategories,
    materialsToCreate,
    collisions,
    importedProductCount: importedProducts.length,
  };
}

function printPreview(plan: Plan, databaseUrl: string, dryRun: boolean): void {
  const subsToCreate = plan.subcategories.filter((s) => s.action === 'create').length;
  const subsToReuse = plan.subcategories.filter((s) => s.action === 'reuse').length;

  console.log('\n========== CREATE SUPPLIED PRODUCTS FROM IMPORTED ==========');
  console.log(`Database: ${maskConnectionString(databaseUrl)}`);
  console.log(`Mode:     ${dryRun ? 'dry-run (no writes)' : 'apply (requires confirmation)'}`);
  console.log('Audit logging will be skipped for writes.\n');

  console.log('Main category:');
  if (plan.mainCategory.action === 'reuse') {
    console.log(
      `  reuse  ${MAIN_CATEGORY_TITLE} (legacy_code=${MAIN_CATEGORY_LEGACY_CODE}, id=${plan.mainCategory.existingId})`,
    );
  } else {
    console.log(`  create ${MAIN_CATEGORY_TITLE} (legacy_code=${MAIN_CATEGORY_LEGACY_CODE})`);
  }

  console.log('\nSubcategories (from product_category_mains):');
  console.log(`  ${String(plan.subcategories.length).padStart(8)}  distinct product main categories`);
  console.log(`  ${String(subsToCreate).padStart(8)}  material subcategories to create`);
  console.log(`  ${String(subsToReuse).padStart(8)}  material subcategories to reuse`);

  if (plan.subcategories.length > 0) {
    console.log('\n  Action  Legacy code                 Title');
    console.log('  ------  ---------------------------  ------------------------------');
    for (const sub of plan.subcategories) {
      const action = sub.action.padEnd(6);
      const legacy = sub.productMain.legacyCode.padEnd(27);
      console.log(`  ${action}  ${legacy}  ${sub.productMain.title}`);
    }
  }

  console.log('\nMaterials:');
  console.log(`  ${String(plan.importedProductCount).padStart(8)}  active imported products`);
  console.log(`  ${String(plan.materialsToCreate.length).padStart(8)}  materials to create`);
  console.log(`  ${String(plan.collisions.length).padStart(8)}  skipped (title already in materials)`);

  if (plan.collisions.length > 0) {
    console.log('\nSkipped title collisions:');
    console.log('  Product code   Existing material   Type                     Soft-deleted  Title');
    console.log('  -------------  ------------------  -----------------------  ------------  -----');
    for (const collision of plan.collisions) {
      const productCode = collision.productCode.padEnd(13);
      const materialCode = collision.existingMaterialCode.padEnd(18);
      const materialType = collision.existingMaterialType.padEnd(23);
      const softDeleted = (collision.existingSoftDeleted ? 'yes' : 'no').padEnd(12);
      console.log(
        `  ${productCode}  ${materialCode}  ${materialType}  ${softDeleted}  ${collision.productTitle}`,
      );
    }
  }
}

async function confirmApply(plan: Plan): Promise<boolean> {
  if (plan.materialsToCreate.length === 0 && plan.mainCategory.action === 'reuse') {
    const needsSubs = plan.subcategories.some((s) => s.action === 'create');
    if (!needsSubs) {
      console.log('\nNothing to create. Categories already exist and every imported product title is already in materials.');
      return false;
    }
  }

  const rl = readline.createInterface({ input, output });
  try {
    const answer = (
      await rl.question('\nType "yes" to create categories/materials, anything else to abort: ')
    ).trim();
    return answer === 'yes';
  } finally {
    rl.close();
  }
}

async function applyPlan(tx: Tx, plan: Plan): Promise<void> {
  await tx.execute(sql`SET LOCAL statement_timeout = 0`);
  await tx.execute(sql`SET LOCAL idle_in_transaction_session_timeout = 0`);
  await tx.execute(sql`SET LOCAL erp.audit_skip = 'true'`);

  let mainCategoryId = plan.mainCategory.existingId;
  if (plan.mainCategory.action === 'create') {
    const [createdMain] = await tx
      .insert(schema.materialCategoryMains)
      .values({
        legacyCode: MAIN_CATEGORY_LEGACY_CODE,
        title: MAIN_CATEGORY_TITLE,
      })
      .returning({ id: schema.materialCategoryMains.id });

    if (!createdMain) {
      throw new Error('Failed to create material_category_mains row for SUPPLIED_PRODUCTS.');
    }
    mainCategoryId = createdMain.id;
    console.log(`  created main category ${MAIN_CATEGORY_TITLE} (${mainCategoryId})`);
  } else {
    console.log(`  reused main category ${MAIN_CATEGORY_TITLE} (${mainCategoryId})`);
  }

  if (!mainCategoryId) {
    throw new Error('Main category id is missing after create/reuse.');
  }

  const subIdByProductMainLegacyCode = new Map<string, string>();

  for (const sub of plan.subcategories) {
    if (sub.action === 'reuse' && sub.existingSubId) {
      subIdByProductMainLegacyCode.set(sub.productMain.legacyCode, sub.existingSubId);
      continue;
    }

    const [createdSub] = await tx
      .insert(schema.materialCategorySubs)
      .values({
        legacyCode: sub.productMain.legacyCode,
        title: sub.productMain.title,
        mainCategoryId,
      })
      .returning({ id: schema.materialCategorySubs.id });

    if (!createdSub) {
      throw new Error(`Failed to create material_category_subs for legacy_code=${sub.productMain.legacyCode}.`);
    }

    subIdByProductMainLegacyCode.set(sub.productMain.legacyCode, createdSub.id);
  }

  const createdSubCount = plan.subcategories.filter((s) => s.action === 'create').length;
  const reusedSubCount = plan.subcategories.filter((s) => s.action === 'reuse').length;
  console.log(`  created ${createdSubCount} subcategory(ies), reused ${reusedSubCount}`);

  if (plan.materialsToCreate.length === 0) {
    console.log('  no materials to insert');
    return;
  }

  const materialRows = plan.materialsToCreate.map((material) => {
    const subCategoryId = subIdByProductMainLegacyCode.get(material.productMainCategoryLegacyCode);
    if (!subCategoryId) {
      throw new Error(
        `Missing material subcategory mapping for product main legacy_code=${material.productMainCategoryLegacyCode} (product ${material.productCode}).`,
      );
    }

    return {
      code: material.code,
      legacyCode: null,
      title: material.title,
      description: material.description,
      subCategoryId,
      materialType: MATERIAL_TYPES.SUPPLIED_PRODUCTS,
      unitOfMeasurement: MATERIAL_UNITS.COUNT,
      createdBy: material.createdBy,
    };
  });

  const inserted = await tx.insert(schema.materials).values(materialRows).returning({ code: schema.materials.code });

  if (inserted.length !== plan.materialsToCreate.length) {
    throw new Error(
      `Inserted row count mismatch: expected ${plan.materialsToCreate.length}, actually inserted ${inserted.length}. Rolling back.`,
    );
  }

  console.log(`  inserted ${String(inserted.length).padStart(8)}  materials (supplied_products)`);
}

async function main() {
  const { dryRun } = parseCliArgs();

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is not defined in .env');

  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle(pool, { schema });
  let transactionStarted = false;

  try {
    const plan = await buildPlan(db);
    printPreview(plan, databaseUrl, dryRun);

    if (dryRun) {
      console.log('\nDry run complete. No changes were written.');
      return;
    }

    const confirmed = await confirmApply(plan);
    if (!confirmed) {
      if (plan.materialsToCreate.length > 0 || plan.mainCategory.action === 'create' || plan.subcategories.some((s) => s.action === 'create')) {
        console.log('Aborted. No rows were written.');
      }
      return;
    }

    console.log('\nCreating in one database transaction...');
    await db.transaction(async (tx) => {
      transactionStarted = true;
      await applyPlan(tx, plan);
    });

    console.log('\nCreate completed.');
    if (plan.collisions.length > 0) {
      console.log(`Skipped ${plan.collisions.length} product(s) due to existing material titles.`);
    }
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    if (transactionStarted) {
      console.error('Create failed; all database changes from this run were rolled back.');
    }
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

void main();
