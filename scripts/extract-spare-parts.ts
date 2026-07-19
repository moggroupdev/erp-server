import * as fs from 'fs';
import * as path from 'path';
import * as xlsx from 'xlsx';
import { parse } from 'csv-parse/sync';

type CategoryJson = {
  legacy_code: string;
  title: string;
  subcategories: { legacy_code: string; title: string }[];
};

type CodeRow = {
  legacyCode: string;
  title: string;
  unitRaw: string;
  mainCategoryLegacyCode: string;
  subCategoryLegacyCode: string;
};

type QuantityRow = {
  title: string;
  quantity: number;
  unitCost: number | null;
  unit: string;
};

type OutputRow = {
  legacyCode: string;
  title: string;
  mainCategoryLegacyCode: string;
  subCategoryLegacyCode: string;
  unit: string;
  unitCost: string;
  quantity: string;
};

/** Always use materials.json main category "قطع غيار الماكينات". */
const MAIN_CATEGORY_LEGACY_CODE = '50';

const UNIT_MAP: Record<string, string> = {
  عدد: 'count',
  متر: 'meter',
  كجم: 'kg',
  count: 'count',
  meter: 'meter',
  kg: 'kg',
};

const ROOT = path.join(__dirname, '..');
const CODES_PATH = path.join(ROOT, 'data/materials/spare-parts/codes.csv');
const QUANTITIES_PATH = path.join(ROOT, 'data/materials/spare-parts/stock/قطع الغيار.xls');
const CATEGORIES_PATH = path.join(ROOT, 'data/categories/materials.json');
const OUT_DIR = path.join(ROOT, 'data/materials/spare-parts/results');

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

function loadSparePartsCategory(data: CategoryJson[]): {
  main: { title: string; subs: Set<string> };
  mainTitles: Map<string, string>;
} {
  const main = data.find((c) => c.legacy_code === MAIN_CATEGORY_LEGACY_CODE);
  if (!main) {
    throw new Error(`Main category legacy_code "${MAIN_CATEGORY_LEGACY_CODE}" not found in materials.json`);
  }

  const mainTitles = new Map<string, string>([[main.legacy_code, main.title]]);
  return {
    main: {
      title: main.title,
      subs: new Set(main.subcategories.map((s) => s.legacy_code)),
    },
    mainTitles,
  };
}

type CodesCsvRow = {
  legacyCode: string;
  title: string;
  subCategoryLegacyCode: string;
  unit: string;
};

function parseCodesCsv(validSubs: Set<string>): {
  valid: CodeRow[];
  excludedCount: number;
  excludedByReason: Map<string, number>;
  duplicateLegacyCodes: string[];
} {
  const raw = fs.readFileSync(CODES_PATH);
  const records = parse<CodesCsvRow>(raw, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
    bom: true,
  });

  const valid: CodeRow[] = [];
  const excludedByReason = new Map<string, number>();
  const seenCodes = new Map<string, number>();
  const duplicateLegacyCodes: string[] = [];
  let excludedCount = 0;

  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    const legacyCode = norm(record.legacyCode);
    if (!legacyCode) continue;

    const title = norm(record.title);
    const unitRaw = norm(record.unit);
    const subCategoryLegacyCode = norm(record.subCategoryLegacyCode);

    if (seenCodes.has(legacyCode)) {
      duplicateLegacyCodes.push(legacyCode);
    } else {
      seenCodes.set(legacyCode, i);
    }

    if (!validSubs.has(subCategoryLegacyCode)) {
      excludedCount++;
      const reason = `invalid_sub_category:${MAIN_CATEGORY_LEGACY_CODE}/${subCategoryLegacyCode}`;
      excludedByReason.set(reason, (excludedByReason.get(reason) ?? 0) + 1);
      continue;
    }

    valid.push({
      legacyCode,
      title,
      unitRaw,
      mainCategoryLegacyCode: MAIN_CATEGORY_LEGACY_CODE,
      subCategoryLegacyCode,
    });
  }

  return { valid, excludedCount, excludedByReason, duplicateLegacyCodes };
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

  // Stock file codes (e.g. D16000) are ignored — match by title only.

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
    const unitCost = priceCol >= 0 ? parseNumber(row[priceCol]) : null;
    const unit = unitCol >= 0 ? norm(row[unitCol]) : '';

    items.push({ title, quantity, unitCost, unit });
  }

  return items;
}

