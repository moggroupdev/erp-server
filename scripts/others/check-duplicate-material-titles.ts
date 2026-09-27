import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { isNull } from 'drizzle-orm';
import { parseArgs } from 'node:util';
import * as schema from '../../src/database/schema';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config();

const USAGE = `Usage: npm run check:duplicate-material-titles [-- [--out <path>] [--include-deleted]]

Finds materials that share the same title. Comparison collapses extra whitespace
and ignores case, so "Glass  6mm" and "glass 6mm" count as the same name.

Soft-deleted materials are skipped unless --include-deleted is set.

Exits with code 1 when duplicates are found.

Options:
  -o, --out <path>       CSV report path (default: data/materials/duplicate-titles/duplicate-titles.csv)
      --include-deleted  Include soft-deleted materials
  -h, --help             Show this help

Examples:
  npm run check:duplicate-material-titles
  npm run check:duplicate-material-titles -- --include-deleted`;

const DEFAULT_OUT = path.join(__dirname, '../../data/materials/duplicate-titles/duplicate-titles.csv');

type MaterialRow = {
  code: string;
  legacyCode: string | null;
  title: string;
  materialType: string;
  unitOfMeasurement: string;
  deletedAt: Date | null;
};

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function normTitle(value: string): string {
  return collapseWhitespace(value).toLowerCase();
}

function escapeCsv(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function writeCsv(filePath: string, headers: readonly string[], rows: string[][]): void {
  const lines = [headers.map(escapeCsv).join(',')];
  for (const row of rows) {
    lines.push(row.map(escapeCsv).join(','));
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  // UTF-8 BOM so Excel renders Arabic correctly
  fs.writeFileSync(filePath, '\uFEFF' + lines.join('\n') + '\n', 'utf-8');
}

function parseCliArgs(): { outPath: string; includeDeleted: boolean } {
  const { values } = parseArgs({
    options: {
      out: { type: 'string', short: 'o' },
      'include-deleted': { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
    allowPositionals: false,
  });

  if (values.help) {
    console.log(USAGE);
    process.exit(0);
  }

  return {
    outPath: values.out ? path.resolve(values.out) : DEFAULT_OUT,
    includeDeleted: values['include-deleted'] ?? false,
  };
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not defined in .env');
  }

  const { outPath, includeDeleted } = parseCliArgs();

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool, { schema });

  try {
    const materialQuery = db
      .select({
        code: schema.materials.code,
        legacyCode: schema.materials.legacyCode,
        title: schema.materials.title,
        materialType: schema.materials.materialType,
        unitOfMeasurement: schema.materials.unitOfMeasurement,
        deletedAt: schema.materials.deletedAt,
      })
      .from(schema.materials);

    const materialRows: MaterialRow[] = includeDeleted
      ? await materialQuery
      : await materialQuery.where(isNull(schema.materials.deletedAt));

    const groups = new Map<string, MaterialRow[]>();
    for (const row of materialRows) {
      const key = normTitle(row.title);
      let group = groups.get(key);
      if (!group) {
        group = [];
        groups.set(key, group);
      }
      group.push(row);
    }

    const duplicates = [...groups.entries()]
      .filter(([, rows]) => rows.length > 1)
      .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], 'ar'));

    const duplicateItemCount = duplicates.reduce((sum, [, rows]) => sum + rows.length, 0);

    console.log(`Checked ${materialRows.length} material(s)${includeDeleted ? ' (including soft-deleted)' : ''}.`);

    if (duplicates.length === 0) {
      console.log('No materials share the same title.');
      return;
    }

    console.log(`Found ${duplicates.length} title(s) shared by ${duplicateItemCount} material(s):\n`);

    for (const [, rows] of duplicates) {
      rows.sort((a, b) => a.code.localeCompare(b.code));
      const displayTitle = collapseWhitespace(rows[0].title);
      console.log(`"${displayTitle}" (${rows.length})`);
      for (const row of rows) {
        const legacy = row.legacyCode ?? '—';
        const collapsed = collapseWhitespace(row.title);
        const deleted = row.deletedAt ? '  deleted' : '';
        const stored = row.title === collapsed ? '' : `  stored="${row.title}"`;
        console.log(`  ${row.code}  legacy=${legacy}  ${row.materialType}  ${row.unitOfMeasurement}  ${collapsed}${deleted}${stored}`);
      }
      console.log('');
    }

    const csvRows = duplicates.flatMap(([title, rows]) =>
      rows.map((row) => [
        title,
        String(rows.length),
        row.code,
        row.legacyCode ?? '',
        row.title,
        row.materialType,
        row.unitOfMeasurement,
        row.deletedAt ? row.deletedAt.toISOString() : '',
      ]),
    );

    writeCsv(
      outPath,
      ['normalizedTitle', 'duplicateCount', 'code', 'legacyCode', 'title', 'materialType', 'unitOfMeasurement', 'deletedAt'],
      csvRows,
    );
    console.log(`Wrote: ${outPath}`);
    process.exitCode = 1;
  } catch (e) {
    const err = e as Error & { cause?: { message?: string; detail?: string } };
    console.error(err.message);
    if (err.cause?.message) console.error(`Cause: ${err.cause.message}`);
    if (err.cause?.detail) console.error(`Detail: ${err.cause.detail}`);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

void main();
