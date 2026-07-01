import { relations, sql } from 'drizzle-orm';
import { pgTable, text, uuid, index, check, unique, integer, boolean, uniqueIndex, foreignKey } from 'drizzle-orm/pg-core';
import {
  numeric,
  createdAt,
  deletedAt,
  dimensionUnitEnum,
  nonNegativeQuantityCheck,
  positiveQuantityCheck,
  productSourceTypeEnum,
  productionSubDepartmentEnum,
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
  ],
);

export const productDimensions = pgTable(
  'product_dimensions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    productCode: text('product_code')
      .notNull()
      .references(() => products.code),
    length: numeric('length').notNull(),
    width: numeric('width').notNull(),
    height: numeric('height').notNull(),
    dimensionUnit: dimensionUnitEnum('dimension_unit').notNull(),
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
    nonNegativeQuantityCheck('product_dimensions_length_non_negative', table.length),
    nonNegativeQuantityCheck('product_dimensions_width_non_negative', table.width),
    nonNegativeQuantityCheck('product_dimensions_height_non_negative', table.height),
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
    quantityRequired: numeric('quantity_required').notNull(),
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
    unique('product_standard_boms_dimension_material_unique').on(table.productDimensionId, table.materialCode),
    index('product_standard_boms_product_dimension_id_idx').on(table.productDimensionId),
    index('product_standard_boms_material_code_idx').on(table.materialCode),
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
    subDepartment: productionSubDepartmentEnum('sub_department').notNull(),
    sequenceOrder: integer('sequence_order').notNull(), // app-checked. Sequential order within the product's production routes.
    completionPercentage: numeric('completion_percentage').notNull(),
  },
  (table) => [
    unique('product_production_routes_product_sub_dept_unique').on(table.productCode, table.subDepartment),
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
