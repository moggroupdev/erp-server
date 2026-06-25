import { sql } from 'drizzle-orm';
import { timestamp, customType, pgEnum, check, type AnyPgColumn } from 'drizzle-orm/pg-core';
import {
  DIMENSION_UNIT_VALUES,
  INQUIRY_STATUS_VALUES,
  INVENTORY_TRANSACTION_TYPE_VALUES,
  LOGIN_STATUS_VALUES,
  MATERIAL_TYPE_VALUES,
  MATERIAL_UNIT_VALUES,
  OFFER_STATUS_VALUES,
  PERMISSION_VALUES,
  PRODUCT_SOURCE_TYPE_VALUES,
  VENDOR_QUOTATION_EMAIL_STATUS_VALUES,
  PRODUCTION_STAGE_VALUES,
} from 'src/utils/constants';

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

// ==================== ENUMS ====================

export const permissionEnum = pgEnum('permission', PERMISSION_VALUES);

export const loginStatusEnum = pgEnum('login_status', LOGIN_STATUS_VALUES);

export const materialUnitEnum = pgEnum('material_unit', MATERIAL_UNIT_VALUES);

export const dimensionUnitEnum = pgEnum('dimension_unit', DIMENSION_UNIT_VALUES);

export const materialTypeEnum = pgEnum('material_type', MATERIAL_TYPE_VALUES);

export const productSourceTypeEnum = pgEnum('product_source_type', PRODUCT_SOURCE_TYPE_VALUES);

export const inquiryStatusEnum = pgEnum('inquiry_status', INQUIRY_STATUS_VALUES);

export const offerStatusEnum = pgEnum('offer_status', OFFER_STATUS_VALUES);

export const vendorQuotationEmailStatusEnum = pgEnum('vendor_quotation_email_status', VENDOR_QUOTATION_EMAIL_STATUS_VALUES);

export const inventoryTransactionTypeEnum = pgEnum('inventory_transaction_type', INVENTORY_TRANSACTION_TYPE_VALUES);

export const productionStageEnum = pgEnum('production_stage', PRODUCTION_STAGE_VALUES);
