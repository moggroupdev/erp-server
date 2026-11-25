import ExcelJS from 'exceljs';
import { VAT_PERCENT, VAT_RATE } from 'src/utils/constants';
import { getLocale, type Locale } from 'src/utils/i18n/locale.context';
import { translate } from 'src/utils/i18n/translate';
import type { MaterialUnit, ProductionSubDepartment } from 'src/utils/types';

const FONT = 'Calibri';
const CODE_FONT = 'Consolas';

const NAVY = 'FF052565';
const HAZE = 'FF2478B5';
const HAZE_WASH = 'FFE4F5FD';
const BORDER = 'FFD2D8E2';
const WHITE = 'FFFFFFFF';

const COLUMN_COUNT = 9;
const COL = {
  materialCode: 1,
  material: 2,
  unit: 3,
  requestedQty: 4,
  receivedQty: 5,
  lastPrice: 6,
  totalValue: 7,
  requisitionNo: 8,
  notes: 9,
} as const;

const thinBorder: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: BORDER } },
  bottom: { style: 'thin', color: { argb: BORDER } },
  left: { style: 'thin', color: { argb: BORDER } },
  right: { style: 'thin', color: { argb: BORDER } },
};

/** Bilingual department labels (mirrored from erp-app). */
const PRODUCTION_SUB_DEPARTMENT_LABELS: Record<ProductionSubDepartment, { en: string; ar: string }> = {
  cutting: { en: 'Cutting Dep.', ar: 'قسم القص' },
  punch: { en: 'Punch Dep.', ar: 'قسم البنش' },
  bending: { en: 'Bending Dep.', ar: 'قسم الثني' },
  refrigeration: { en: 'Refrigeration Dep.', ar: 'قسم التبريد' },
  electricity: { en: 'Electricity Dep.', ar: 'قسم الكهرباء' },
  gas: { en: 'Gas Dep.', ar: 'قسم الغاز' },
  injection: { en: 'Injection Dep.', ar: 'قسم الحقن' },
  sheet_metal_neutral: { en: 'Neutral Assembly Dep.', ar: 'خط تجميع المتعادل' },
  sheet_metal_cold: { en: 'Cold Assembly Dep.', ar: 'خط تجميع البارد' },
  sheet_metal_hot: { en: 'Hot Assembly Dep.', ar: 'خط تجميع الساخن' },
  kitchens: { en: 'Home Kitchens Dep.', ar: 'خط المطابخ المنزلية' },
  paints: { en: 'Paints Dep.', ar: 'قسم الدهانات' },
  blacksmithing: { en: 'Blacksmithing Dep.', ar: 'قسم الحدادة' },
  turning: { en: 'Turning Dep.', ar: 'قسم الخراطة' },
  finishing: { en: 'Finishing Dep.', ar: 'قسم التشطيب' },
  external_installations: { en: 'External Installations Dep.', ar: 'قسم التركيبات الخارجية' },
};

/** Lower rank first; same rank keeps key order (mirrored from erp-app). */
const PRODUCTION_SUB_DEPARTMENT_SORT_RANKS: Record<ProductionSubDepartment, number> = {
  cutting: 1,
  punch: 1,
  bending: 1,
  turning: 1,
  sheet_metal_neutral: 2,
  sheet_metal_cold: 2,
  sheet_metal_hot: 2,
  kitchens: 2,
  electricity: 3,
  gas: 3,
  injection: 4,
  refrigeration: 5,
  paints: 6,
  blacksmithing: 6,
  finishing: 7,
  external_installations: 7,
};

const PRODUCTION_SUB_DEPARTMENT_SORT_INDEX: Record<ProductionSubDepartment, number> = Object.fromEntries(
  (Object.keys(PRODUCTION_SUB_DEPARTMENT_SORT_RANKS) as ProductionSubDepartment[]).map((department, index) => [
    department,
    index,
  ]),
) as Record<ProductionSubDepartment, number>;

