import * as fs from 'fs';
import * as path from 'path';
import * as xlsx from 'xlsx';
import { PRODUCT_SOURCE_TYPES, DIMENSION_UNITS } from '../src/utils/constants';

type CategoryJson = {
  legacy_code: string;
  title: string;
  subcategories: { legacy_code: string; title: string }[];
};

type ProductJson = {
  legacyCode: string;
  title: string;
  description: string | null;
  mainCategoryLegacyCode: string;
  subCategoryLegacyCode: string;
  sourceType: string;
  estimatedProductionTime: number | null;
  pricingFactor: number;
  dimensions: {
    length: number | null;
    width: number | null;
    height: number | null;
    dimensionUnit: string;
  };
};

type ParsedItem = {
  legacyCode: string;
  title: string;
  description: string | null;
  mainCategoryLegacyCode: string;
  subCategoryLegacyCode: string;
  length: number | null;
  width: number | null;
  height: number | null;
};

const ROOT = path.join(__dirname, '..');
const CODES_PATH = path.join(ROOT, 'data/products/codes.xlsx');
const CATEGORIES_PATH = path.join(ROOT, 'data/categories/products.json');
const OUT_DIR = path.join(ROOT, 'data/products/results');
const OUT_PATH = path.join(OUT_DIR, 'clean-products.json');

const DEFAULT_SOURCE_TYPE = PRODUCT_SOURCE_TYPES.MANUFACTURED;
const DEFAULT_DIMENSION_UNIT = DIMENSION_UNITS.CM;
const DEFAULT_PRICING_FACTOR = 1.5;

function norm(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value.replace(/\s+/g, ' ').trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value).replace(/\s+/g, ' ').trim();
  return '';
}

