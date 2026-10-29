import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { and, eq, sql } from 'drizzle-orm';
import * as schema from '../../src/database/schema';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config();

type CategorySubJson = {
  legacyCode: string;
  title: string;
};

type CategoryMainJson = {
  legacyCode: string;
  title: string;
  subs: CategorySubJson[];
};

function readJsonFile<T>(filePath: string): T {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Category tree JSON not found: ${filePath}`);
  }

  return JSON.parse(fs.readFileSync(filePath, 'utf-8').replace(/^\uFEFF/, '')) as T;
}

async function seedProductCategoryTree(
  db: Pick<ReturnType<typeof drizzle<typeof schema>>, 'insert' | 'select' | 'update'>,
  data: CategoryMainJson[],
) {
  let mainCreated = 0;
  let mainUpdated = 0;
  let mainUnchanged = 0;
  let subCreated = 0;
  let subUpdated = 0;
  let subUnchanged = 0;

  for (const main of data) {
    const [existingMain] = await db
      .select({
        id: schema.productCategoryMains.id,
        title: schema.productCategoryMains.title,
      })
      .from(schema.productCategoryMains)
      .where(eq(schema.productCategoryMains.legacyCode, main.legacyCode))
      .limit(1);

    let mainId = existingMain?.id;

    if (!mainId) {
      const [insertedMain] = await db
        .insert(schema.productCategoryMains)
        .values({
          legacyCode: main.legacyCode,
          title: main.title,
        })
        .returning({ id: schema.productCategoryMains.id });

      if (!insertedMain) {
        throw new Error(`Failed to insert main category "${main.legacyCode}"`);
      }

      mainId = insertedMain.id;
      mainCreated++;
    } else if (existingMain.title !== main.title) {
      await db
        .update(schema.productCategoryMains)
        .set({ title: main.title })
        .where(eq(schema.productCategoryMains.id, mainId));
      mainUpdated++;
    } else {
      mainUnchanged++;
    }

    for (const sub of main.subs) {
      const [existingSub] = await db
        .select({
          id: schema.productCategorySubs.id,
          title: schema.productCategorySubs.title,
        })
        .from(schema.productCategorySubs)
        .where(
          and(
            eq(schema.productCategorySubs.mainCategoryId, mainId),
            eq(schema.productCategorySubs.legacyCode, sub.legacyCode),
          ),
        )
        .limit(1);

      if (!existingSub) {
        await db.insert(schema.productCategorySubs).values({
          legacyCode: sub.legacyCode,
          title: sub.title,
          mainCategoryId: mainId,
        });
        subCreated++;
      } else if (existingSub.title !== sub.title) {
        await db
          .update(schema.productCategorySubs)
          .set({ title: sub.title })
          .where(eq(schema.productCategorySubs.id, existingSub.id));
        subUpdated++;
      } else {
        subUnchanged++;
      }
    }
  }

  console.log(
    `Seeded product categories: mains created=${mainCreated} updated=${mainUpdated} unchanged=${mainUnchanged}, ` +
      `subs created=${subCreated} updated=${subUpdated} unchanged=${subUnchanged}.`,
  );
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not defined in .env');

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool, { schema });

  try {
    const treePath = path.join(__dirname, '../../../../products/product-category-tree.json');
    const tree = readJsonFile<CategoryMainJson[]>(treePath);

    if (!Array.isArray(tree) || tree.length === 0) {
      throw new Error(`Category tree JSON is empty: ${treePath}`);
    }

    console.log(`Loaded ${tree.length} main categories from ${treePath}`);
    console.log('Writing all inserts and title updates in one database transaction. A failure rolls back the entire run.');

    await db.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL statement_timeout = 0`);
      await tx.execute(sql`SET LOCAL idle_in_transaction_session_timeout = 0`);
      await seedProductCategoryTree(tx, tree);
    });

    console.log('Product category tree seed completed successfully.');
  } catch (e) {
    console.error(e);
    console.error('Seed failed; all database changes from this run were rolled back.');
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

void main();
