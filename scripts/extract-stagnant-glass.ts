import * as fs from 'fs';
import * as path from 'path';
import * as xlsx from 'xlsx';

type CategoryJson = {
  legacy_code: string;
  title: string;
  subcategories: { legacy_code: string; title: string }[];
};

type QuantityRow = {
  title: string;
  quantity: number;
  unitPrice: number | null;
  unitOfMeasurement: string;
};

type OutputRow = {
  legacyCode: string;
  title: string;
  mainCategoryLegacyCode: string;
  subCategoryLegacyCode: string;
  unitOfMeasurement: string;
  unitPrice: string;
  quantity: string;
};

/** Main category "الزجاج" / subcategory "زجاج راكد" — no codes.xls entries. */
const MAIN_CATEGORY_LEGACY_CODE = '12';
const SUB_CATEGORY_LEGACY_CODE = '02';

const UNIT_MAP: Record<string, string> = {
  عدد: 'count',
  متر: 'meter',
  كجم: 'kg',
  count: 'count',
  meter: 'meter',
  kg: 'kg',
};

const ROOT = path.join(__dirname, '..');
const STOCK_PATH = path.join(
  ROOT,
  'data/materials/raw-materials/stock/special-case/راكد الزجاج.xls',
);
const CATEGORIES_PATH = path.join(ROOT, 'data/categories/materials.json');
const OUT_DIR = path.join(ROOT, 'data/materials/raw-materials/results');

function norm(value: unknown): string {
  if (value == null) return '';
  return String(value).replace(/\s+/g, ' ').trim();
}

function normalizeUnit(raw: string): string {
  const trimmed = norm(raw);
  if (!trimmed) return '';
  return UNIT_MAP[trimmed] ?? '';
}

