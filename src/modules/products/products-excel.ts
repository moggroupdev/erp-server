import ExcelJS from 'exceljs';
import { getLocale, type Locale } from 'src/utils/i18n/locale.context';
import { translate } from 'src/utils/i18n/translate';

const BASE_COLUMN_COUNT = 3;

const FONT = 'Calibri';
const CODE_FONT = 'Consolas';

const NAVY = 'FF052565';
const HAZE = 'FF2478B5';
const HAZE_WASH = 'FFE4F5FD';
const BORDER = 'FFD2D8E2';
const WHITE = 'FFFFFFFF';

const thinBorder: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: BORDER } },
  bottom: { style: 'thin', color: { argb: BORDER } },
  left: { style: 'thin', color: { argb: BORDER } },
  right: { style: 'thin', color: { argb: BORDER } },
};

type CatalogDimension = {
  length: number | null;
  depth: number | null;
  diameter: number | null;
  height: number;
  isDefault: boolean;
};

export type CatalogProductForExcel = {
  code: string;
  title: string;
  dimensions: CatalogDimension[];
  subCategory: {
    mainCategory: { id: string; title: string } | null;
  } | null;
};

type CategoryGroup = {
  title: string;
  products: CatalogProductForExcel[];
};

export type ProductsExcelColumns = {
  reviewEstimate?: boolean;
  addedToDatabase?: boolean;
  design?: boolean;
  completionDate?: boolean;
  notes?: boolean;
};

type OptionalColumn = {
  header: string;
  width: number;
  date?: boolean;
  notes?: boolean;
};

const OPTIONAL_COLUMNS: {
  key: keyof ProductsExcelColumns;
  width: number;
  date?: boolean;
  notes?: boolean;
  header: () => string;
}[] = [
  {
    key: 'reviewEstimate',
    width: 30,
    header: () => translate('Review estimate in Excel', 'مراجعة المقايسة في الأكسيل'),
  },
  {
    key: 'addedToDatabase',
    width: 28,
    header: () => translate('Added to the database', 'الإضافة في قاعدة البيانات'),
  },
  { key: 'design', width: 16, header: () => translate('Design', 'التصميم') },
  { key: 'completionDate', width: 18, date: true, header: () => translate('Completion date', 'تاريخ الانتهاء') },
  { key: 'notes', width: 32, notes: true, header: () => translate('Notes', 'ملاحظات') },
];

