import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import * as schema from '../src/database/schema';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config();

type CategoryJson = {
  legacy_code: string;
  title: string;
  subcategories: { legacy_code: string; title: string }[];
};

async function seedCategoryTree(
  db: ReturnType<typeof drizzle<typeof schema>>,
  mainsTable: typeof schema.materialCategoryMains | typeof schema.productCategoryMains,
  subsTable: typeof schema.materialCategorySubs | typeof schema.productCategorySubs,
  data: CategoryJson[],
  label: string,
) {
  console.log(`Seeding ${label}...`);

  let mainCreated = 0;
  let mainSkipped = 0;
  let subCreated = 0;
  let subSkipped = 0;

  for (const main of data) {
    const [insertedMain] = await db
      .insert(mainsTable)
      .values({
        legacyCode: main.legacy_code,
        title: main.title,
      })
      .onConflictDoNothing({ target: mainsTable.legacyCode })
      .returning({ id: mainsTable.id });

    let mainId = insertedMain?.id;

    if (mainId) {
      mainCreated++;
    } else {
      mainSkipped++;
      const [existing] = await db
        .select({ id: mainsTable.id })
        .from(mainsTable)
        .where(eq(mainsTable.legacyCode, main.legacy_code))
        .limit(1);

      if (!existing) {
        throw new Error(`Main ${label} category with legacy_code "${main.legacy_code}" was skipped but not found`);
      }

      mainId = existing.id;
    }

    for (const sub of main.subcategories) {
      const [insertedSub] = await db
        .insert(subsTable)
        .values({
          legacyCode: sub.legacy_code,
          title: sub.title,
          mainCategoryId: mainId,
        })
        .onConflictDoNothing({
          target: [subsTable.mainCategoryId, subsTable.legacyCode],
        })
        .returning({ id: subsTable.id });

      if (insertedSub) {
        subCreated++;
      } else {
        subSkipped++;
      }
    }
  }

  console.log(
    `Seeded ${label}: mains created=${mainCreated} skipped=${mainSkipped}, ` +
      `subs created=${subCreated} skipped=${subSkipped}.`,
  );
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not defined in .env');

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool, { schema });

  try {
    const materialsPath = path.join(__dirname, '../data/categories/materials.json');
    const productsPath = path.join(__dirname, '../data/categories/products.json');

    const materialsData = JSON.parse(fs.readFileSync(materialsPath, 'utf-8')) as CategoryJson[];
    const productsData = JSON.parse(fs.readFileSync(productsPath, 'utf-8')) as CategoryJson[];

    await seedCategoryTree(db, schema.materialCategoryMains, schema.materialCategorySubs, materialsData, 'material');
    await seedCategoryTree(db, schema.productCategoryMains, schema.productCategorySubs, productsData, 'product');
  } catch (e) {
    console.error(e);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

void main();
