import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import * as schema from '../src/database/schema';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config();

type CategoryJson = {
  code: string;
  name: { ar: string; en: string };
  subcategories: { code: string; name: { ar: string; en: string } }[];
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
        code: main.code,
        nameEn: main.name.en,
        nameAr: main.name.ar,
      })
      .onConflictDoUpdate({
        target: mainsTable.code,
        set: {
          nameEn: sql`excluded.name_en`,
          nameAr: sql`excluded.name_ar`,
        },
      })
      .returning({ id: mainsTable.id });

    mainCount++;

    const mainId = insertedMain.id;

    for (const sub of main.subcategories) {
      await db
        .insert(subsTable)
        .values({
          code: sub.code,
          nameEn: sub.name.en,
          nameAr: sub.name.ar,
          mainCategoryId: mainId,
        })
        .onConflictDoUpdate({
          target: [subsTable.mainCategoryId, subsTable.code],
          set: {
            nameEn: sql`excluded.name_en`,
            nameAr: sql`excluded.name_ar`,
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
    const materialsPath = path.join(__dirname, '../categories/materials.json');
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
