import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import * as schema from '../src/database/schema';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

dotenv.config();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const askQuestion = (query: string): Promise<string> => {
  return new Promise((resolve) => rl.question(query, resolve));
};

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not defined in .env');

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  const db = drizzle(pool, { schema });

  try {
    const shippingCostInput = await askQuestion('Enter shipping cost: ');
    const shippingCost = parseFloat(shippingCostInput);
    if (isNaN(shippingCost)) throw new Error('Invalid shipping cost entered');

    console.log('Seeding Governorates...');

    const governoratesCsvPath = path.join(__dirname, '../locations/governorates.csv');
    const governoratesData = fs.readFileSync(governoratesCsvPath, 'utf-8');
    const governoratesLines = governoratesData.trim().split('\n');

    // Skip header
    const governoratesToInsert: (typeof schema.governorates.$inferInsert)[] = [];
    for (let i = 1; i < governoratesLines.length; i++) {
      const line = governoratesLines[i].trim();
      if (!line) continue;
      // id,name_en,name_ar
      const [id, nameEn, nameAr] = line.split(',');
      if (id && nameEn && nameAr) governoratesToInsert.push({ id, nameEn, nameAr, shippingCost });
    }

    if (governoratesToInsert.length > 0) {
      await db
        .insert(schema.governorates)
        .values(governoratesToInsert)
        .onConflictDoUpdate({
          target: schema.governorates.id,
          set: { nameEn: sql`excluded.name_en`, nameAr: sql`excluded.name_ar`, shippingCost: sql`excluded.shipping_cost` },
        });
    }

    console.log(`Seeded ${governoratesToInsert.length} governorates.`);

    console.log('Seeding Cities...');
    const citiesCsvPath = path.join(__dirname, '../locations/cities.csv');
    const citiesData = fs.readFileSync(citiesCsvPath, 'utf-8');
    const citiesLines = citiesData.trim().split('\n');

    const citiesToInsert: (typeof schema.cities.$inferInsert)[] = [];
    // "id","governorate_id","name_en","name_ar"
    for (let i = 1; i < citiesLines.length; i++) {
      const line = citiesLines[i].trim();
      if (!line) continue;
      const parts = line.split(',');
      const cleanParts = parts.map((p) => p.replace(/^"|"$/g, ''));
      const [id, governorateId, nameEn, nameAr] = cleanParts;

      if (id && governorateId && nameEn && nameAr) citiesToInsert.push({ id, governorateId, nameEn, nameAr });
    }

    // Batch insert cities
    const batchSize = 100;
    for (let i = 0; i < citiesToInsert.length; i += batchSize) {
      const batch = citiesToInsert.slice(i, i + batchSize);
      await db
        .insert(schema.cities)
        .values(batch)
        .onConflictDoUpdate({
          target: schema.cities.id,
          set: {
            nameEn: sql`excluded.name_en`,
            nameAr: sql`excluded.name_ar`,
            governorateId: sql`excluded.governorate_id`,
          },
        });
    }

    console.log(`Seeded ${citiesToInsert.length} cities.`);
  } catch (e) {
    console.error(e);
  } finally {
    rl.close();
    await pool.end();
  }
}

void main();
