import { readFileSync } from 'fs';
import { join } from 'path';
import { Pool } from 'pg';
import { config } from 'dotenv';

config();

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) throw new Error('DATABASE_URL is not defined in the environment variables.');

async function applyTriggers() {
  const pool = new Pool({ connectionString: DATABASE_URL });
  const sql = readFileSync(join(__dirname, 'sql', 'triggers.sql'), 'utf8');

  try {
    await pool.query(sql);
    console.log('Database triggers applied successfully.');
  } finally {
    await pool.end();
  }
}

applyTriggers().catch((error) => {
  console.error('Failed to apply database triggers:', error);
  process.exit(1);
});
