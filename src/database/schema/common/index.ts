import { timestamp, customType, pgEnum, check, type AnyPgColumn } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const numericPrecision = { precision: 15, scale: 3 };

export const numeric = customType<{ data: number; driverData: string }>({
  dataType: () => `numeric(${numericPrecision.precision}, ${numericPrecision.scale})`,
  fromDriver: (value: string) => parseFloat(value),
  toDriver: (value: number) => value.toString(),
});

export const positiveQuantityCheck = (name: string, column: AnyPgColumn) => check(name, sql`${column} > 0`);

export const nonNegativeQuantityCheck = (name: string, column: AnyPgColumn) => check(name, sql`${column} >= 0`);

export const nonNegativeNullableQuantityCheck = (name: string, column: AnyPgColumn) =>
  check(name, sql`${column} IS NULL OR ${column} >= 0`);

export const deletedAt = timestamp('deleted_at', { withTimezone: true });
export const createdAt = timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

export const permissionEnum = pgEnum('permission', [
  'add_user',
  'list_users',
  'update_user',
  'delete_user',
  'add_role',
  'list_roles',
  'update_role',
  'delete_role',
]); // Extended later

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

export const productSourceTypeEnum = pgEnum('product_source_type', [
  'manufactured', // مصنع
  'imported', // مستورد
]);

export const materialTypeEnum = pgEnum('material_type', [
  'raw_materials', // خامات
  'spare_parts', // قطع غيار
]);

export const inquiryStatusEnum = pgEnum('inquiry_status', [
  'pending',
  'preview_scheduled',
  'preview_done',
  'offer_sent',
  'offer_accepted',
  'offer_rejected',
  'cancelled',
]);

export const offerStatusEnum = pgEnum('offer_status', ['draft', 'sent', 'accepted', 'rejected', 'cancelled']);

export const vendorQuotationEmailStatusEnum = pgEnum('vendor_quotation_email_status', ['draft', 'sent', 'failed']);

export const inventoryTransactionTypeEnum = pgEnum('inventory_transaction_type', ['receipt', 'issue', 'return']);

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

export const loginStatusEnum = pgEnum('login_status', ['success', 'failed']);
