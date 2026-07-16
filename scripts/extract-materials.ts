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

type ExcludedRow = CodeRow & { reason: string };

type QuantityRow = {
  title: string;
  quantity: number;
  unitCost: number | null;
  unit: string;
  sourceFile: string;
  sourceSheet: string;
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
const QUANTITIES_DIR = path.join(ROOT, 'data/materials/raw-materials/quantities-and-costs');
const CATEGORIES_PATH = path.join(ROOT, 'data/categories/materials.json');
const OUT_DIR = path.join(ROOT, 'data/materials/raw-materials/results');
const ISSUES_DIR = path.join(OUT_DIR, 'issues');

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
  excluded: ExcludedRow[];
  duplicateLegacyCodes: string[];
} {
  const wb = xlsx.readFile(CODES_PATH);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json<(string | number | null)[]>(ws, {
    header: 1,
    defval: null,
  });

  const valid: CodeRow[] = [];
  const excluded: ExcludedRow[] = [];
  const seenCodes = new Map<string, number>();
  const duplicateLegacyCodes: string[] = [];

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

    const base: CodeRow = {
      legacyCode,
      title,
      unitRaw,
      mainCategoryLegacyCode,
      subCategoryLegacyCode,
    };

    const main = categoryIndex.get(mainCategoryLegacyCode);
    if (!main) {
      excluded.push({
        ...base,
        reason: `invalid_main_category:${mainCategoryLegacyCode}`,
      });
      continue;
    }
    if (!main.subs.has(subCategoryLegacyCode)) {
      excluded.push({
        ...base,
        reason: `invalid_sub_category:${mainCategoryLegacyCode}/${subCategoryLegacyCode}`,
      });
      continue;
    }

    valid.push(base);
  }

  return { valid, excluded, duplicateLegacyCodes };
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

function parseQuantitySheet(fileName: string, sheetName: string, rows: (string | number | null)[][]): QuantityRow[] {
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

    items.push({
      title,
      quantity,
      unitCost,
      unit,
      sourceFile: fileName,
      sourceSheet: sheetName,
    });
  }

  return items;
}

type DuplicateQuantityRow = QuantityRow & {
  keptSourceFile: string;
  keptSourceSheet: string;
  keptQuantity: number;
  keptUnitCost: number | null;
  keptUnit: string;
};

function parseQuantitiesAndCosts(): {
  byTitle: Map<string, QuantityRow>;
  duplicates: DuplicateQuantityRow[];
  totalRows: number;
  sheetsParsed: number;
} {
  const byTitle = new Map<string, QuantityRow>();
  const duplicates: DuplicateQuantityRow[] = [];
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

      const items = parseQuantitySheet(fileName, sheetName, rows);
      if (!items.length) continue;

      sheetsParsed++;
      totalRows += items.length;

      for (const item of items) {
        const key = norm(item.title);
        const kept = byTitle.get(key);
        if (kept) {
          duplicates.push({
            ...item,
            keptSourceFile: kept.sourceFile,
            keptSourceSheet: kept.sourceSheet,
            keptQuantity: kept.quantity,
            keptUnitCost: kept.unitCost,
            keptUnit: kept.unit,
          });
          continue;
        }
        byTitle.set(key, item);
      }
    }
  }

  return { byTitle, duplicates, totalRows, sheetsParsed };
}