function parseNumber(value: unknown): number | null {
  if (value == null || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const cleaned = String(value).replace(/,/g, '').trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function escapeCsv(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function writeCsv(filePath: string, headers: string[], rows: string[][]): void {
  const lines = [headers.map(escapeCsv).join(',')];
  for (const row of rows) {
    lines.push(row.map(escapeCsv).join(','));
  }
  fs.writeFileSync(filePath, lines.join('\n') + '\n', 'utf-8');
}

function loadStagnantGlassCategory(data: CategoryJson[]): {
  mainTitle: string;
  subTitle: string;
} {
  const main = data.find((c) => c.legacy_code === MAIN_CATEGORY_LEGACY_CODE);
  if (!main) {
    throw new Error(`Main category legacy_code "${MAIN_CATEGORY_LEGACY_CODE}" not found in materials.json`);
  }

  const sub = main.subcategories.find((s) => s.legacy_code === SUB_CATEGORY_LEGACY_CODE);
  if (!sub) {
    throw new Error(
      `Subcategory legacy_code "${SUB_CATEGORY_LEGACY_CODE}" not found under main "${MAIN_CATEGORY_LEGACY_CODE}" in materials.json`,
    );
  }

  return { mainTitle: main.title, subTitle: sub.title };
}

function findHeaderRow(rows: (string | number | null)[][]): number {
  for (let i = 0; i < Math.min(15, rows.length); i++) {
    const row = rows[i];
    if (!row) continue;
    if (row.some((cell) => norm(cell) === 'اسم الصنف')) return i;
  }
  return -1;
}

function findCol(row: (string | number | null)[] | undefined, names: string[]): number {
  if (!row) return -1;
  for (let i = 0; i < row.length; i++) {
    if (names.includes(norm(row[i]))) return i;
  }
  return -1;
}

function parseQuantitySheet(rows: (string | number | null)[][]): QuantityRow[] {
  const headerIdx = findHeaderRow(rows);
  if (headerIdx === -1) return [];

  const header = rows[headerIdx] ?? [];
  const subHeader = rows[headerIdx + 1] ?? [];

  const titleCol = findCol(header, ['اسم الصنف']);
  const unitCol = findCol(header, ['الوحدة']);
  const balanceCol = findCol(header, ['الرصيد']);
  if (titleCol === -1 || balanceCol === -1) return [];

  let qtyCol = -1;
  for (let j = balanceCol; j < Math.max(subHeader.length, header.length); j++) {
    if (norm(subHeader[j]) === 'فعلى') {
      qtyCol = j;
      break;
    }
  }
  if (qtyCol === -1) qtyCol = balanceCol;

  let priceCol = -1;
  const priceSearchFrom = Math.max(titleCol + 1, balanceCol + 1);
  for (let j = priceSearchFrom; j < header.length; j++) {
    const h = norm(header[j]);
    if (h === 'السعر' || h === 'سعر الصرف') {
      priceCol = j;
      break;
    }
  }
  if (priceCol === -1) {
    for (let j = 0; j < header.length; j++) {
      const h = norm(header[j]);
      if (h === 'السعر' || h === 'سعر الصرف') {
        priceCol = j;
        break;
      }
    }
  }

  const items: QuantityRow[] = [];
  for (let i = headerIdx + 2; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;
    const title = norm(row[titleCol]);
    if (!title) continue;

    const quantity = parseNumber(row[qtyCol]) ?? 0;
    const unitPrice = priceCol >= 0 ? parseNumber(row[priceCol]) : null;
    const unitOfMeasurement = unitCol >= 0 ? norm(row[unitCol]) : '';

    items.push({ title, quantity, unitPrice, unitOfMeasurement });
  }

  return items;
}

function parseStockFile(): QuantityRow[] {
  if (!fs.existsSync(STOCK_PATH)) {
    throw new Error(`Stock file not found: ${STOCK_PATH}`);
  }

  const wb = xlsx.readFile(STOCK_PATH);
  const items: QuantityRow[] = [];

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const rows = xlsx.utils.sheet_to_json<(string | number | null)[]>(ws, {
      header: 1,
      defval: null,
    });
    if (!rows.length) continue;
    items.push(...parseQuantitySheet(rows));
  }

  return items;
}

function printStats(opts: {
  scanned: number;
  output: OutputRow[];
  duplicateTitleCount: number;
  mainTitle: string;
  subTitle: string;
}): void {
  const { scanned, output, duplicateTitleCount, mainTitle, subTitle } = opts;

  const unitCounts = new Map<string, number>();
  let totalQty = 0;
  let totalValue = 0;

  for (const row of output) {
    const key = row.unitOfMeasurement || '(blank)';
    unitCounts.set(key, (unitCounts.get(key) ?? 0) + 1);
    const qty = Number(row.quantity) || 0;
    const cost = row.unitPrice === '' ? null : Number(row.unitPrice);
    totalQty += qty;
    if (cost != null) totalValue += qty * cost;
  }

  console.log('\n========== STAGNANT GLASS EXTRACTION STATS ==========');
  console.log(`stock file:                      ${STOCK_PATH}`);
  console.log(
    `category:                        ${MAIN_CATEGORY_LEGACY_CODE}/${SUB_CATEGORY_LEGACY_CODE} (${mainTitle} / ${subTitle})`,
  );
  console.log(`stock rows scanned:              ${scanned}`);
  console.log(`included in clean-stagnant-glass.csv: ${output.length}`);
  console.log(`duplicate titles skipped:        ${duplicateTitleCount}`);
  console.log(`legacy codes:                    none (legacyCode left empty)`);

  console.log('\n--- Totals ---');
  console.log(`total quantity:                  ${totalQty.toLocaleString('en-US', { maximumFractionDigits: 2 })}`);
  console.log(`total value:                     ${totalValue.toLocaleString('en-US', { maximumFractionDigits: 2 })}`);

  console.log('\n--- Unit distribution ---');
  for (const [unit, count] of [...unitCounts.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${unit}: ${count}`);
  }
  console.log('====================================================\n');
}

function main(): void {
  const categories = JSON.parse(fs.readFileSync(CATEGORIES_PATH, 'utf-8')) as CategoryJson[];
  const { mainTitle, subTitle } = loadStagnantGlassCategory(categories);

  const items = parseStockFile();
  const seenTitles = new Set<string>();
  const output: OutputRow[] = [];
  let duplicateTitleCount = 0;

  for (const item of items) {
    const titleKey = norm(item.title);
    if (!titleKey) continue;

    if (seenTitles.has(titleKey)) {
      duplicateTitleCount++;
      continue;
    }
    seenTitles.add(titleKey);

    output.push({
      legacyCode: '',
      title: item.title,
      mainCategoryLegacyCode: MAIN_CATEGORY_LEGACY_CODE,
      subCategoryLegacyCode: SUB_CATEGORY_LEGACY_CODE,
      unitOfMeasurement: normalizeUnit(item.unitOfMeasurement),
      unitPrice: item.unitPrice == null ? '' : String(item.unitPrice),
      quantity: String(item.quantity),
    });
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });

  const outPath = path.join(OUT_DIR, 'clean-stagnant-glass.csv');
  writeCsv(
    outPath,
    [
      'legacyCode',
      'title',
      'mainCategoryLegacyCode',
      'subCategoryLegacyCode',
      'unitOfMeasurement',
      'unitPrice',
      'quantity',
    ],
    output.map((r) => [
      r.legacyCode,
      r.title,
      r.mainCategoryLegacyCode,
      r.subCategoryLegacyCode,
      r.unitOfMeasurement,
      r.unitPrice,
      r.quantity,
    ]),
  );

  printStats({
    scanned: items.length,
    output,
    duplicateTitleCount,
    mainTitle,
    subTitle,
  });

  console.log(`Wrote: ${outPath}`);
}

main();
