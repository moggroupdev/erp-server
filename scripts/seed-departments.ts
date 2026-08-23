import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import { parse } from 'csv-parse/sync';
import * as schema from '../src/database/schema';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config();

type DepartmentCsvRow = {
  id: string;
  name_en: string;
  name_ar: string;
  parent_id: string;
};

type SeedClient = Pick<ReturnType<typeof drizzle<typeof schema>>, 'insert'>;

async function seedDepartments(db: SeedClient, rows: DepartmentCsvRow[]) {
  const roots = rows.filter((row) => !row.parent_id?.trim());
  const children = rows.filter((row) => row.parent_id?.trim());

  const toInsert = (row: DepartmentCsvRow): typeof schema.departments.$inferInsert => ({
    id: row.id,
    nameEn: row.name_en,
    nameAr: row.name_ar,
    parentId: row.parent_id?.trim() || null,
  });

  for (const batch of [roots, children]) {
    if (batch.length === 0) continue;

    await db
      .insert(schema.departments)
      .values(batch.map(toInsert))
      .onConflictDoUpdate({
        target: schema.departments.id,
        set: {
          nameEn: sql`excluded.name_en`,
          nameAr: sql`excluded.name_ar`,
          parentId: sql`excluded.parent_id`,
        },
      });
  }

  return rows.length;
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not defined in .env');

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool, { schema });

  try {
    console.log('Seeding Departments...');

    const departmentsCsvPath = path.join(__dirname, '../data/departments.csv');
    const departmentsData = fs.readFileSync(departmentsCsvPath, 'utf-8');
    const rows = parse<DepartmentCsvRow>(departmentsData, { columns: true, skip_empty_lines: true });

    console.log('Writing all inserts in one database transaction. A failure rolls back the entire run.');
    const count = await db.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL statement_timeout = 0`);
      await tx.execute(sql`SET LOCAL idle_in_transaction_session_timeout = 0`);
      return seedDepartments(tx, rows);
    });
    console.log(`Seeded ${count} departments.`);
  } catch (e) {
    console.error(e);
    console.error('Seed failed; all database changes from this run were rolled back.');
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

void main();
