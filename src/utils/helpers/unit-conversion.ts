import type { MaterialUnit } from 'src/utils/types';

const MASS_TO_GRAM: Partial<Record<MaterialUnit, number>> = {
  gram: 1,
  kg: 1000,
  ton: 1_000_000,
};

const LENGTH_TO_CM: Partial<Record<MaterialUnit, number>> = {
  cm: 1,
  meter: 100,
};

const KNOWN_UNIT_GROUPS: Partial<Record<MaterialUnit, number>>[] = [MASS_TO_GRAM, LENGTH_TO_CM];

function getGroupRatio(unitA: MaterialUnit, unitB: MaterialUnit): number | null {
  for (const group of KNOWN_UNIT_GROUPS) {
    if (group[unitA] !== undefined && group[unitB] !== undefined) return group[unitA]! / group[unitB]!;
  }
  return null;
}

/** Exact "1 unit = X base" factor when both units share a known group, or via an existing alternate; otherwise null. */
export function getKnownConversionFactorToBase(
  unit: MaterialUnit,
  baseUnit: MaterialUnit,
  existingConversions: { unit: MaterialUnit; conversionFactorToBase: number }[] = [],
): number | null {
  const directFactor = getGroupRatio(unit, baseUnit);
  if (directFactor != null) return directFactor;

  for (const existing of existingConversions) {
    const ratioToExisting = getGroupRatio(unit, existing.unit);
    if (ratioToExisting != null) return ratioToExisting * Number(existing.conversionFactorToBase);
  }

  return null;
}

/**
 * Resolve which unit/factor to use for a material given a selected unit.
 * Falls back to the material's base unit when the selected unit cannot be converted.
 */
export function resolveConversionFactor(
  selectedUnit: MaterialUnit | null | undefined,
  baseUnit: MaterialUnit,
  unitConversions: { unit: MaterialUnit; conversionFactorToBase: number }[] = [],
): number {
  if (!selectedUnit || selectedUnit === baseUnit) return 1;

  const stored = unitConversions.find((row) => row.unit === selectedUnit);
  if (stored) return Number(stored.conversionFactorToBase);

  const knownFactor = getKnownConversionFactorToBase(selectedUnit, baseUnit, unitConversions);
  if (knownFactor != null) return knownFactor;

  return 1;
}

export function toBaseQuantity(enteredQuantity: number, factor: number): number {
  return Number(enteredQuantity) * factor;
}

/** Convert a price expressed in `fromUnit` into the equivalent price in `toUnit`. */
export function convertUnitPrice(
  unitPrice: number,
  fromUnit: MaterialUnit,
  toUnit: MaterialUnit,
  baseUnit: MaterialUnit,
  unitConversions: { unit: MaterialUnit; conversionFactorToBase: number }[] = [],
): number {
  if (fromUnit === toUnit) return Number(unitPrice);

  const fromFactor = resolveConversionFactor(fromUnit, baseUnit, unitConversions);
  const toFactor = resolveConversionFactor(toUnit, baseUnit, unitConversions);
  if (fromFactor === 0) return Number(unitPrice);

  return (Number(unitPrice) / fromFactor) * toFactor;
}
