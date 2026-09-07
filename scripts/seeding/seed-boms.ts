import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq, sql, isNull } from 'drizzle-orm';
import { parseArgs } from 'node:util';
import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import * as XLSX from 'xlsx';
import * as schema from '../../src/database/schema';
import { MATERIAL_UNIT_VALUES, PRODUCTION_SUB_DEPARTMENT_VALUES } from '../../src/utils/constants';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config();

const USAGE = `Usage: npm run seed:boms [-- --email <email> | --id <uuid>]

Seeds product_standard_boms from data/boms/*.xls.
Each file must start with the productDimensionId UUID
(e.g. "<uuid> - product name.xls"). Any trailing name is ignored.

Requires:
  - Existing product_dimensions (UUID prefix of filename must match dimension IDs)
  - Existing materials (matched by title; fuzzy fallback allowed)
  - Writes an Arabic seeding report into product_dimensions.notes

If --email / --id are omitted, you will be prompted for an email or user ID.
The user must be an active admin.

Options:
  -e, --email <email>  Existing user email stamped as createdBy
  -i, --id <uuid>      Existing user ID stamped as createdBy
  -h, --help           Show this help

Examples:
  npm run seed:boms
  npm run seed:boms -- --email admin@example.com
  npm run seed:boms -- --id 00000000-0000-0000-0000-000000000001`;

type MaterialUnit = (typeof MATERIAL_UNIT_VALUES)[number];
type ProductionSubDepartment = (typeof PRODUCTION_SUB_DEPARTMENT_VALUES)[number];

type MaterialRef = {
  code: string;
  title: string;
  normalizedTitle: string;
  unitOfMeasurement: MaterialUnit;
  conversionUnits: Set<MaterialUnit>;
};

type DimensionRef = {
  id: string;
  productCode: string;
  productTitle: string;
};

type SkipReason = 'unit-unresolvable' | 'no-material-match' | 'already-exists' | 'invalid-quantity';

type FuzzyMatchDetail = {
  file: string;
  productDimensionId: string;
  xlsTitle: string;
  materialCode: string;
  materialTitle: string;
  score: number;
};

type SkipDetail = {
  file: string;
  productDimensionId: string;
  xlsTitle: string;
  unitRaw: string;
  reason: SkipReason;
  closestTitle?: string;
  closestScore?: number;
  /** Matched system material title (for already-exists skips). */
  materialTitle?: string;
};

type FileStats = {
  file: string;
  productDimensionId: string | null;
  productLabel: string;
  sheetRowsTotal: number;
  itemRowsDetected: number;
  insertedExact: number;
  insertedFuzzy: number;
  skippedNoMaterial: number;
  skippedUnitUnresolvable: number;
  skippedAlreadyExists: number;
  skippedInvalidQuantity: number;
  unmappedSections: string[];
};

const UUID_PREFIX_RE = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BATCH_SIZE = 100;
const FUZZY_MATCH_THRESHOLD = 0.5;
const DATA_DIR = path.join(__dirname, '../../data/boms');
const SKIP_DETAIL_CAP = 50;

const UNIT_AR_LABELS: Record<MaterialUnit, string> = {
  count: 'عدد',
  kg: 'كيلوجرام',
  gram: 'جرام',
  ton: 'طن',
  meter: 'متر',
  cm: 'سنتيمتر',
  square_meter: 'متر²',
  cubic_meter: 'متر³',
  liter: 'لتر',
};

const UNIT_AR_ALIASES: Partial<Record<MaterialUnit, string[]>> = {
  count: ['لوح', 'عبوة'],
  kg: ['كيلو', 'كجم'],
  square_meter: ['متر 2', 'م2', 'م²'],
  cubic_meter: ['متر 3', 'م3', 'م³'],
};

const ARABIC_TO_UNIT_KEY: Map<string, MaterialUnit> = (() => {
  const map = new Map<string, MaterialUnit>();
  for (const unit of MATERIAL_UNIT_VALUES) {
    map.set(unit, unit);
    map.set(UNIT_AR_LABELS[unit], unit);
    for (const alias of UNIT_AR_ALIASES[unit] ?? []) {
      map.set(alias, unit);
    }
  }
  return map;
})();

