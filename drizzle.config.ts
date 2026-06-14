import { config } from 'dotenv'; // We use dotenv outside of the Nest.js context
import { defineConfig } from 'drizzle-kit';

config(); // Load environment variables

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) throw new Error('DATABASE_URL is not defined in the environment variables.');

export default defineConfig({
  out: './src/database/migrations',
  schema: './src/database/schema',
  dialect: 'postgresql',
  dbCredentials: { url: DATABASE_URL },
});