function printStats(opts: {
  scanned: number;
  output: OutputRow[];
  excluded: ExcludedRow[];
  matched: number;
  unmatched: number;
  matchedLegacyCodes: Set<string>;
  duplicateLegacyCodes: string[];
  duplicateCount: number;
  orphanCount: number;
  quantitiesTotalRows: number;
  distinctQuantityTitles: number;
  sheetsParsed: number;
  mainTitles: Map<string, string>;
}): void {
  const {
    scanned,
    output,
    excluded,
    matched,
    unmatched,
    matchedLegacyCodes,
    duplicateLegacyCodes,
    duplicateCount,
    orphanCount,
    quantitiesTotalRows,
    distinctQuantityTitles,
    sheetsParsed,
    mainTitles,
  } = opts;

  const reasonCounts = new Map<string, number>();
  for (const row of excluded) {
    reasonCounts.set(row.reason, (reasonCounts.get(row.reason) ?? 0) + 1);
  }

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
  console.log(`excluded:                        ${excluded.length}`);
  for (const [reason, count] of [...reasonCounts.entries()].sort()) {
    console.log(`  - ${reason}: ${count}`);
  }
  console.log(`duplicate legacy codes:          ${duplicateLegacyCodes.length}`);
  if (duplicateLegacyCodes.length) {
    console.log(`  samples: ${[...new Set(duplicateLegacyCodes)].slice(0, 10).join(', ')}`);
  }

  console.log('\n--- Quantities & costs ---');
  console.log(`sheets parsed:                   ${sheetsParsed}`);
  console.log(`quantity rows scanned:           ${quantitiesTotalRows}`);
  console.log(`distinct titles indexed:         ${distinctQuantityTitles}`);
  console.log(`duplicate titles skipped:        ${duplicateCount}`);
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

  const { valid, excluded, duplicateLegacyCodes } = parseCodesXls(categoryIndex);
  const { byTitle: quantitiesByTitle, duplicates, totalRows: quantitiesTotalRows, sheetsParsed } = parseQuantitiesAndCosts();

  const matchedLegacyCodes = new Set<string>();
  const matchedQuantityTitles = new Set<string>();
  const output: OutputRow[] = [];
  let matched = 0;
  let unmatched = 0;

  for (const item of valid) {
    const titleKey = norm(item.title);
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

  const orphans: QuantityRow[] = [];
  for (const [titleKey, qty] of quantitiesByTitle) {
    if (!matchedQuantityTitles.has(titleKey)) orphans.push(qty);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.mkdirSync(ISSUES_DIR, { recursive: true });

  writeCsv(
    path.join(OUT_DIR, 'clean-materials.csv'),
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

  writeCsv(
    path.join(ISSUES_DIR, 'codes-excluded-invalid-categories.csv'),
    ['legacyCode', 'title', 'unit', 'mainCategoryLegacyCodeRaw', 'subCategoryLegacyCodeRaw', 'reason'],
    excluded.map((r) => [
      r.legacyCode,
      r.title,
      normalizeUnit(r.unitRaw),
      r.mainCategoryLegacyCode,
      r.subCategoryLegacyCode,
      r.reason,
    ]),
  );

  writeCsv(
    path.join(ISSUES_DIR, 'quantities-duplicate-titles-skipped.csv'),
    [
      'title',
      'skippedQuantity',
      'skippedUnitCost',
      'skippedUnit',
      'skippedSourceFile',
      'skippedSourceSheet',
      'keptQuantity',
      'keptUnitCost',
      'keptUnit',
      'keptSourceFile',
      'keptSourceSheet',
    ],
    duplicates.map((r) => [
      r.title,
      String(r.quantity),
      r.unitCost == null ? '' : String(r.unitCost),
      normalizeUnit(r.unit) || r.unit,
      r.sourceFile,
      r.sourceSheet,
      String(r.keptQuantity),
      r.keptUnitCost == null ? '' : String(r.keptUnitCost),
      normalizeUnit(r.keptUnit) || r.keptUnit,
      r.keptSourceFile,
      r.keptSourceSheet,
    ]),
  );

  writeCsv(
    path.join(ISSUES_DIR, 'quantities-orphan-titles-unmatched.csv'),
    ['title', 'quantity', 'unitCost', 'unit', 'sourceFile', 'sourceSheet'],
    orphans.map((r) => [
      r.title,
      String(r.quantity),
      r.unitCost == null ? '' : String(r.unitCost),
      normalizeUnit(r.unit) || r.unit,
      r.sourceFile,
      r.sourceSheet,
    ]),
  );

  printStats({
    scanned: valid.length + excluded.length,
    output,
    excluded,
    matched,
    unmatched,
    matchedLegacyCodes,
    duplicateLegacyCodes,
    duplicateCount: duplicates.length,
    orphanCount: orphans.length,
    quantitiesTotalRows,
    distinctQuantityTitles: quantitiesByTitle.size,
    sheetsParsed,
    mainTitles,
  });

  console.log(`Wrote: ${path.join(OUT_DIR, 'clean-materials.csv')}`);
  console.log(`Wrote: ${path.join(ISSUES_DIR, 'codes-excluded-invalid-categories.csv')}`);
  console.log(`Wrote: ${path.join(ISSUES_DIR, 'quantities-duplicate-titles-skipped.csv')}`);
  console.log(`Wrote: ${path.join(ISSUES_DIR, 'quantities-orphan-titles-unmatched.csv')}`);
}

main();
