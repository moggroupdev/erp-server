import { sql, type SQLWrapper } from 'drizzle-orm';
import type { MaterialUnit } from '../types';

export type MaterialUnitConversionSummary = {
  id: string;
  unit: MaterialUnit;
  conversionFactorToBase: string;
};

/**
 * Correlated JSON agg for `material.unitConversions`.
 * Pass as `extras` instead of nested `with: { unitConversions }` — Drizzle's `with`
 * aliases (`{table}_{rel}_{rel}_…`) are truncated by Postgres at 63 chars.
 */
export function materialUnitConversionsExtra(fields: { code: SQLWrapper }, operators: { sql: typeof sql }) {
  return {
    unitConversions: operators.sql<MaterialUnitConversionSummary[]>`(
      select coalesce(
        json_agg(json_build_object(
          'id', muc.id,
          'unit', muc.unit,
          'conversionFactorToBase', muc.conversion_factor_to_base::text
        )),
        '[]'::json
      )
      from material_unit_conversions muc
      where muc.material_code = ${fields.code}
    )`.as('unit_conversions'),
  };
}
