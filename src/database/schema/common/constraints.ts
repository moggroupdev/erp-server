import { sql } from 'drizzle-orm';
import { check, type AnyPgColumn } from 'drizzle-orm/pg-core';

export const positiveQuantityCheck = (name: string, column: AnyPgColumn) => check(name, sql`${column} > 0`);

export const positiveNullableQuantityCheck = (name: string, column: AnyPgColumn) =>
  check(name, sql`${column} IS NULL OR ${column} > 0`);

export const nonNegativeQuantityCheck = (name: string, column: AnyPgColumn) => check(name, sql`${column} >= 0`);

export const nonNegativeNullableQuantityCheck = (name: string, column: AnyPgColumn) =>
  check(name, sql`${column} IS NULL OR ${column} >= 0`);