function parseQuantitiesAndCosts(): {
  byTitle: Map<string, QuantityRow>;
  duplicateCount: number;
  totalRows: number;
  sheetsParsed: number;
} {
  const byTitle = new Map<string, QuantityRow>();
  let duplicateCount = 0;
  let totalRows = 0;
  let sheetsParsed = 0;

  if (!fs.existsSync(QUANTITIES_PATH)) {
    throw new Error(`Stock file not found: ${QUANTITIES_PATH}`);
  }

  const wb = xlsx.readFile(QUANTITIES_PATH);
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const rows = xlsx.utils.sheet_to_json<(string | number | null)[]>(ws, {
      header: 1,
      defval: null,
    });
    if (!rows.length) continue;

    const items = parseQuantitySheet(rows);
    if (!items.length) continue;

    sheetsParsed++;
    totalRows += items.length;

    for (const item of items) {
      const key = norm(item.title);
      if (byTitle.has(key)) {
        duplicateCount++;
        continue;
      }
      byTitle.set(key, item);
    }
  }

  return { byTitle, duplicateCount, totalRows, sheetsParsed };
}

function printStats(opts: {
  scanned: number;
  output: OutputRow[];
  excludedCount: number;
  excludedByReason: Map<string, number>;
  matched: number;
  unmatched: number;
  matchedLegacyCodes: Set<string>;
  duplicateLegacyCodes: string[];
  duplicateTitleCount: number;
  duplicateQuantityTitleCount: number;
  orphanCount: number;
  quantitiesTotalRows: number;
  distinctQuantityTitles: number;
  sheetsParsed: number;
  mainTitles: Map<string, string>;
}): void {
  const {
    scanned,
    output,
    excludedCount,
    excludedByReason,
    matched,
    unmatched,
    matchedLegacyCodes,
    duplicateLegacyCodes,
    duplicateTitleCount,
    duplicateQuantityTitleCount,
    orphanCount,
    quantitiesTotalRows,
    distinctQuantityTitles,
    sheetsParsed,
    mainTitles,
  } = opts;

  const unitCounts = new Map<string, number>();
  for (const row of output) {
    const key = row.unit || '(blank)';
    unitCounts.set(key, (unitCounts.get(key) ?? 0) + 1);
  }

  type CatStats = {
    items: number;
    matched: number;
    totalQty: number;
    totalValue: number;
  };
  const bySub = new Map<string, CatStats>();
  for (const row of output) {
    const stats = bySub.get(row.subCategoryLegacyCode) ?? {
      items: 0,
      matched: 0,
      totalQty: 0,
      totalValue: 0,
    };
    stats.items++;
    if (matchedLegacyCodes.has(row.legacyCode)) stats.matched++;
    const qty = Number(row.quantity) || 0;
    const cost = row.unitCost === '' ? null : Number(row.unitCost);
    stats.totalQty += qty;
    if (cost != null) stats.totalValue += qty * cost;
    bySub.set(row.subCategoryLegacyCode, stats);
  }

  console.log('\n========== SPARE PARTS EXTRACTION STATS ==========');
  console.log(`codes.csv item rows scanned:     ${scanned}`);
  console.log(`included in clean-spare-parts.csv: ${output.length}`);
  console.log(
    `main category (fixed):           ${MAIN_CATEGORY_LEGACY_CODE} (${mainTitles.get(MAIN_CATEGORY_LEGACY_CODE) ?? ''})`,
  );
  console.log(`excluded:                        ${excludedCount}`);
  for (const [reason, count] of [...excludedByReason.entries()].sort()) {
    console.log(`  - ${reason}: ${count}`);
  }
  console.log(`duplicate legacy codes:          ${duplicateLegacyCodes.length}`);
  if (duplicateLegacyCodes.length) {
    console.log(`  samples: ${[...new Set(duplicateLegacyCodes)].slice(0, 10).join(', ')}`);
  }
  console.log(`duplicate titles skipped:        ${duplicateTitleCount}`);

  console.log('\n--- Quantities & costs ---');
  console.log(`sheets parsed:                   ${sheetsParsed}`);
  console.log(`quantity rows scanned:           ${quantitiesTotalRows}`);
  console.log(`distinct titles indexed:         ${distinctQuantityTitles}`);
  console.log(`duplicate quantity titles:       ${duplicateQuantityTitleCount}`);
  console.log(`orphan quantity titles:          ${orphanCount}`);
  const matchPct = output.length ? ((matched / output.length) * 100).toFixed(1) : '0.0';
  console.log(`matched by title:                ${matched} (${matchPct}%)`);
  console.log(`unmatched (qty=0, no cost):      ${unmatched}`);

  console.log('\n--- Unit distribution (output) ---');
  for (const [unit, count] of [...unitCounts.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${unit}: ${count}`);
  }

  console.log('\n--- Per sub category ---');
  const header = 'code'.padEnd(6) + 'items'.padStart(7) + 'matched'.padStart(9) + 'qty'.padStart(14) + 'value'.padStart(18);
  console.log(header);
  console.log('-'.repeat(header.length));

  let grandQty = 0;
  let grandValue = 0;
  for (const code of [...bySub.keys()].sort()) {
    const s = bySub.get(code)!;
    console.log(
      code.padEnd(6) +
        String(s.items).padStart(7) +
        String(s.matched).padStart(9) +
        s.totalQty.toLocaleString('en-US', { maximumFractionDigits: 2 }).padStart(14) +
        s.totalValue.toLocaleString('en-US', { maximumFractionDigits: 2 }).padStart(18),
    );
    grandQty += s.totalQty;
    grandValue += s.totalValue;
  }
  console.log('-'.repeat(header.length));
  console.log(
    'TOTAL'.padEnd(6) +
      String(output.length).padStart(7) +
      String(matched).padStart(9) +
      grandQty.toLocaleString('en-US', { maximumFractionDigits: 2 }).padStart(14) +
      grandValue.toLocaleString('en-US', { maximumFractionDigits: 2 }).padStart(18),
  );
  console.log('================================================\n');
}

function main(): void {
  const categories = JSON.parse(fs.readFileSync(CATEGORIES_PATH, 'utf-8')) as CategoryJson[];
  const { main, mainTitles } = loadSparePartsCategory(categories);

  const { valid, excludedCount, excludedByReason, duplicateLegacyCodes } = parseCodesCsv(main.subs);
  const {
    byTitle: quantitiesByTitle,
    duplicateCount,
    totalRows: quantitiesTotalRows,
    sheetsParsed,
  } = parseQuantitiesAndCosts();

  const matchedLegacyCodes = new Set<string>();
  const matchedQuantityTitles = new Set<string>();
  const seenTitles = new Set<string>();
  const output: OutputRow[] = [];
  let matched = 0;
  let unmatched = 0;
  let duplicateTitleCount = 0;

  for (const item of valid) {
    const titleKey = norm(item.title);
    if (!titleKey) continue;

    // Same title with different legacy codes → keep the first occurrence only
    if (seenTitles.has(titleKey)) {
      duplicateTitleCount++;
      continue;
    }
    seenTitles.add(titleKey);

    const qty = quantitiesByTitle.get(titleKey);
    let unit = normalizeUnit(item.unitRaw);
    if (!unit && qty) unit = normalizeUnit(qty.unit);

    if (qty) {
      matched++;
      matchedLegacyCodes.add(item.legacyCode);
      matchedQuantityTitles.add(titleKey);
      output.push({
        legacyCode: item.legacyCode,
        title: item.title,
        mainCategoryLegacyCode: item.mainCategoryLegacyCode,
        subCategoryLegacyCode: item.subCategoryLegacyCode,
        unit,
        unitCost: qty.unitCost == null ? '' : String(qty.unitCost),
        quantity: String(qty.quantity),
      });
    } else {
      unmatched++;
      output.push({
        legacyCode: item.legacyCode,
        title: item.title,
        mainCategoryLegacyCode: item.mainCategoryLegacyCode,
        subCategoryLegacyCode: item.subCategoryLegacyCode,
        unit,
        unitCost: '',
        quantity: '0',
      });
    }
  }

  let orphanCount = 0;
  for (const titleKey of quantitiesByTitle.keys()) {
    if (!matchedQuantityTitles.has(titleKey)) orphanCount++;
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });

  const outPath = path.join(OUT_DIR, 'clean-spare-parts.csv');
  writeCsv(
    outPath,
    ['legacyCode', 'title', 'mainCategoryLegacyCode', 'subCategoryLegacyCode', 'unit', 'unitCost', 'quantity'],
    output.map((r) => [
      r.legacyCode,
      r.title,
      r.mainCategoryLegacyCode,
      r.subCategoryLegacyCode,
      r.unit,
      r.unitCost,
      r.quantity,
    ]),
  );

  printStats({
    scanned: valid.length + excludedCount,
    output,
    excludedCount,
    excludedByReason,
    matched,
    unmatched,
    matchedLegacyCodes,
    duplicateLegacyCodes,
    duplicateTitleCount,
    duplicateQuantityTitleCount: duplicateCount,
    orphanCount,
    quantitiesTotalRows,
    distinctQuantityTitles: quantitiesByTitle.size,
    sheetsParsed,
    mainTitles,
  });

  console.log(`Wrote: ${outPath}`);
}

main();
