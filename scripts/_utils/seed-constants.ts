/**
 * Shared constants for purchasing / inventory / materials seed and cleanup scripts.
 * Keep SEED_IMPORT_NOTE identical across scripts that create or target seeded rows.
 */

import { MATERIAL_UNIT_VALUES } from '../../src/utils/constants';
import type { MaterialUnit } from '../../src/utils/types';

/** Note stamped on seeded MPOs / MPRs / IVTs / customers, and on seeded material descriptions. */
export const SEED_IMPORT_NOTE = 'تم إدخال هذه البيانات آلياً من ملفات النظام القديم.';

/**
 * Cutoff for delete:seeded-purchasing-before-cutoff.
 * Deletes seeded MPOs with createdAt strictly before this instant (Cairo / UTC+3).
 * Change this value when re-running against a different historical window.
 */
export const PURCHASING_RESEED_CUTOFF = new Date('2026-07-01T00:00:00+03:00');

/** Primary Arabic labels mirrored from erp-app material-units.ts. */
export const UNIT_AR_LABELS: Record<MaterialUnit, string> = {
  count: 'عدد',
  kg: 'كيلوجرام',
  gram: 'جرام',
  ton: 'طن',
  meter: 'متر',
  cm: 'سنتيمتر',
  square_meter: 'متر²',
  cubic_meter: 'متر³',
  liter: 'لتر',
  packet: 'باكيت',
  box: 'علبة',
  roll: 'لفة',
};

/**
 * Extra spreadsheet spellings for the same enum unit.
 * Invoice and BOM files often write kg as "كيلو" and square_meter as "متر 2".
 */
export const UNIT_AR_ALIASES: Partial<Record<MaterialUnit, string[]>> = {
  count: ['لوح', 'عبوة'],
  kg: ['كيلو', 'كجم'],
  square_meter: ['متر 2', 'م2', 'م²'],
  cubic_meter: ['متر 3', 'م3', 'م³'],
  packet: ['باكت', 'كيس'],
  box: ['علبه', 'كرتونة'],
  roll: ['لفه', 'رول'],
};

function normalizeUnitText(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}

const ARABIC_TO_UNIT_KEY: Map<string, MaterialUnit> = (() => {
  const map = new Map<string, MaterialUnit>();
  for (const unit of MATERIAL_UNIT_VALUES) {
    map.set(normalizeUnitText(unit), unit);
    map.set(normalizeUnitText(UNIT_AR_LABELS[unit]), unit);
    for (const alias of UNIT_AR_ALIASES[unit] ?? []) {
      map.set(normalizeUnitText(alias), unit);
    }
  }
  return map;
})();

/** Resolve a raw sheet unit to a material_unit enum key, if known. */
export function resolveMaterialUnit(raw: string): MaterialUnit | null {
  const normalized = normalizeUnitText(raw);
  if (!normalized || normalized === '(فارغ)') return null;
  return ARABIC_TO_UNIT_KEY.get(normalized) ?? null;
}
