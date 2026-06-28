import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
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

  let mainCount = 0;
  let subCount = 0;

  for (const main of data) {
    const [insertedMain] = await db
      .insert(mainsTable)
      .values({
        legacyCode: main.legacy_code,
        title: main.title,
      })
      .onConflictDoUpdate({
        target: mainsTable.legacyCode,
        set: {
          title: sql`excluded.title`,
        },
      })
      .returning({ id: mainsTable.id });

    mainCount++;

    const mainId = insertedMain.id;

    for (const sub of main.subcategories) {
      await db
        .insert(subsTable)
        .values({
          legacyCode: sub.legacy_code,
          title: sub.title,
          mainCategoryId: mainId,
        })
        .onConflictDoUpdate({
          target: [subsTable.mainCategoryId, subsTable.legacyCode],
          set: {
            title: sql`excluded.title`,
          },
        });

      subCount++;
    }
  }

  console.log(`Seeded ${mainCount} ${label} mains and ${subCount} subs.`);
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not defined in .env');

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool, { schema });

  try {
    const materialsPath = path.join(__dirname, '../data/categories/materials.json');
    const productsPath = path.join(__dirname, '../categories/products.json');

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
