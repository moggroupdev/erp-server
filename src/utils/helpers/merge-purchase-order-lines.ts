import type { MaterialUnit } from 'src/utils/types';

export type MergePurchaseOrderLineInput = {
  materialCode: string;
  unitOfMeasurementSelected: MaterialUnit;
  quantity: number;
  unitPrice: number;
  /** Material base unit (used when rows of the same material use different selected units). */
  baseUnit: MaterialUnit;
  /** Factor that converts the selected unit into the base unit (1 when selected === base). */
  conversionFactorToBase: number;
};

export type MergedPurchaseOrderLine = {
  materialCode: string;
  unitOfMeasurementSelected: MaterialUnit;
  quantityOrdered: number;
  unitPrice: number;
};

export type MergePurchaseOrderLinesResult = {
  items: MergedPurchaseOrderLine[];
  totalAmount: number;
};

/**
 * Merge receipt / invoice line rows into one MPO line per material.
 * Same selected unit across rows → sum quantities and cost-weighted average price in that unit.
 * Mixed units → convert to the material base unit, then sum / average in base.
 */
export function mergePurchaseOrderLines(rows: MergePurchaseOrderLineInput[]): MergePurchaseOrderLinesResult {
  const groups = new Map<string, MergePurchaseOrderLineInput[]>();
  for (const row of rows) {
    const existing = groups.get(row.materialCode);
    if (existing) existing.push(row);
    else groups.set(row.materialCode, [row]);
  }

  let totalAmount = 0;
  const items: MergedPurchaseOrderLine[] = [];

  for (const [materialCode, itemRows] of groups) {
    const allSameUnit = itemRows.every((row) => row.unitOfMeasurementSelected === itemRows[0].unitOfMeasurementSelected);

    let unitOfMeasurementSelected: MaterialUnit;
    let quantityOrdered: number;
    let unitPrice: number;

    if (allSameUnit) {
      unitOfMeasurementSelected = itemRows[0].unitOfMeasurementSelected;
      quantityOrdered = itemRows.reduce((sum, row) => sum + row.quantity, 0);
      const totalCost = itemRows.reduce((sum, row) => sum + row.quantity * row.unitPrice, 0);
      unitPrice = totalCost / quantityOrdered;
    } else {
      unitOfMeasurementSelected = itemRows[0].baseUnit;
      // Convert qty to base; unitPriceBase = unitPrice / factor so totalCost stays quantity * unitPrice.
      quantityOrdered = itemRows.reduce((sum, row) => sum + row.quantity * row.conversionFactorToBase, 0);
      const totalCost = itemRows.reduce((sum, row) => sum + row.quantity * row.unitPrice, 0);
      unitPrice = totalCost / quantityOrdered;
    }

    totalAmount += quantityOrdered * unitPrice;
    items.push({ materialCode, unitOfMeasurementSelected, quantityOrdered, unitPrice });
  }

  return { items, totalAmount };
}