function parseNumber(value: unknown): number | null {
  if (value == null || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const cleaned = value.replace(/,/g, '').trim();
    if (!cleaned) return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function loadCategoryIndex(data: CategoryJson[]): {
  mains: Map<string, { title: string; subs: Set<string> }>;
  mainTitles: Map<string, string>;
} {
  const mains = new Map<string, { title: string; subs: Set<string> }>();
  const mainTitles = new Map<string, string>();
  for (const main of data) {
    mains.set(main.legacy_code, {
      title: main.title,
      subs: new Set(main.subcategories.map((s) => s.legacy_code)),
    });
    mainTitles.set(main.legacy_code, main.title);
  }
  return { mains, mainTitles };
}

function isCategoryHeader(row: (string | number | null)[] | undefined): boolean {
  if (!row || row.length === 0) return false;
  const first = norm(row[0]);
  const second = row[1];
  return !!first && (second == null || second === '');
}

function parseCodesXlsx(categoryIndex: Map<string, { title: string; subs: Set<string> }>): {
  valid: ParsedItem[];
  excludedCount: number;
  excludedByReason: Map<string, number>;
  duplicateLegacyCodes: string[];
} {
  const wb = xlsx.readFile(CODES_PATH);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json<(string | number | null)[]>(ws, {
    header: 1,
    defval: null,
  });

  const valid: ParsedItem[] = [];
  const excludedByReason = new Map<string, number>();
  const seenCodes = new Map<string, number>();
  const duplicateLegacyCodes: string[] = [];
  let excludedCount = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;

    if (isCategoryHeader(row)) {
      continue;
    }

    const rawCode = row[1];
    if (rawCode == null || rawCode === '') continue;

    const codeNum = parseNumber(rawCode);
    if (codeNum == null) continue;

    const legacyCode = String(Math.floor(codeNum)).padStart(8, '0');
    if (!/^4\d{7}$/.test(legacyCode)) continue;

    const title = norm(row[2]);
    if (!title) continue;

    const mainCategoryLegacyCode = legacyCode.slice(1, 3);
    const subCategoryLegacyCode = legacyCode.slice(3, 5);

    if (seenCodes.has(legacyCode)) {
      duplicateLegacyCodes.push(legacyCode);
      continue;
    }
    seenCodes.set(legacyCode, i);

    const main = categoryIndex.get(mainCategoryLegacyCode);
    if (!main) {
      excludedCount++;
      const reason = `invalid_main_category:${mainCategoryLegacyCode}`;
      excludedByReason.set(reason, (excludedByReason.get(reason) ?? 0) + 1);
      continue;
    }
    if (!main.subs.has(subCategoryLegacyCode)) {
      excludedCount++;
      const reason = `invalid_sub_category:${mainCategoryLegacyCode}/${subCategoryLegacyCode}`;
      excludedByReason.set(reason, (excludedByReason.get(reason) ?? 0) + 1);
      continue;
    }

    const length = parseNumber(row[3]);
    const width = parseNumber(row[4]);
    const height = parseNumber(row[5]);
    const description = norm(row[6] ?? '') || null;

    valid.push({
      legacyCode,
      title,
      description,
      mainCategoryLegacyCode,
      subCategoryLegacyCode,
      length,
      width,
      height,
    });
  }

  return { valid, excludedCount, excludedByReason, duplicateLegacyCodes };
}

function printStats(opts: {
  output: ProductJson[];
  excludedCount: number;
  excludedByReason: Map<string, number>;
  duplicateLegacyCodes: string[];
  mainTitles: Map<string, string>;
}): void {
  const { output, excludedCount, excludedByReason, duplicateLegacyCodes, mainTitles } = opts;

  type CatStats = {
    items: number;
    withDimensions: number;
  };
  const byMain = new Map<string, CatStats>();
  for (const row of output) {
    const stats = byMain.get(row.mainCategoryLegacyCode) ?? { items: 0, withDimensions: 0 };
    stats.items++;
    const dim = row.dimensions;
    if (dim.length != null || dim.width != null || dim.height != null) {
      stats.withDimensions++;
    }
    byMain.set(row.mainCategoryLegacyCode, stats);
  }

  let totalDimensions = 0;
  for (const s of byMain.values()) {
    totalDimensions += s.withDimensions;
  }

  console.log('\n========== PRODUCTS EXTRACTION STATS ==========');
  console.log(`codes.xlsx item rows included:     ${output.length}`);
  console.log(`excluded:                          ${excludedCount}`);
  for (const [reason, count] of [...excludedByReason.entries()].sort()) {
    console.log(`  - ${reason}: ${count}`);
  }
  console.log(`duplicate legacy codes:            ${duplicateLegacyCodes.length}`);
  if (duplicateLegacyCodes.length) {
    console.log(`  samples: ${[...new Set(duplicateLegacyCodes)].slice(0, 10).join(', ')}`);
  }

  console.log('\n--- Per main category ---');
  const header = 'code'.padEnd(6) + 'title'.padEnd(34) + 'items'.padStart(7) + 'dims'.padStart(7);
  console.log(header);
  console.log('-'.repeat(header.length));
  for (const code of [...byMain.keys()].sort()) {
    const s = byMain.get(code)!;
    const title = (mainTitles.get(code) ?? code).slice(0, 32);
    console.log(code.padEnd(6) + title.padEnd(34) + String(s.items).padStart(7) + String(s.withDimensions).padStart(7));
  }
  console.log('-'.repeat(header.length));
  console.log('TOTAL'.padEnd(6) + ''.padEnd(34) + String(output.length).padStart(7) + String(totalDimensions).padStart(7));
  console.log('===============================================\n');
}

function main(): void {
  const categories = JSON.parse(fs.readFileSync(CATEGORIES_PATH, 'utf-8')) as CategoryJson[];
  const { mains: categoryIndex, mainTitles } = loadCategoryIndex(categories);

  const { valid, excludedCount, excludedByReason, duplicateLegacyCodes } = parseCodesXlsx(categoryIndex);

  const output: ProductJson[] = [];

  for (const item of valid) {
    if (!norm(item.title)) continue;

    output.push({
      legacyCode: item.legacyCode,
      title: item.title,
      description: item.description,
      mainCategoryLegacyCode: item.mainCategoryLegacyCode,
      subCategoryLegacyCode: item.subCategoryLegacyCode,
      sourceType: DEFAULT_SOURCE_TYPE,
      estimatedProductionTime: null,
      pricingFactor: DEFAULT_PRICING_FACTOR,
      dimensions: {
        length: item.length,
        width: item.width,
        height: item.height,
        dimensionUnit: DEFAULT_DIMENSION_UNIT,
      },
    });
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(output, null, 2) + '\n', 'utf-8');

  printStats({
    output,
    excludedCount,
    excludedByReason,
    duplicateLegacyCodes,
    mainTitles,
  });

  console.log(`Wrote: ${OUT_PATH}`);
}

main();
