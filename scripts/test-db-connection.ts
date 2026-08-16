import { Pool } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

function maskConnectionString(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.password) parsed.password = '****';
    return parsed.toString();
  } catch {
    return '[invalid DATABASE_URL]';
  }
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not defined in .env');
  }

  console.log(`Connecting to ${maskConnectionString(databaseUrl)}`);

  const pool = new Pool({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 10_000,
  });

  try {
    const result = await pool.query<{
      now: Date;
      db: string;
      usr: string;
      version: string;
    }>(`SELECT now() AS now, current_database() AS db, current_user AS usr, version()`);

    const row = result.rows[0];
    console.log('Database connection OK');
    console.log(`  database: ${row.db}`);
    console.log(`  user:     ${row.usr}`);
    console.log(`  time:     ${row.now.toISOString()}`);
    console.log(`  version:  ${row.version.split(',')[0]}`);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error('Database connection failed');
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
