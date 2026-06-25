import { relations, sql } from 'drizzle-orm';
import { pgTable, text, uuid, index, check, unique, integer } from 'drizzle-orm/pg-core';
import {
  numeric,
  createdAt,
  deletedAt,
  dimensionUnitEnum,
  nonNegativeNullableQuantityCheck,
  positiveQuantityCheck,
  productSourceTypeEnum,
} from './common';
import { productCategorySubs } from './categories';
import { materials } from './materials';
import { users } from './users';
import { inquiryItems } from './inquiries';
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
    length: numeric('length'),
    width: numeric('width'),
    height: numeric('height'),
    dimensionUnit: dimensionUnitEnum('dimension_unit'),
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
      'products_dimensions_all_or_none',
      sql`(
        (${table.length} IS NULL AND ${table.width} IS NULL AND ${table.height} IS NULL AND ${table.dimensionUnit} IS NULL)
        OR
        (${table.length} IS NOT NULL AND ${table.width} IS NOT NULL AND ${table.height} IS NOT NULL AND ${table.dimensionUnit} IS NOT NULL)
      )`,
    ),
    nonNegativeNullableQuantityCheck('products_length_non_negative', table.length),
    nonNegativeNullableQuantityCheck('products_width_non_negative', table.width),
    nonNegativeNullableQuantityCheck('products_height_non_negative', table.height),
    check(
      'products_estimated_production_time_positive',
      sql`${table.estimatedProductionTime} IS NULL OR ${table.estimatedProductionTime} > 0`,
    ),
  ],
);

// Standard BOM template for a catalog product at its default dimensions.
export const productBoms = pgTable(
  'product_boms',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    productCode: text('product_code')
      .notNull()
      .references(() => products.code),
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
    unique('product_boms_product_material_unique').on(table.productCode, table.materialCode),
    index('product_boms_product_code_idx').on(table.productCode),
    index('product_boms_material_code_idx').on(table.materialCode),
    positiveQuantityCheck('product_boms_quantity_required_positive', table.quantityRequired),
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
  standardBoms: many(productBoms),
  inquiryItems: many(inquiryItems),
  offerItems: many(offerItems),
  contractItems: many(contractItems),
}));

export const productBomsRelations = relations(productBoms, ({ one }) => ({
  product: one(products, {
    fields: [productBoms.productCode],
    references: [products.code],
  }),
  material: one(materials, {
    fields: [productBoms.materialCode],
    references: [materials.code],
  }),
  createdBy: one(users, {
    fields: [productBoms.createdBy],
    references: [users.id],
  }),
}));