/** Bilingual unit labels (mirrored from erp-app). */
const MATERIAL_UNIT_LABELS: Record<MaterialUnit, { en: string; ar: string }> = {
  count: { en: 'Count', ar: 'عدد' },
  gram: { en: 'Gram', ar: 'جرام' },
  kg: { en: 'Kilogram', ar: 'كيلوجرام' },
  ton: { en: 'Ton', ar: 'طن' },
  cm: { en: 'Centimeter', ar: 'سنتيمتر' },
  meter: { en: 'Meter', ar: 'متر' },
  square_meter: { en: 'Meter²', ar: 'متر²' },
  cubic_meter: { en: 'Meter³', ar: 'متر³' },
  liter: { en: 'Liter', ar: 'لتر' },
  packet: { en: 'Packet', ar: 'باكيت' },
  box: { en: 'Box', ar: 'علبة' },
  roll: { en: 'Roll', ar: 'لفة' },
};

export type RequisitionFollowUpExcelLine = {
  requisitionId: string;
  requisitionCode: string;
  productionSubDepartment: ProductionSubDepartment;
  requisitionNotes: string | null;
  materialCode: string;
  materialTitle: string;
  unitOfMeasurementSelected: MaterialUnit;
  quantityRequested: number;
  quantityReceived: number;
  lastPurchasePrice: number | null;
  requestedValue: number | null;
};

