import * as fs from 'fs';
import * as path from 'path';
import * as xlsx from 'xlsx';

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

const UNIT_MAP: Record<string, string> = {
  عدد: 'count',
  متر: 'meter',
  كجم: 'kg',
};

const ROOT = path.join(__dirname, '..');
const CODES_PATH = path.join(ROOT, 'data/materials/raw-materials/codes.xls');
const QUANTITIES_DIR = path.join(ROOT, 'data/materials/raw-materials/stock');
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

function parseCodesXls(categoryIndex: Map<string, { title: string; subs: Set<string> }>): {
  valid: CodeRow[];
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

  const valid: CodeRow[] = [];
  const excludedByReason = new Map<string, number>();
  const seenCodes = new Map<string, number>();
  const duplicateLegacyCodes: string[] = [];
  let excludedCount = 0;

  for (let i = 4; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;
    const legacyCode = norm(row[1]);
    if (!/^\d{8}$/.test(legacyCode)) continue;

    const title = norm(row[2]);
    const unitRaw = norm(row[4]);
    const mainCategoryLegacyCode = legacyCode.slice(1, 3);
    const subCategoryLegacyCode = legacyCode.slice(3, 5);

    if (seenCodes.has(legacyCode)) {
      duplicateLegacyCodes.push(legacyCode);
    } else {
      seenCodes.set(legacyCode, i);
    }

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

    valid.push({
      legacyCode,
      title,
      unitRaw,
      mainCategoryLegacyCode,
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

  let qtyCol = -1;
  for (let j = balanceCol; j < Math.max(subHeader.length, header.length); j++) {
    if (norm(subHeader[j]) === 'فعلى') {
      qtyCol = j;
      break;
    }
  }
  if (qtyCol === -1) qtyCol = balanceCol;

  // Prefer price column after the title/balance block (some sheets repeat "سعر الصرف" earlier).
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

  const files = fs.readdirSync(QUANTITIES_DIR).filter((f) => f.toLowerCase().endsWith('.xls'));

  for (const fileName of files) {
    const wb = xlsx.readFile(path.join(QUANTITIES_DIR, fileName));
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
  const byMain = new Map<string, CatStats>();
  for (const row of output) {
    const stats = byMain.get(row.mainCategoryLegacyCode) ?? {
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
    byMain.set(row.mainCategoryLegacyCode, stats);
  }

  console.log('\n========== MATERIALS EXTRACTION STATS ==========');
  console.log(`codes.xls item rows scanned:     ${scanned}`);
  console.log(`included in clean-materials.csv: ${output.length}`);
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

  console.log('\n--- Per main category ---');
  const header =
    'code'.padEnd(6) +
    'title'.padEnd(30) +
    'items'.padStart(7) +
    'matched'.padStart(9) +
    'qty'.padStart(14) +
    'value'.padStart(18);
  console.log(header);
  console.log('-'.repeat(header.length));

  let grandQty = 0;
  let grandValue = 0;
  for (const code of [...byMain.keys()].sort()) {
    const s = byMain.get(code)!;
    const title = (mainTitles.get(code) ?? code).slice(0, 28);
    console.log(
      code.padEnd(6) +
        title.padEnd(30) +
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
    ''.padEnd(6) +
      'TOTAL'.padEnd(30) +
      String(output.length).padStart(7) +
      String(matched).padStart(9) +
      grandQty.toLocaleString('en-US', { maximumFractionDigits: 2 }).padStart(14) +
      grandValue.toLocaleString('en-US', { maximumFractionDigits: 2 }).padStart(18),
  );
  console.log('================================================\n');
}

function main(): void {
  const categories = JSON.parse(fs.readFileSync(CATEGORIES_PATH, 'utf-8')) as CategoryJson[];
  const { mains: categoryIndex, mainTitles } = loadCategoryIndex(categories);

  const { valid, excludedCount, excludedByReason, duplicateLegacyCodes } = parseCodesXls(categoryIndex);
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

  const outPath = path.join(OUT_DIR, 'clean-materials.csv');
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
