import { relations, sql } from 'drizzle-orm';
import { pgTable, text, uuid, index, check, unique, integer, boolean, uniqueIndex, foreignKey } from 'drizzle-orm/pg-core';
import {
  numeric,
  percentage,
  createdAt,
  deletedAt,
  nonNegativeQuantityCheck,
  nonNegativeNullableQuantityCheck,
  positiveQuantityCheck,
  productSourceTypeEnum,
  productionSubDepartmentEnum,
  materialUnitEnum,
} from './common';
import { users } from './users';
import { productCategorySubs } from './categories';
import { materials } from './materials';
import { inquiryItems } from './inquiries';
import { previewItems } from './previews';
import { offerItems } from './offers';
import { contractItems } from './contracts';

export const products = pgTable(
  'products',
  {
    code: text('code').primaryKey(),
    title: text('title').notNull(),
    description: text('description'),
    subCategoryId: uuid('sub_category_id')
      .notNull()
      .references(() => productCategorySubs.id),
    sourceType: productSourceTypeEnum('source_type').notNull(),
    estimatedProductionTime: integer('estimated_production_time'), // In Days
    pricingFactor: numeric('pricing_factor').notNull(), // Multiplier on standard BOM total cost to derive catalog unit price
    deletedAt,
    createdAt,
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
  },
  (table) => [
    index('products_title_idx').on(table.title),
    index('products_sub_category_id_idx').on(table.subCategoryId),
    check(
      'products_estimated_production_time_positive',
      sql`${table.estimatedProductionTime} IS NULL OR ${table.estimatedProductionTime} > 0`,
    ),
    positiveQuantityCheck('products_pricing_factor_positive', table.pricingFactor),
  ],
);

export const productDimensions = pgTable(
  'product_dimensions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    productCode: text('product_code')
      .notNull()
      .references(() => products.code),
    length: numeric('length'),
    depth: numeric('depth'),
    diameter: numeric('diameter'),
    height: numeric('height').notNull(),
    isDefault: boolean('is_default').notNull().default(false),
    createdAt,
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
  },
  (table) => [
    index('product_dimensions_product_code_idx').on(table.productCode),
    uniqueIndex('product_dimensions_default_per_product_idx')
      .on(table.productCode)
      .where(sql`${table.isDefault} = true`),
    nonNegativeNullableQuantityCheck('product_dimensions_length_non_negative', table.length),
    nonNegativeNullableQuantityCheck('product_dimensions_depth_non_negative', table.depth),
    nonNegativeNullableQuantityCheck('product_dimensions_diameter_non_negative', table.diameter),
    nonNegativeQuantityCheck('product_dimensions_height_non_negative', table.height),
    // Either (length AND depth) OR diameter - never both, never neither. Height is always required.
    check(
      'product_dimensions_length_depth_xor_diameter',
      sql`(${table.length} IS NOT NULL AND ${table.depth} IS NOT NULL AND ${table.diameter} IS NULL)
          OR (${table.length} IS NULL AND ${table.depth} IS NULL AND ${table.diameter} IS NOT NULL)`,
    ),
  ],
);

// Standard BOM template for a catalog product at a specific dimension variant.
export const productStandardBoms = pgTable(
  'product_standard_boms',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    productDimensionId: uuid('product_dimension_id').notNull(),
    materialCode: text('material_code')
      .notNull()
      .references(() => materials.code),
    quantityRequired: numeric('quantity_required').notNull(), // @APP_CHECKED - Stored in unit_of_measurement_selected (or base unit when null)
    unitOfMeasurementSelected: materialUnitEnum('unit_of_measurement_selected'), // @APP_CHECKED - Must be the material's base unit or one of its conversions
    productionSubDepartment: productionSubDepartmentEnum('production_sub_department'),
    notes: text('notes'),
    createdAt,
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
  },
  (table) => [
    foreignKey({
      name: 'psb_product_dimension_id_fk',
      columns: [table.productDimensionId],
      foreignColumns: [productDimensions.id],
    }),
    unique('product_standard_boms_dimension_material_department_unique')
      .on(table.productDimensionId, table.materialCode, table.productionSubDepartment)
      .nullsNotDistinct(),
    index('product_standard_boms_product_dimension_id_idx').on(table.productDimensionId),
    index('product_standard_boms_material_code_idx').on(table.materialCode),
    index('product_standard_boms_production_sub_department_idx').on(table.productionSubDepartment),
    positiveQuantityCheck('product_standard_boms_quantity_required_positive', table.quantityRequired),
  ],
);

export const productProductionRoutes = pgTable(
  'product_production_routes',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    productCode: text('product_code')
      .notNull()
      .references(() => products.code),
    productionSubDepartment: productionSubDepartmentEnum('production_sub_department').notNull(),
    sequenceOrder: integer('sequence_order').notNull(), // @APP_CHECKED - Sequential step order within the product's production routes
    completionPercentage: percentage('completion_percentage').notNull(), // @APP_CHECKED - Active routes for a product must sum to 100%
  },
  (table) => [
    unique('product_production_routes_product_sub_dept_unique').on(table.productCode, table.productionSubDepartment),
    unique('product_production_routes_product_sequence_unique').on(table.productCode, table.sequenceOrder),
    index('product_production_routes_product_code_idx').on(table.productCode),
    check('product_production_routes_sequence_order_positive', sql`${table.sequenceOrder} > 0`),
    check(
      'product_production_routes_completion_percentage_range',
      sql`${table.completionPercentage} > 0 AND ${table.completionPercentage} <= 100`,
    ),
  ],
);

// ============================== RELATIONS ==============================

export const productsRelations = relations(products, ({ one, many }) => ({
  createdBy: one(users, {
    fields: [products.createdBy],
    references: [users.id],
  }),
  subCategory: one(productCategorySubs, {
    fields: [products.subCategoryId],
    references: [productCategorySubs.id],
  }),
  dimensions: many(productDimensions),
  productionRoutes: many(productProductionRoutes),
  inquiryItems: many(inquiryItems),
  previewItems: many(previewItems),
  offerItems: many(offerItems),
  contractItems: many(contractItems),
}));

export const productDimensionsRelations = relations(productDimensions, ({ one, many }) => ({
  product: one(products, {
    fields: [productDimensions.productCode],
    references: [products.code],
  }),
  createdBy: one(users, {
    fields: [productDimensions.createdBy],
    references: [users.id],
  }),
  standardBoms: many(productStandardBoms),
  inquiryItems: many(inquiryItems),
  previewItems: many(previewItems),
  offerItems: many(offerItems),
  contractItems: many(contractItems),
}));

export const productStandardBomsRelations = relations(productStandardBoms, ({ one }) => ({
  productDimension: one(productDimensions, {
    fields: [productStandardBoms.productDimensionId],
    references: [productDimensions.id],
  }),
  material: one(materials, {
    fields: [productStandardBoms.materialCode],
    references: [materials.code],
  }),
  createdBy: one(users, {
    fields: [productStandardBoms.createdBy],
    references: [users.id],
  }),
}));

export const productProductionRoutesRelations = relations(productProductionRoutes, ({ one }) => ({
  product: one(products, {
    fields: [productProductionRoutes.productCode],
    references: [products.code],
  }),
}));
