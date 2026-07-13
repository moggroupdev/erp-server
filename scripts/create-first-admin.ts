import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { and, eq, isNull, or, sql } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { parseArgs } from 'node:util';
import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import * as schema from '../src/database/schema';
import * as dotenv from 'dotenv';

dotenv.config();

const USAGE = `Usage: npm run create:first-admin -- [options]

Creates the initial admin user. Rejects if any admin already exists.

Options:
  -n, --name <name>        Admin display name (required)
  -e, --email <email>      Admin email (at least one of email or phone is required)
  -p, --phone <phone>      Admin phone (at least one of email or phone is required)
      --password <password>  Admin password (required; prompted if omitted)

Examples:
  npm run create:first-admin -- --name "Admin User" --email admin@example.com --password "secret"
  npm run create:first-admin -- -n "Admin User" -p "+201234567890" --password "secret"`;

type AdminInput = {
  name: string;
  email?: string;
  phone?: string;
  password: string;
};

function parseCliArgs() {
  try {
    const { values } = parseArgs({
      options: {
        name: { type: 'string', short: 'n' },
        email: { type: 'string', short: 'e' },
        phone: { type: 'string', short: 'p' },
        password: { type: 'string' },
        help: { type: 'boolean', short: 'h' },
      },
      allowPositionals: false,
    });

    if (values.help) {
      console.log(USAGE);
      process.exit(0);
    }

    return values;
  } catch {
    console.error(USAGE);
    process.exit(1);
  }
}

async function promptForMissingFields(partial: Partial<AdminInput>): Promise<AdminInput> {
  const rl = readline.createInterface({ input, output });

  try {
    const name = partial.name ?? (await rl.question('Name: ')).trim();
    if (!name) throw new Error('Name is required.');

    let email = partial.email?.trim() || undefined;
    let phone = partial.phone?.trim() || undefined;

    if (!email && !phone) {
      email = (await rl.question('Email (optional if phone is set): ')).trim() || undefined;
      phone = (await rl.question('Phone (optional if email is set): ')).trim() || undefined;
    }

    if (!email && !phone) throw new Error('Either email or phone must be provided.');

    const password = partial.password ?? (await rl.question('Password: ')).trim();
    if (!password) throw new Error('Password is required.');

    return { name, email, phone, password };
  } finally {
    rl.close();
  }
}

async function rejectIfAdminsExist(db: ReturnType<typeof drizzle<typeof schema>>) {
  const existingAdmins = await db
    .select({
      code: schema.users.code,
      name: schema.users.name,
    })
    .from(schema.users)
    .where(and(eq(schema.users.isAdmin, true), isNull(schema.users.deletedAt)));

  if (existingAdmins.length === 0) return;

  const adminList = existingAdmins.map((admin) => `  - ${admin.code} (${admin.name})`).join('\n');
  throw new Error(`Cannot create first admin: ${existingAdmins.length} admin user(s) already exist.\n${adminList}`);
}

async function assertUniqueIdentifiers(db: ReturnType<typeof drizzle<typeof schema>>, email?: string, phone?: string) {
  const existingUser = await db.query.users.findFirst({
    where: and(
      isNull(schema.users.deletedAt),
      or(email ? eq(schema.users.email, email) : undefined, phone ? eq(schema.users.phone, phone) : undefined),
    ),
    columns: { id: true, email: true, phone: true },
  });

  if (!existingUser) return;

  if (email && existingUser.email === email) {
    throw new Error(`A user with email "${email}" already exists.`);
  }

  if (phone && existingUser.phone === phone) {
    throw new Error(`A user with phone "${phone}" already exists.`);
  }
}

async function createFirstAdmin(db: ReturnType<typeof drizzle<typeof schema>>, input: AdminInput) {
  const hashedPassword = await bcrypt.hash(input.password, 12);

  const [admin] = await db
    .insert(schema.users)
    .values({
      code: sql`DEFAULT`,
      name: input.name,
      email: input.email,
      phone: input.phone,
      password: hashedPassword,
      isAdmin: true,
      roleId: null,
    })
    .returning({
      id: schema.users.id,
      code: schema.users.code,
      name: schema.users.name,
      email: schema.users.email,
      phone: schema.users.phone,
      isAdmin: schema.users.isAdmin,
    });

  return admin;
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not defined in .env');

  const cli = parseCliArgs();

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool, { schema });

  try {
    await rejectIfAdminsExist(db);

    const adminInput = await promptForMissingFields({
      name: cli.name,
      email: cli.email,
      phone: cli.phone,
      password: cli.password,
    });

    await assertUniqueIdentifiers(db, adminInput.email, adminInput.phone);

    const admin = await createFirstAdmin(db, adminInput);

    console.log('First admin user created successfully:');
    console.log(`  Code:  ${admin.code}`);
    console.log(`  Name:  ${admin.name}`);
    if (admin.email) console.log(`  Email: ${admin.email}`);
    if (admin.phone) console.log(`  Phone: ${admin.phone}`);
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

void main();