function parseCliArgs(): { email?: string; id?: string } {
  try {
    const { values } = parseArgs({
      options: {
        email: { type: 'string', short: 'e' },
        id: { type: 'string', short: 'i' },
        help: { type: 'boolean', short: 'h' },
      },
      allowPositionals: false,
    });

    if (values.help) {
      console.log(USAGE);
      process.exit(0);
    }

    return {
      email: values.email?.trim() || undefined,
      id: values.id?.trim() || undefined,
    };
  } catch {
    console.error(USAGE);
    process.exit(1);
  }
}

async function promptForUserIdentifier(partial: { email?: string; id?: string }): Promise<{ email?: string; id?: string }> {
  if (partial.email || partial.id) return partial;

  const rl = readline.createInterface({ input, output });
  try {
    console.log('\nEnter the user to stamp as createdBy (email or user ID).');
    const answer = (await rl.question('Email or user ID: ')).trim();
    if (!answer) throw new Error('Email or user ID is required.');

    if (UUID_RE.test(answer)) return { id: answer };
    return { email: answer };
  } finally {
    rl.close();
  }
}

async function resolveUser(db: ReturnType<typeof drizzle<typeof schema>>, identifier: { email?: string; id?: string }) {
  const user = identifier.id
    ? await db.query.users.findFirst({
        where: eq(schema.users.id, identifier.id),
        columns: { id: true, email: true, name: true, deletedAt: true, isAdmin: true },
      })
    : await db.query.users.findFirst({
        where: eq(schema.users.email, identifier.email!),
        columns: { id: true, email: true, name: true, deletedAt: true, isAdmin: true },
      });

  if (!user || user.deletedAt) {
    const label = identifier.email ? `email "${identifier.email}"` : `id "${identifier.id}"`;
    throw new Error(`No active user found with ${label}.`);
  }

  if (!user.isAdmin) {
    const label = user.email ? `${user.name} <${user.email}>` : `${user.name} (${user.id})`;
    throw new Error(`User ${label} is not an admin. Only admins can seed BOMs.`);
  }

  return user;
}

function normalizeTitle(value: string): string {
  return value
    .replace(/[×xX*]/g, '×')
    .replace(/\s+/g, ' ')
    .replace(/\.+$/g, '')
    .trim()
    .toLowerCase();
}

function resolveMaterialUnit(raw: string): MaterialUnit | null {
  const normalized = raw.trim();
  if (!normalized || normalized === '(فارغ)') return null;
  return ARABIC_TO_UNIT_KEY.get(normalized) ?? null;
}

