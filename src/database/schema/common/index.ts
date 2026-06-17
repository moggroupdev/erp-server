import { timestamp, customType, pgEnum, check, type AnyPgColumn } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const numericPrecision = { precision: 15, scale: 3 };

export const numeric = customType<{ data: number; driverData: string }>({
  dataType: () => `numeric(${numericPrecision.precision}, ${numericPrecision.scale})`,
  fromDriver: (value: string) => parseFloat(value),
  toDriver: (value: number) => value.toString(),
});

export const nonNegativeQuantityCheck = (name: string, column: AnyPgColumn) => check(name, sql`${column} >= 0`);

export const nonNegativeNullableQuantityCheck = (name: string, column: AnyPgColumn) =>
  check(name, sql`${column} IS NULL OR ${column} >= 0`);

export const deletedAt = timestamp('deleted_at', { withTimezone: true });
export const createdAt = timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

export const materialUnitEnum = pgEnum('material_unit', [
  'count',
  'kg',
  'gram',
  'meter',
  'cm',
  'liter',
  'sheet',
  'roll',
  'box',
]);

export const dimensionUnitEnum = pgEnum('dimension_unit', ['m', 'cm', 'mm']);

export const inquiryStatusEnum = pgEnum('inquiry_status', [
  'pending',
  'preview_scheduled',
  'preview_done',
  'offer_sent',
  'offer_accepted',
  'offer_rejected',
  'cancelled',
]);

export const previewStatusEnum = pgEnum('preview_status', ['scheduled', 'done', 'cancelled']);

export const offerStatusEnum = pgEnum('offer_status', ['draft', 'sent', 'accepted', 'rejected', 'cancelled']);

export const orderStatusEnum = pgEnum('order_status', ['pending', 'in_progress', 'completed', 'cancelled']);

export const purchaseOrderStatusEnum = pgEnum('purchase_order_status', ['pending', 'in_progress', 'completed', 'cancelled']);

export const deliveryStatusEnum = pgEnum('delivery_status', ['pending', 'shipping', 'delivered', 'cancelled']);

export const productionStageEnum = pgEnum('production_stage', [
  'cutting', // قسم المقص
  'bending', // قسم الثني
  'refrigeration', // قسم التبريد
  'electricity', // قسم الكهرباء
  'gas', // قسم الغاز
  'injection', // قسم الحقن
  'neutral_sheet_metal', // قسم سمكرة متعادل
  'cold_sheet_metal', // قسم سمكرة بارد
  'hot_sheet_metal', // قسم سمكرة ساخن
  'blacksmithing', // قسم الحدادة
  'maintenance', // قسم الصيانة
]);