export async function buildProductsCatalogWorkbook(
  products: CatalogProductForExcel[],
  columns: ProductsExcelColumns = {},
): Promise<Buffer> {
  const locale = getLocale();
  const isRtl = locale === 'ar';
  const readingOrder: 'rtl' | 'ltr' = isRtl ? 'rtl' : 'ltr';
  const unit = translate('cm', 'سم');
  const optionalColumns = OPTIONAL_COLUMNS.filter((column) => columns[column.key]).map((column) => ({
    header: column.header(),
    width: column.width,
    date: column.date,
    notes: column.notes,
  }));
  const columnCount = BASE_COLUMN_COUNT + optionalColumns.length;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'ERP';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet(translate('Products Catalog', 'كتالوج المنتجات'), {
    views: [{ rightToLeft: isRtl, state: 'frozen', ySplit: 2, showGridLines: false }],
    properties: { defaultRowHeight: 22 },
    pageSetup: {
      paperSize: 9,
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      horizontalCentered: true,
      printTitlesRow: '1:2',
      margins: { left: 0.4, right: 0.4, top: 0.6, bottom: 0.5, header: 0.25, footer: 0.25 },
    },
  });

  sheet.properties.tabColor = { argb: NAVY };
  sheet.columns = [
    { width: 18 },
    { width: 52 },
    { width: 36 },
    ...optionalColumns.map((column) => ({ width: column.width })),
  ];

  writeTitleRow(sheet, locale, readingOrder, columnCount);
  writeHeaderRow(sheet, unit, readingOrder, optionalColumns);

  let rowIndex = 3;
  let dataRowIndex = 0;
  for (const group of groupByMainCategory(products, locale)) {
    writeCategoryRow(sheet, rowIndex, group.title, readingOrder, columnCount);
    rowIndex += 1;

    for (const product of group.products) {
      const dimensions = formatDimensionLines(product.dimensions, unit);
      for (const dimension of dimensions) {
        writeDimensionRow(sheet, rowIndex, product, dimension, {
          shaded: dataRowIndex % 2 === 1,
          readingOrder,
          isRtl,
          optionalColumns,
        });
        rowIndex += 1;
        dataRowIndex += 1;
      }
    }
  }

  const pageNumber = translate('&RPage &P of &N', '&Rصفحة &P من &N');
  sheet.headerFooter = { oddFooter: pageNumber, evenFooter: pageNumber };

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

function writeTitleRow(sheet: ExcelJS.Worksheet, locale: Locale, readingOrder: 'rtl' | 'ltr', columnCount: number) {
  const row = sheet.getRow(1);
  row.height = 36;
  sheet.mergeCells(1, 1, 1, columnCount);

  const title = translate('Products Catalog', 'كتالوج المنتجات');
  const date = new Date().toLocaleDateString(locale === 'ar' ? 'ar' : 'en', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  for (let column = 1; column <= columnCount; column++) {
    const cell = row.getCell(column);
    cell.fill = solidFill(HAZE_WASH);
    cell.border = thinBorder;
    cell.alignment = { horizontal: 'center', vertical: 'middle', readingOrder };
  }

  row.getCell(1).value = {
    richText: [
      { font: { name: FONT, bold: true, size: 18, color: { argb: NAVY } }, text: title },
      { font: { name: FONT, size: 12, color: { argb: HAZE } }, text: `  |  ${date}` },
    ],
  };
}

function writeHeaderRow(
  sheet: ExcelJS.Worksheet,
  unit: string,
  readingOrder: 'rtl' | 'ltr',
  optionalColumns: OptionalColumn[],
) {
  const headers = [
    translate('Code', 'الكود'),
    translate('Product Name', 'اسم المنتج'),
    `${translate('Standard Dimensions', 'الأبعاد النمطية')} (${unit})`,
    ...optionalColumns.map((column) => column.header),
  ];

  const row = sheet.getRow(2);
  row.height = optionalColumns.length > 0 ? 44 : 28;
  headers.forEach((header, index) => {
    const cell = row.getCell(index + 1);
    cell.value = header;
    cell.font = { name: FONT, bold: true, size: 12, color: { argb: WHITE } };
    cell.fill = solidFill(NAVY);
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true, readingOrder };
    cell.border = thinBorder;
  });
}

function writeCategoryRow(
  sheet: ExcelJS.Worksheet,
  rowIndex: number,
  title: string,
  readingOrder: 'rtl' | 'ltr',
  columnCount: number,
) {
  const row = sheet.getRow(rowIndex);
  row.height = 26;
  sheet.mergeCells(rowIndex, 1, rowIndex, columnCount);

  for (let column = 1; column <= columnCount; column++) {
    const cell = row.getCell(column);
    cell.font = { name: FONT, bold: true, size: 13, color: { argb: WHITE } };
    cell.fill = solidFill(HAZE);
    cell.alignment = { horizontal: 'center', vertical: 'middle', readingOrder };
    cell.border = thinBorder;
  }

  row.getCell(1).value = title;
}

function writeDimensionRow(
  sheet: ExcelJS.Worksheet,
  rowIndex: number,
  product: CatalogProductForExcel,
  dimension: string,
  options: { shaded: boolean; readingOrder: 'rtl' | 'ltr'; isRtl: boolean; optionalColumns: OptionalColumn[] },
) {
  const values = [product.code, product.title, dimension, ...options.optionalColumns.map(() => '')];
  const lineCount = estimateWrappedLines(product.title, 48);
  const row = sheet.getRow(rowIndex);
  row.height = Math.max(22, lineCount * 16 + 8);
  const startAlign = options.isRtl ? 'right' : 'left';

  values.forEach((value, index) => {
    const column = index + 1;
    const optionalColumn = options.optionalColumns[index - BASE_COLUMN_COUNT];
    const cell = row.getCell(column);
    cell.value = value;
    cell.font = {
      name: column === 1 ? CODE_FONT : FONT,
      size: 11,
      bold: column === 2,
      color: { argb: NAVY },
    };
    cell.fill = solidFill(options.shaded ? HAZE_WASH : WHITE);
    cell.border = thinBorder;
    cell.alignment = {
      horizontal: column === 1 || (optionalColumn && !optionalColumn.notes) ? 'center' : startAlign,
      vertical: 'middle',
      wrapText: column !== 1,
      readingOrder: options.readingOrder,
    };
    if (optionalColumn?.date) cell.numFmt = 'dd/mm/yyyy';
  });
}

function formatDimensionLines(dimensions: CatalogDimension[], unit: string): string[] {
  if (dimensions.length === 0) return ['-'];

  return [...dimensions]
    .sort((a, b) => {
      if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
      return a.height - b.height;
    })
    .map((dimension) => {
      const height = formatMeasure(dimension.height);
      const size =
        dimension.diameter != null
          ? `⌀${formatMeasure(dimension.diameter)} × ${height}`
          : `${formatMeasure(dimension.length)} × ${formatMeasure(dimension.depth)} × ${height}`;
      return `${size} ${unit}`;
    });
}

function groupByMainCategory(products: CatalogProductForExcel[], locale: Locale): CategoryGroup[] {
  const groups = new Map<string, CategoryGroup>();
  const uncategorized: CatalogProductForExcel[] = [];

  for (const product of products) {
    const mainCategory = product.subCategory?.mainCategory;
    if (!mainCategory) {
      uncategorized.push(product);
      continue;
    }

    const group = groups.get(mainCategory.id);
    if (group) group.products.push(product);
    else groups.set(mainCategory.id, { title: mainCategory.title, products: [product] });
  }

  const ordered = [...groups.values()].sort((a, b) => a.title.localeCompare(b.title, locale));
  for (const group of ordered) {
    group.products.sort((a, b) => a.title.localeCompare(b.title, locale));
  }

  if (uncategorized.length > 0) {
    uncategorized.sort((a, b) => a.title.localeCompare(b.title, locale));
    ordered.push({ title: translate('Uncategorized', 'غير مصنف'), products: uncategorized });
  }

  return ordered;
}

function formatMeasure(value: number | null): string {
  if (value == null || Number.isNaN(Number(value))) return '';
  return String(Math.round(Number(value) * 1000) / 1000);
}

function estimateWrappedLines(text: string, approximateCharacters: number): number {
  return Math.max(1, Math.ceil(text.length / approximateCharacters));
}

function solidFill(argb: string): ExcelJS.Fill {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb } };
}