/** Strip Arabic tatweel/kashida (ـ) and collapse whitespace so elongated headers still match. */
function normalizeSectionText(headerText: string): string {
  return headerText
    .replace(/\u0640+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function mapSectionToDepartment(headerText: string): ProductionSubDepartment | null {
  const text = normalizeSectionText(headerText);

  // Special case: metal sheets store -> cutting
  if (text.includes('الواح معدنية') || text.includes('الألواح المعدنية') || text.includes('الالواح المعدنية')) {
    return 'cutting';
  }

  if (text.includes('حقن')) return 'injection';
  if (text.includes('تبريد')) return 'refrigeration';
  if (text.includes('كهرباء')) return 'electricity';
  if (text.includes('غاز')) return 'gas';
  if (text.includes('حدادة')) return 'blacksmithing';
  if (text.includes('قطع')) return 'cutting';
  if (text.includes('ثني')) return 'bending';

  if (text.includes('سمكرة')) {
    if (text.includes('بارد')) return 'sheet_metal_cold';
    if (text.includes('سخن') || text.includes('ساخن')) return 'sheet_metal_hot';
    return 'sheet_metal_neutral';
  }

  return null;
}

function isSectionHeader(row: unknown[]): boolean {
  const col0 = row[0];
  const col1 = row[1];
  if (typeof col0 !== 'string') return false;
  const text = normalizeSectionText(col0);
  if (!text) return false;
  // Section headers typically have empty title/unit/qty columns
  const col1Empty = col1 === '' || col1 == null;
  if (!col1Empty) return false;
  // Subtotal / total rows
  if (text.includes('اجمالى') || text.includes('اجمالي') || text.includes('إجمالى') || text.includes('إجمالي')) {
    return false;
  }
  // Company / product header rows without "مخزن"
  if (
    !text.includes('مخزن') &&
    !text.includes('الواح') &&
    !text.includes('سمكرة') &&
    !text.includes('كهرباء') &&
    !text.includes('تبريد') &&
    !text.includes('حقن')
  ) {
    return false;
  }
  return text.includes('مخزن') || text.includes('الواح معدنية') || text.includes('الالواح المعدنية');
}

function parseQuantity(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value > 0 ? value : null;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const n = Number(trimmed);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  return null;
}

function isItemRow(row: unknown[]): { title: string; unitRaw: string; quantity: number } | null {
  const col0 = row[0];
  if (typeof col0 !== 'number') return null;

  const title = String(row[1] ?? '').trim();
  if (!title) return null;

  const quantity = parseQuantity(row[3]);
  if (quantity == null) return null;

  const unitRaw = String(row[2] ?? '').trim();
  return { title, unitRaw, quantity };
}

function bigramSet(s: string): Set<string> {
  const set = new Set<string>();
  if (s.length < 2) {
    if (s.length === 1) set.add(s);
    return set;
  }
  for (let i = 0; i < s.length - 1; i++) {
    set.add(s.slice(i, i + 2));
  }
  return set;
}

function diceCoefficient(a: string, b: string): number {
  if (a === b) return 1;
  if (!a.length || !b.length) return 0;
  const aSet = bigramSet(a);
  const bSet = bigramSet(b);
  if (aSet.size === 0 || bSet.size === 0) return 0;
  let intersection = 0;
  for (const bg of aSet) {
    if (bSet.has(bg)) intersection++;
  }
  return (2 * intersection) / (aSet.size + bSet.size);
}

function materialSupportsUnit(material: MaterialRef, unit: MaterialUnit): boolean {
  return material.unitOfMeasurement === unit || material.conversionUnits.has(unit);
}

function findMaterialMatch(
  xlsTitle: string,
  resolvedUnit: MaterialUnit,
  materials: MaterialRef[],
):
  | { material: MaterialRef; exact: boolean; score: number }
  | { material: null; closestTitle?: string; closestScore?: number } {
  const normalized = normalizeTitle(xlsTitle);
  const candidates = materials.filter((m) => materialSupportsUnit(m, resolvedUnit));

  for (const m of candidates) {
    if (m.normalizedTitle === normalized) {
      return { material: m, exact: true, score: 1 };
    }
  }

  let best: MaterialRef | null = null;
  let bestScore = 0;
  for (const m of candidates) {
    const score = diceCoefficient(normalized, m.normalizedTitle);
    if (score > bestScore) {
      bestScore = score;
      best = m;
    }
  }

  if (best && bestScore >= FUZZY_MATCH_THRESHOLD) {
    return { material: best, exact: false, score: bestScore };
  }

  return {
    material: null,
    closestTitle: best?.title,
    closestScore: best ? bestScore : undefined,
  };
}

function existingBomKey(productDimensionId: string, materialCode: string, dept: ProductionSubDepartment | null): string {
  return `${productDimensionId}|${materialCode}|${dept ?? ''}`;
}

function emptyFileStats(file: string): FileStats {
  return {
    file,
    productDimensionId: null,
    productLabel: '(unknown)',
    sheetRowsTotal: 0,
    itemRowsDetected: 0,
    insertedExact: 0,
    insertedFuzzy: 0,
    skippedNoMaterial: 0,
    skippedUnitUnresolvable: 0,
    skippedAlreadyExists: 0,
    skippedInvalidQuantity: 0,
    unmappedSections: [],
  };
}

/** Files are named "<uuid>" or "<uuid> - product name.xls" — always take the leading UUID. */
function extractDimensionIdFromFilename(file: string): string | null {
  const basename = path.basename(file, path.extname(file)).trim();
  const match = basename.match(UUID_PREFIX_RE);
  return match?.[1]?.toLowerCase() ?? null;
}

function formatSeedTimestamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function buildDimensionSeedNotes({
  seededAt,
  stats,
  skips,
}: {
  seededAt: Date;
  stats: FileStats;
  skips: SkipDetail[];
}): string {
  const lines: string[] = [];
  const timestamp = formatSeedTimestamp(seededAt);

  lines.push('تقرير استيراد قائمة المواد (BOM)');
  lines.push(`وقت الاستيراد: ${timestamp}`);
  lines.push(`الملف: ${stats.file}`);
  lines.push('');
  lines.push('──────── الملخص ────────');
  lines.push('');
  lines.push(`• صفوف العناصر المكتشفة: ${stats.itemRowsDetected}`);
  lines.push(`• تم الإدراج (تطابق تام للاسم): ${stats.insertedExact}`);
  lines.push(`• تم الإدراج (تطابق تقريبي للاسم): ${stats.insertedFuzzy}`);
  lines.push(`• إجمالي المدرج: ${stats.insertedExact + stats.insertedFuzzy}`);
  lines.push(`• تم التخطي — لا توجد خامة مطابقة: ${stats.skippedNoMaterial}`);
  lines.push(`• تم التخطي — وحدة قياس غير معروفة: ${stats.skippedUnitUnresolvable}`);
  lines.push(`• تم التخطي — موجود مسبقاً: ${stats.skippedAlreadyExists}`);
  if (stats.skippedInvalidQuantity > 0) {
    lines.push(`• تم التخطي — كمية غير صالحة: ${stats.skippedInvalidQuantity}`);
  }

  if (stats.unmappedSections.length > 0) {
    lines.push('');
    lines.push('──────── أقسام مخازن لم تُربط بقسم إنتاج ────────');
    lines.push('');
    for (const section of stats.unmappedSections) {
      lines.push(`• ${section}`);
    }
  }

  if (skips.length > 0) {
    lines.push('');
    lines.push('──────── العناصر التي تم تخطيها ────────');

    const skipsByReason: { reason: SkipReason; label: string; items: SkipDetail[] }[] = [
      {
        reason: 'no-material-match',
        label: 'لا توجد خامة مطابقة',
        items: skips.filter((s) => s.reason === 'no-material-match'),
      },
      {
        reason: 'unit-unresolvable',
        label: 'وحدة قياس غير معروفة / غير مدعومة',
        items: skips.filter((s) => s.reason === 'unit-unresolvable'),
      },
      {
        reason: 'already-exists',
        label: 'موجود مسبقاً في قاعدة البيانات',
        items: skips.filter((s) => s.reason === 'already-exists'),
      },
      {
        reason: 'invalid-quantity',
        label: 'كمية غير صالحة',
        items: skips.filter((s) => s.reason === 'invalid-quantity'),
      },
    ];

    for (const group of skipsByReason) {
      if (group.items.length === 0) continue;

      lines.push('');
      lines.push(`── ${group.label} (${group.items.length}) ──`);
      lines.push('');

      group.items.forEach((s, i) => {
        if (s.reason === 'already-exists') {
          lines.push(`${i + 1}. الاسم في الملف: ${s.xlsTitle}`);
          lines.push(`   الاسم في النظام: ${s.materialTitle ?? '(غير معروف)'}`);
          return;
        }

        lines.push(`${i + 1}. ${s.xlsTitle}`);
        if (s.reason === 'unit-unresolvable') {
          lines.push(`   الوحدة في الملف: ${s.unitRaw || '(فارغ)'}`);
        }
        if (s.reason === 'no-material-match' && s.closestTitle != null) {
          lines.push(`   أقرب خامة: ${s.closestTitle}`);
          lines.push(`   درجة التشابه: ${(s.closestScore ?? 0).toFixed(3)}`);
        }
      });
    }
  }

  if (skips.length === 0 && stats.unmappedSections.length === 0) {
    lines.push('');
    lines.push('لا توجد عناصر متخطاة أو مشاكل لهذه المقاس.');
  }

  // Use CRLF so notes render cleanly in Windows / many textareas.
  return lines.join('\r\n').trimEnd();
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not defined in .env');

  const cli = parseCliArgs();
  const identifier = await promptForUserIdentifier(cli);

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool, { schema });

  try {
    const user = await resolveUser(db, identifier);
    console.log(`Using createdBy: ${user.name} <${user.email ?? 'no email'}> (${user.id})`);

    if (!fs.existsSync(DATA_DIR)) {
      throw new Error(`BOM data directory not found: ${DATA_DIR}`);
    }

    const xlsFiles = fs
      .readdirSync(DATA_DIR)
      .filter((f) => f.toLowerCase().endsWith('.xls') || f.toLowerCase().endsWith('.xlsx'))
      .sort();

    if (xlsFiles.length === 0) {
      console.log(`No .xls/.xlsx files found in ${DATA_DIR}`);
      return;
    }
    console.log(`Found ${xlsFiles.length} BOM file(s) in data/boms`);

    const materialRows = await db
      .select({
        code: schema.materials.code,
        title: schema.materials.title,
        unitOfMeasurement: schema.materials.unitOfMeasurement,
        deletedAt: schema.materials.deletedAt,
      })
      .from(schema.materials)
      .where(isNull(schema.materials.deletedAt));

    const conversionRows = await db
      .select({
        materialCode: schema.materialUnitConversions.materialCode,
        unit: schema.materialUnitConversions.unit,
      })
      .from(schema.materialUnitConversions);

    const conversionsByCode = new Map<string, Set<MaterialUnit>>();
    for (const row of conversionRows) {
      let set = conversionsByCode.get(row.materialCode);
      if (!set) {
        set = new Set();
        conversionsByCode.set(row.materialCode, set);
      }
      set.add(row.unit);
    }

    const materials: MaterialRef[] = materialRows.map((row) => ({
      code: row.code,
      title: row.title,
      normalizedTitle: normalizeTitle(row.title),
      unitOfMeasurement: row.unitOfMeasurement,
      conversionUnits: conversionsByCode.get(row.code) ?? new Set(),
    }));
    console.log(`Loaded ${materials.length} active materials (+ ${conversionRows.length} unit conversions)`);

    const dimensionRows = await db
      .select({
        id: schema.productDimensions.id,
        productCode: schema.productDimensions.productCode,
        productTitle: schema.products.title,
      })
      .from(schema.productDimensions)
      .innerJoin(schema.products, eq(schema.productDimensions.productCode, schema.products.code));

    const dimensionsById = new Map<string, DimensionRef>();
    for (const row of dimensionRows) {
      dimensionsById.set(row.id.toLowerCase(), {
        id: row.id,
        productCode: row.productCode,
        productTitle: row.productTitle,
      });
    }
    console.log(`Loaded ${dimensionsById.size} product dimensions`);

    const existingBomRows = await db
      .select({
        productDimensionId: schema.productStandardBoms.productDimensionId,
        materialCode: schema.productStandardBoms.materialCode,
        productionSubDepartment: schema.productStandardBoms.productionSubDepartment,
      })
      .from(schema.productStandardBoms);

    const existingBomKeys = new Set<string>();
    for (const row of existingBomRows) {
      existingBomKeys.add(existingBomKey(row.productDimensionId, row.materialCode, row.productionSubDepartment));
    }
    console.log(`Existing product_standard_boms rows: ${existingBomRows.length}`);

    const toInsert: (typeof schema.productStandardBoms.$inferInsert)[] = [];
    const fileStatsList: FileStats[] = [];
    const fuzzyDetails: FuzzyMatchDetail[] = [];
    const skipDetails: SkipDetail[] = [];
    const unknownDimensionFiles: string[] = [];
    const deptInsertCounts = new Map<string, number>();
    const seededAt = new Date();

    for (const file of xlsFiles) {
      const stats = emptyFileStats(file);
      const productDimensionId = extractDimensionIdFromFilename(file);

      if (!productDimensionId || !dimensionsById.has(productDimensionId)) {
        unknownDimensionFiles.push(file);
        stats.productLabel = `(unknown dimension id: ${productDimensionId ?? 'n/a'})`;
        fileStatsList.push(stats);
        console.log(
          `Skipping ${file}: no matching product_dimensions row for id ${productDimensionId ?? '(not found in filename)'}`,
        );
        continue;
      }

      const dimension = dimensionsById.get(productDimensionId)!;
      stats.productDimensionId = productDimensionId;
      stats.productLabel = `${dimension.productCode} - ${dimension.productTitle}`;

      const wb = XLSX.readFile(path.join(DATA_DIR, file));
      let currentDept: ProductionSubDepartment | null = null;

      for (const sheetName of wb.SheetNames) {
        const sheet = wb.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' });
        stats.sheetRowsTotal += rows.length;
        currentDept = null;

        for (const row of rows) {
          if (!Array.isArray(row)) continue;

          if (isSectionHeader(row)) {
            const headerText = String(row[0]).trim();
            const mapped = mapSectionToDepartment(headerText);
            currentDept = mapped;
            if (mapped == null && normalizeSectionText(headerText).includes('مخزن')) {
              if (!stats.unmappedSections.includes(headerText)) {
                stats.unmappedSections.push(headerText);
              }
            }
            continue;
          }

          const item = isItemRow(row);
          if (!item) continue;
          stats.itemRowsDetected++;

          const resolvedUnit = resolveMaterialUnit(item.unitRaw);
          if (!resolvedUnit) {
            stats.skippedUnitUnresolvable++;
            skipDetails.push({
              file,
              productDimensionId,
              xlsTitle: item.title,
              unitRaw: item.unitRaw,
              reason: 'unit-unresolvable',
            });
            continue;
          }

          const match = findMaterialMatch(item.title, resolvedUnit, materials);
          if (!match.material) {
            stats.skippedNoMaterial++;
            skipDetails.push({
              file,
              productDimensionId,
              xlsTitle: item.title,
              unitRaw: item.unitRaw,
              reason: 'no-material-match',
              closestTitle: match.closestTitle,
              closestScore: match.closestScore,
            });
            continue;
          }

          const key = existingBomKey(productDimensionId, match.material.code, currentDept);
          if (existingBomKeys.has(key)) {
            stats.skippedAlreadyExists++;
            skipDetails.push({
              file,
              productDimensionId,
              xlsTitle: item.title,
              unitRaw: item.unitRaw,
              reason: 'already-exists',
              materialTitle: match.material.title,
            });
            continue;
          }

          const unitOfMeasurementSelected =
            resolvedUnit === match.material.unitOfMeasurement ? null : resolvedUnit;

          const notes = match.exact ? null : `Original: ${item.title}`;

          toInsert.push({
            productDimensionId,
            materialCode: match.material.code,
            quantityRequired: item.quantity,
            unitOfMeasurementSelected,
            productionSubDepartment: currentDept,
            notes,
            createdBy: user.id,
          });

          existingBomKeys.add(key);

          const deptKey = currentDept ?? '(null)';
          deptInsertCounts.set(deptKey, (deptInsertCounts.get(deptKey) ?? 0) + 1);

          if (match.exact) {
            stats.insertedExact++;
          } else {
            stats.insertedFuzzy++;
            fuzzyDetails.push({
              file,
              productDimensionId,
              xlsTitle: item.title,
              materialCode: match.material.code,
              materialTitle: match.material.title,
              score: match.score,
            });
          }
        }
      }

      fileStatsList.push(stats);
    }

    const dimensionNotesUpdates = fileStatsList
      .filter((s): s is FileStats & { productDimensionId: string } => s.productDimensionId != null)
      .map((s) => ({
        productDimensionId: s.productDimensionId,
        notes: buildDimensionSeedNotes({
          seededAt,
          stats: s,
          skips: skipDetails.filter((sk) => sk.productDimensionId === s.productDimensionId),
        }),
      }));

    console.log(`\nPrepared ${toInsert.length} BOM row(s) to insert`);
    console.log(`Prepared ${dimensionNotesUpdates.length} product_dimensions.notes update(s)`);
    console.log('Writing all inserts and notes in one database transaction. A failure rolls back the entire run.');

    await db.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL statement_timeout = 0`);
      await tx.execute(sql`SET LOCAL idle_in_transaction_session_timeout = 0`);

      if (toInsert.length > 0) {
        for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
          const batch = toInsert.slice(i, i + BATCH_SIZE);
          await tx.insert(schema.productStandardBoms).values(batch);
          process.stdout.write(`\rInserted ${Math.min(i + BATCH_SIZE, toInsert.length)} / ${toInsert.length}`);
        }
        console.log();
      } else {
        console.log('No new BOM rows to insert.');
      }

      for (const update of dimensionNotesUpdates) {
        await tx
          .update(schema.productDimensions)
          .set({ notes: update.notes })
          .where(eq(schema.productDimensions.id, update.productDimensionId));
      }
      if (dimensionNotesUpdates.length > 0) {
        console.log(`Updated notes on ${dimensionNotesUpdates.length} product dimension(s).`);
      }
    });

    // ========== STATS ==========
    console.log('\n========== BOM SEED STATS (PER FILE) ==========');
    for (const s of fileStatsList) {
      console.log(`\n=== ${s.file} (${s.productLabel}) ===`);
      console.log(`  Sheet rows total:              ${s.sheetRowsTotal}`);
      console.log(`  Item rows detected:            ${s.itemRowsDetected}`);
      console.log(`  Inserted (exact title match):  ${s.insertedExact}`);
      console.log(`  Inserted (fuzzy title match):  ${s.insertedFuzzy}`);
      console.log(`  Skipped - no material match:   ${s.skippedNoMaterial}`);
      console.log(`  Skipped - unit unresolvable:   ${s.skippedUnitUnresolvable}`);
      console.log(`  Skipped - already exists:      ${s.skippedAlreadyExists}`);
      if (s.skippedInvalidQuantity > 0) {
        console.log(`  Skipped - invalid quantity:    ${s.skippedInvalidQuantity}`);
      }
      if (s.unmappedSections.length > 0) {
        console.log(`  Unmapped sections:             ${s.unmappedSections.join(' | ')}`);
      } else {
        console.log(`  Unmapped sections:             (none)`);
      }
    }

    const totals = fileStatsList.reduce(
      (acc, s) => {
        acc.sheetRowsTotal += s.sheetRowsTotal;
        acc.itemRowsDetected += s.itemRowsDetected;
        acc.insertedExact += s.insertedExact;
        acc.insertedFuzzy += s.insertedFuzzy;
        acc.skippedNoMaterial += s.skippedNoMaterial;
        acc.skippedUnitUnresolvable += s.skippedUnitUnresolvable;
        acc.skippedAlreadyExists += s.skippedAlreadyExists;
        return acc;
      },
      {
        sheetRowsTotal: 0,
        itemRowsDetected: 0,
        insertedExact: 0,
        insertedFuzzy: 0,
        skippedNoMaterial: 0,
        skippedUnitUnresolvable: 0,
        skippedAlreadyExists: 0,
      },
    );

    console.log('\n========== BOM SEED STATS (OVERALL) ==========');
    console.log(`Files processed:                 ${xlsFiles.length}`);
    console.log(`Files with unknown dimension:    ${unknownDimensionFiles.length}`);
    console.log(`Sheet rows total:                ${totals.sheetRowsTotal}`);
    console.log(`Item rows detected:              ${totals.itemRowsDetected}`);
    console.log(`Inserted (exact title match):    ${totals.insertedExact}`);
    console.log(`Inserted (fuzzy title match):    ${totals.insertedFuzzy}`);
    console.log(`Inserted (total):                ${totals.insertedExact + totals.insertedFuzzy}`);
    console.log(`Skipped - no material match:     ${totals.skippedNoMaterial}`);
    console.log(`Skipped - unit unresolvable:     ${totals.skippedUnitUnresolvable}`);
    console.log(`Skipped - already exists:        ${totals.skippedAlreadyExists}`);

    console.log('\n--- Inserts by production_sub_department ---');
    for (const [dept, count] of [...deptInsertCounts.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${dept}: ${count}`);
    }
    if (deptInsertCounts.size === 0) {
      console.log('  (none)');
    }

    if (fuzzyDetails.length > 0) {
      console.log('\n--- Fuzzy matches (xls -> material) ---');
      for (const d of fuzzyDetails) {
        console.log(`  [${d.file}] score=${d.score.toFixed(3)} | "${d.xlsTitle}" -> ${d.materialCode} "${d.materialTitle}"`);
      }
    }

    if (skipDetails.length > 0) {
      console.log(`\n--- Skipped items (showing up to ${SKIP_DETAIL_CAP}) ---`);
      for (const d of skipDetails.slice(0, SKIP_DETAIL_CAP)) {
        const extra =
          d.reason === 'no-material-match' && d.closestTitle != null
            ? ` | closest="${d.closestTitle}" score=${(d.closestScore ?? 0).toFixed(3)}`
            : d.reason === 'unit-unresolvable'
              ? ` | unit="${d.unitRaw || '(empty)'}"`
              : '';
        console.log(`  [${d.file}] ${d.reason} | "${d.xlsTitle}"${extra}`);
      }
      if (skipDetails.length > SKIP_DETAIL_CAP) {
        console.log(`  ... and ${skipDetails.length - SKIP_DETAIL_CAP} more`);
      }
    }

    if (unknownDimensionFiles.length > 0) {
      console.log('\n--- Files skipped (unknown product_dimension id) ---');
      for (const f of unknownDimensionFiles) {
        console.log(`  ${f}`);
      }
    }

    console.log('==============================================\n');
    console.log('BOM seed completed successfully.');
  } catch (e) {
    const err = e as Error & { cause?: { message?: string; code?: string; detail?: string } };
    console.error(err.message);
    if (err.cause?.message) console.error(`Cause: ${err.cause.message}`);
    if (err.cause?.detail) console.error(`Detail: ${err.cause.detail}`);
    console.error('Seed failed; all database changes from this run were rolled back.');
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

void main();
