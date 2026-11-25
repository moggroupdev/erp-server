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

const COLUMN_COUNT = 8;

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

  let rowIndex = 4;
  let dataRowIndex = 0;
  let subtotal = 0;
  let mergeStart = rowIndex;
  let mergeRequisitionId = items[0]?.requisitionId ?? null;

  for (let i = 0; i < items.length; i++) {
    const item = items[i]!;
    if (item.requestedValue != null) subtotal += item.requestedValue;

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
        sheet.mergeCells(mergeStart, 7, rowIndex, 7);
        sheet.mergeCells(mergeStart, 8, rowIndex, 8);
      }
      mergeStart = rowIndex + 1;
      mergeRequisitionId = next?.requisitionId ?? null;
    }

    rowIndex += 1;
    dataRowIndex += 1;
  }

  const vatAmount = subtotal * VAT_RATE;
  const totalWithVat = subtotal + vatAmount;

  writeFooterRow(sheet, rowIndex, translate('Subtotal', 'الإجمالي'), subtotal, readingOrder, false);
  rowIndex += 1;
  writeFooterRow(
    sheet,
    rowIndex,
    translate(`VAT (${VAT_PERCENT}%)`, `ضريبة القيمة المضافة (${VAT_PERCENT}%)`),
    vatAmount,
    readingOrder,
    false,
  );
  rowIndex += 1;
  writeFooterRow(
    sheet,
    rowIndex,
    translate('Total incl. VAT', 'الإجمالي شامل الضريبة'),
    totalWithVat,
    readingOrder,
    true,
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

  const values: (string | number | null)[] = [
    item.materialTitle,
    getUnitLabel(item.unitOfMeasurementSelected, options.locale),
    item.quantityRequested,
    item.quantityReceived,
    item.lastPurchasePrice,
    item.requestedValue,
    item.requisitionCode,
    item.requisitionNotes?.trim() || null,
  ];

  values.forEach((value, index) => {
    const column = index + 1;
    const cell = row.getCell(column);
    const isEmpty = value == null || value === '';
    cell.value = isEmpty ? '-' : value;
    cell.font = {
      name: column === 7 ? CODE_FONT : FONT,
      size: 11,
      bold: column === 1,
      color: { argb: NAVY },
    };
    cell.fill = solidFill(options.shaded ? HAZE_WASH : WHITE);
    cell.border = thinBorder;
    cell.alignment = {
      horizontal: column === 1 || column === 8 ? startAlign : 'center',
      vertical: 'middle',
      wrapText: column === 1 || column === 8,
      readingOrder: options.readingOrder,
    };
    if (!isEmpty && (column === 3 || column === 4)) cell.numFmt = '#,##0.###';
    if (!isEmpty && (column === 5 || column === 6)) cell.numFmt = '#,##0.00';
  });
}

function writeFooterRow(
  sheet: ExcelJS.Worksheet,
  rowIndex: number,
  label: string,
  amount: number,
  readingOrder: 'rtl' | 'ltr',
  emphasize: boolean,
) {
  const row = sheet.getRow(rowIndex);
  row.height = 24;

  for (let column = 1; column <= COLUMN_COUNT; column++) {
    const cell = row.getCell(column);
    cell.fill = solidFill(emphasize ? HAZE_WASH : WHITE);
    cell.border = thinBorder;
    cell.alignment = { horizontal: 'center', vertical: 'middle', readingOrder };
    cell.font = { name: FONT, size: 11, bold: emphasize, color: { argb: NAVY } };
  }

  row.getCell(1).value = label;
  row.getCell(1).alignment = { horizontal: 'center', vertical: 'middle', readingOrder };
  row.getCell(6).value = amount;
  row.getCell(6).numFmt = '#,##0.00';
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