export async function buildRequisitionFollowUpWorkbook(
  lines: RequisitionFollowUpExcelLine[],
  options: { from: string; to: string },
): Promise<Buffer> {
  const locale = getLocale();
  const isRtl = locale === 'ar';
  const readingOrder: 'rtl' | 'ltr' = isRtl ? 'rtl' : 'ltr';
  const currency = locale === 'ar' ? 'ج.م' : 'EGP';

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'ERP';
  workbook.created = new Date();

  const byDepartment = groupByDepartment(lines);
  for (const { department, items } of byDepartment) {
    writeDepartmentSheet(workbook, {
      department,
      items,
      from: options.from,
      to: options.to,
      locale,
      isRtl,
      readingOrder,
      currency,
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

function groupByDepartment(lines: RequisitionFollowUpExcelLine[]) {
  const groups = new Map<ProductionSubDepartment, RequisitionFollowUpExcelLine[]>();
  for (const line of lines) {
    const list = groups.get(line.productionSubDepartment) ?? [];
    list.push(line);
    groups.set(line.productionSubDepartment, list);
  }

  return [...groups.entries()]
    .sort(([a], [b]) => compareDepartments(a, b))
    .map(([department, items]) => ({ department, items }));
}

function compareDepartments(a: ProductionSubDepartment, b: ProductionSubDepartment) {
  const rankA = PRODUCTION_SUB_DEPARTMENT_SORT_RANKS[a] ?? Number.POSITIVE_INFINITY;
  const rankB = PRODUCTION_SUB_DEPARTMENT_SORT_RANKS[b] ?? Number.POSITIVE_INFINITY;
  if (rankA !== rankB) return rankA - rankB;
  return (
    (PRODUCTION_SUB_DEPARTMENT_SORT_INDEX[a] ?? Number.POSITIVE_INFINITY) -
    (PRODUCTION_SUB_DEPARTMENT_SORT_INDEX[b] ?? Number.POSITIVE_INFINITY)
  );
}

function writeDepartmentSheet(
  workbook: ExcelJS.Workbook,
  options: {
    department: ProductionSubDepartment;
    items: RequisitionFollowUpExcelLine[];
    from: string;
    to: string;
    locale: Locale;
    isRtl: boolean;
    readingOrder: 'rtl' | 'ltr';
    currency: string;
  },
) {
  const { department, items, from, to, locale, isRtl, readingOrder, currency } = options;
  const departmentLabel = getDepartmentLabel(department, locale);
  const sheetName = sanitizeSheetName(departmentLabel);

  const sheet = workbook.addWorksheet(sheetName, {
    views: [{ rightToLeft: isRtl, state: 'frozen', ySplit: 3, showGridLines: false }],
    properties: { defaultRowHeight: 22 },
    pageSetup: {
      paperSize: 9,
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      horizontalCentered: true,
      printTitlesRow: '1:3',
      margins: { left: 0.4, right: 0.4, top: 0.6, bottom: 0.5, header: 0.25, footer: 0.25 },
    },
  });

  sheet.properties.tabColor = { argb: NAVY };
  sheet.columns = [
    { width: 16 },
    { width: 36 },
    { width: 14 },
    { width: 14 },
    { width: 14 },
    { width: 16 },
    { width: 16 },
    { width: 16 },
    { width: 28 },
  ];

  writeTitleRow(sheet, readingOrder);
  writeMetaRow(sheet, departmentLabel, from, to, locale, readingOrder);
  writeHeaderRow(sheet, currency, readingOrder);

  const firstDataRow = 4;
  let rowIndex = firstDataRow;
  let dataRowIndex = 0;
  let mergeStart = rowIndex;
  let mergeRequisitionId = items[0]?.requisitionId ?? null;

  for (let i = 0; i < items.length; i++) {
    const item = items[i]!;

    writeDataRow(sheet, rowIndex, item, {
      shaded: dataRowIndex % 2 === 1,
      readingOrder,
      isRtl,
      locale,
    });

    const next = items[i + 1];
    const nextDifferent = !next || next.requisitionId !== mergeRequisitionId;
    if (nextDifferent && mergeRequisitionId) {
      if (rowIndex > mergeStart) {
        sheet.mergeCells(mergeStart, COL.requisitionNo, rowIndex, COL.requisitionNo);
        sheet.mergeCells(mergeStart, COL.notes, rowIndex, COL.notes);
      }
      mergeStart = rowIndex + 1;
      mergeRequisitionId = next?.requisitionId ?? null;
    }

    rowIndex += 1;
    dataRowIndex += 1;
  }

  const lastDataRow = rowIndex - 1;
  const subtotalRow = rowIndex;
  writeFooterRow(sheet, subtotalRow, translate('Subtotal', 'الإجمالي'), readingOrder, false, {
    formula: `SUM(${colLetter(COL.totalValue)}${firstDataRow}:${colLetter(COL.totalValue)}${lastDataRow})`,
  });
  rowIndex += 1;

  const vatRow = rowIndex;
  writeFooterRow(
    sheet,
    vatRow,
    translate(`VAT (${VAT_PERCENT}%)`, `ضريبة القيمة المضافة (${VAT_PERCENT}%)`),
    readingOrder,
    false,
    { formula: `${colLetter(COL.totalValue)}${subtotalRow}*${VAT_RATE}` },
  );
  rowIndex += 1;

  writeFooterRow(
    sheet,
    rowIndex,
    translate('Total incl. VAT', 'الإجمالي شامل الضريبة'),
    readingOrder,
    true,
    { formula: `${colLetter(COL.totalValue)}${subtotalRow}+${colLetter(COL.totalValue)}${vatRow}` },
  );

  const pageNumber = translate('&RPage &P of &N', '&Rصفحة &P من &N');
  sheet.headerFooter = { oddFooter: pageNumber, evenFooter: pageNumber };
}

function writeTitleRow(sheet: ExcelJS.Worksheet, readingOrder: 'rtl' | 'ltr') {
  const row = sheet.getRow(1);
  row.height = 36;
  sheet.mergeCells(1, 1, 1, COLUMN_COUNT);

  const title = translate('Purchase Requisition Follow-up', 'متابعة طلبات الشراء');

  for (let column = 1; column <= COLUMN_COUNT; column++) {
    const cell = row.getCell(column);
    cell.fill = solidFill(HAZE_WASH);
    cell.border = thinBorder;
    cell.alignment = { horizontal: 'center', vertical: 'middle', readingOrder };
  }

  row.getCell(1).value = title;
  row.getCell(1).font = { name: FONT, bold: true, size: 18, color: { argb: NAVY } };
}

function writeMetaRow(
  sheet: ExcelJS.Worksheet,
  departmentLabel: string,
  from: string,
  to: string,
  locale: Locale,
  readingOrder: 'rtl' | 'ltr',
) {
  const row = sheet.getRow(2);
  row.height = 24;
  sheet.mergeCells(2, 1, 2, COLUMN_COUNT);

  const fromLabel = formatDate(from, locale);
  const toLabel = formatDate(to, locale);
  const rangeText = translate(`from ${fromLabel} to ${toLabel}`, `من ${fromLabel} إلى ${toLabel}`);
  const meta = `${departmentLabel}  |  ${rangeText}`;

  for (let column = 1; column <= COLUMN_COUNT; column++) {
    const cell = row.getCell(column);
    cell.fill = solidFill(HAZE_WASH);
    cell.border = thinBorder;
    cell.alignment = { horizontal: 'center', vertical: 'middle', readingOrder };
  }

  row.getCell(1).value = meta;
  row.getCell(1).font = { name: FONT, size: 12, color: { argb: HAZE } };
}

function writeHeaderRow(sheet: ExcelJS.Worksheet, currency: string, readingOrder: 'rtl' | 'ltr') {
  const headers = [
    translate('Material code', 'كود الصنف'),
    translate('Material', 'الصنف'),
    translate('Unit', 'الوحدة'),
    translate('Requested Qty', 'الكمية المطلوبة'),
    translate('Received Qty', 'الكمية المستلمة'),
    translate(`Last price (${currency})`, `اخر سعر (${currency})`),
    translate(`Total value (${currency})`, `إجمالي القيمة (${currency})`),
    translate('Requisition no.', 'رقم الطلب'),
    translate('Notes', 'ملاحظات'),
  ];

  const row = sheet.getRow(3);
  row.height = 32;
  headers.forEach((header, index) => {
    const cell = row.getCell(index + 1);
    cell.value = header;
    cell.font = { name: FONT, bold: true, size: 11, color: { argb: WHITE } };
    cell.fill = solidFill(NAVY);
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true, readingOrder };
    cell.border = thinBorder;
  });
}

function writeDataRow(
  sheet: ExcelJS.Worksheet,
  rowIndex: number,
  item: RequisitionFollowUpExcelLine,
  options: { shaded: boolean; readingOrder: 'rtl' | 'ltr'; isRtl: boolean; locale: Locale },
) {
  const row = sheet.getRow(rowIndex);
  row.height = Math.max(22, estimateWrappedLines(item.materialTitle, 34) * 16 + 8);
  const startAlign = options.isRtl ? 'right' : 'left';
  const fill = solidFill(options.shaded ? HAZE_WASH : WHITE);

  const materialCell = row.getCell(COL.material);
  materialCell.value = item.materialTitle;
  materialCell.font = { name: FONT, size: 11, bold: true, color: { argb: NAVY } };
  materialCell.fill = fill;
  materialCell.border = thinBorder;
  materialCell.alignment = {
    horizontal: startAlign,
    vertical: 'middle',
    wrapText: true,
    readingOrder: options.readingOrder,
  };

  const codeCell = row.getCell(COL.materialCode);
  codeCell.value = item.materialCode;
  codeCell.font = { name: CODE_FONT, size: 11, color: { argb: NAVY } };
  codeCell.fill = fill;
  codeCell.border = thinBorder;
  codeCell.alignment = { horizontal: 'center', vertical: 'middle', readingOrder: options.readingOrder };

  const unitCell = row.getCell(COL.unit);
  unitCell.value = getUnitLabel(item.unitOfMeasurementSelected, options.locale);
  unitCell.font = { name: FONT, size: 11, color: { argb: NAVY } };
  unitCell.fill = fill;
  unitCell.border = thinBorder;
  unitCell.alignment = { horizontal: 'center', vertical: 'middle', readingOrder: options.readingOrder };

  writeQtyCell(row.getCell(COL.requestedQty), item.quantityRequested, fill, options.readingOrder);
  writeQtyCell(row.getCell(COL.receivedQty), item.quantityReceived, fill, options.readingOrder);

  const priceCell = row.getCell(COL.lastPrice);
  priceCell.fill = fill;
  priceCell.border = thinBorder;
  priceCell.alignment = { horizontal: 'center', vertical: 'middle', readingOrder: options.readingOrder };
  if (item.lastPurchasePrice == null) {
    priceCell.value = '-';
    priceCell.font = { name: FONT, size: 11, color: { argb: NAVY } };
  } else {
    priceCell.value = item.lastPurchasePrice;
    priceCell.numFmt = '0.00';
    priceCell.font = { name: FONT, size: 11, color: { argb: NAVY } };
  }

  const totalCell = row.getCell(COL.totalValue);
  totalCell.fill = fill;
  totalCell.border = thinBorder;
  totalCell.alignment = { horizontal: 'center', vertical: 'middle', readingOrder: options.readingOrder };
  totalCell.font = { name: FONT, size: 11, bold: true, color: { argb: NAVY } };
  if (item.lastPurchasePrice == null) {
    totalCell.value = '-';
  } else {
    // Requested qty × last price
    totalCell.value = {
      formula: `${colLetter(COL.requestedQty)}${rowIndex}*${colLetter(COL.lastPrice)}${rowIndex}`,
    };
    totalCell.numFmt = '0.00';
  }

  const reqNoCell = row.getCell(COL.requisitionNo);
  reqNoCell.value = item.requisitionCode;
  reqNoCell.font = { name: CODE_FONT, size: 11, color: { argb: NAVY } };
  reqNoCell.fill = fill;
  reqNoCell.border = thinBorder;
  reqNoCell.alignment = { horizontal: 'center', vertical: 'middle', readingOrder: options.readingOrder };

  const notesCell = row.getCell(COL.notes);
  notesCell.value = item.requisitionNotes?.trim() || '-';
  notesCell.font = { name: FONT, size: 11, color: { argb: NAVY } };
  notesCell.fill = fill;
  notesCell.border = thinBorder;
  notesCell.alignment = {
    horizontal: startAlign,
    vertical: 'middle',
    wrapText: true,
    readingOrder: options.readingOrder,
  };
}

/** Write qty without a decimal format that Arabic Excel can render as a leading ".". */
function writeQtyCell(
  cell: ExcelJS.Cell,
  value: number,
  fill: ExcelJS.Fill,
  readingOrder: 'rtl' | 'ltr',
) {
  const qty = Number.isFinite(value) ? value : 0;
  cell.value = Number.isInteger(qty) ? qty : Math.round(qty * 1000) / 1000;
  cell.font = { name: FONT, size: 11, color: { argb: NAVY } };
  cell.fill = fill;
  cell.border = thinBorder;
  cell.alignment = { horizontal: 'center', vertical: 'middle', readingOrder };
}

function writeFooterRow(
  sheet: ExcelJS.Worksheet,
  rowIndex: number,
  label: string,
  readingOrder: 'rtl' | 'ltr',
  emphasize: boolean,
  amount: { formula: string },
) {
  const row = sheet.getRow(rowIndex);
  row.height = 24;

  for (let column = 1; column <= COLUMN_COUNT; column++) {
    const cell = row.getCell(column);
    cell.fill = solidFill(emphasize ? HAZE_WASH : WHITE);
    cell.border = thinBorder;
    cell.alignment = { horizontal: 'center', vertical: 'middle', readingOrder };
    cell.font = { name: FONT, size: 11, bold: emphasize || column === COL.totalValue, color: { argb: NAVY } };
  }

  row.getCell(COL.material).value = label;
  row.getCell(COL.material).alignment = { horizontal: 'center', vertical: 'middle', readingOrder };
  row.getCell(COL.totalValue).value = { formula: amount.formula };
  row.getCell(COL.totalValue).numFmt = '0.00';
}

function colLetter(column: number) {
  let n = column;
  let letter = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    letter = String.fromCharCode(65 + rem) + letter;
    n = Math.floor((n - 1) / 26);
  }
  return letter;
}

function getDepartmentLabel(department: ProductionSubDepartment, locale: Locale) {
  const labels = PRODUCTION_SUB_DEPARTMENT_LABELS[department];
  if (!labels) return department;
  return locale === 'ar' ? labels.ar : labels.en;
}

function getUnitLabel(unit: MaterialUnit, locale: Locale) {
  const labels = MATERIAL_UNIT_LABELS[unit];
  if (!labels) return unit;
  return locale === 'ar' ? labels.ar : labels.en;
}

function formatDate(value: string, locale: Locale) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(locale === 'ar' ? 'ar' : 'en', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function sanitizeSheetName(name: string) {
  const cleaned = name.replace(/[\\/*?:[\]]/g, ' ').trim();
  return cleaned.slice(0, 31) || 'Sheet';
}

function estimateWrappedLines(text: string, approximateCharacters: number): number {
  return Math.max(1, Math.ceil(text.length / approximateCharacters));
}

function solidFill(argb: string): ExcelJS.Fill {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb } };
}
