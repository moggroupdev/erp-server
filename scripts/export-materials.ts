import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { isNull } from 'drizzle-orm';
import { parseArgs } from 'node:util';
import * as schema from '../src/database/schema';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config();

const USAGE = `Usage: npm run export:materials [-- [--out <path>] [--include-deleted]]

Exports all materials from the database with their unit conversions to a JSON file.

Options:
  -o, --out <path>       Output file path (default: data/materials/export/materials.json)
      --include-deleted  Include soft-deleted materials
  -h, --help             Show this help

Examples:
  npm run export:materials
  npm run export:materials -- --out data/materials/export/backup.json`;

type UnitConversionExport = {
  id: string;
  unit: string;
  conversionFactorToBase: number;
};

type MaterialExport = {
  code: string;
  legacyCode: string | null;
  title: string;
  description: string | null;
  subCategoryId: string;
  materialType: string;
  unitOfMeasurement: string;
  unitPrice: number;
  quantity: number;
  openingUnitPrice: number | null;
  openingQuantity: number | null;
  minimumStock: number | null;
  createdAt: string;
  unitConversions: UnitConversionExport[];
};

type ExportPayload = {
  exportedAt: string;
  count: number;
  materialsWithUnitConversions: number;
  totalUnitConversions: number;
  materials: MaterialExport[];
};

const DEFAULT_OUT = path.join(__dirname, '../data/materials/export/materials.json');

function toNumber(value: string | number | null | undefined): number | null {
  if (value == null) return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function toRequiredNumber(value: string | number | null | undefined): number {
  return toNumber(value) ?? 0;
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
        description: schema.materials.description,
        subCategoryId: schema.materials.subCategoryId,
        materialType: schema.materials.materialType,
        unitOfMeasurement: schema.materials.unitOfMeasurement,
        unitPrice: schema.materials.unitPrice,
        quantity: schema.materials.quantity,
        openingUnitPrice: schema.materials.openingUnitPrice,
        openingQuantity: schema.materials.openingQuantity,
        minimumStock: schema.materials.minimumStock,
        createdAt: schema.materials.createdAt,
      })
      .from(schema.materials);

    const materialRows = includeDeleted
      ? await materialQuery
      : await materialQuery.where(isNull(schema.materials.deletedAt));

    const conversionRows = await db
      .select({
        id: schema.materialUnitConversions.id,
        materialCode: schema.materialUnitConversions.materialCode,
        unit: schema.materialUnitConversions.unit,
        conversionFactorToBase: schema.materialUnitConversions.conversionFactorToBase,
      })
      .from(schema.materialUnitConversions);

    const conversionsByMaterialCode = new Map<string, UnitConversionExport[]>();
    for (const row of conversionRows) {
      let conversions = conversionsByMaterialCode.get(row.materialCode);
      if (!conversions) {
        conversions = [];
        conversionsByMaterialCode.set(row.materialCode, conversions);
      }
      conversions.push({
        id: row.id,
        unit: row.unit,
        conversionFactorToBase: toRequiredNumber(row.conversionFactorToBase),
      });
    }

    for (const conversions of conversionsByMaterialCode.values()) {
      conversions.sort((a, b) => a.unit.localeCompare(b.unit));
    }

    const materials: MaterialExport[] = materialRows
      .map((row) => ({
        code: row.code,
        legacyCode: row.legacyCode,
        title: row.title,
        description: row.description,
        subCategoryId: row.subCategoryId,
        materialType: row.materialType,
        unitOfMeasurement: row.unitOfMeasurement,
        unitPrice: toRequiredNumber(row.unitPrice),
        quantity: toRequiredNumber(row.quantity),
        openingUnitPrice: toNumber(row.openingUnitPrice),
        openingQuantity: toNumber(row.openingQuantity),
        minimumStock: toNumber(row.minimumStock),
        createdAt: row.createdAt.toISOString(),
        unitConversions: conversionsByMaterialCode.get(row.code) ?? [],
      }))
      .sort((a, b) => a.code.localeCompare(b.code));

    const materialsWithUnitConversions = materials.filter((m) => m.unitConversions.length > 0).length;
    const totalUnitConversions = materials.reduce((sum, m) => sum + m.unitConversions.length, 0);

    const payload: ExportPayload = {
      exportedAt: new Date().toISOString(),
      count: materials.length,
      materialsWithUnitConversions,
      totalUnitConversions,
      materials,
    };

    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(payload, null, 2) + '\n', 'utf-8');

    console.log(`Exported ${materials.length} material(s) to ${outPath}`);
    console.log(`  with unit conversions: ${materialsWithUnitConversions}`);
    console.log(`  total unit conversions: ${totalUnitConversions}`);
    if (includeDeleted) {
      console.log('  (included soft-deleted materials)');
    }
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
