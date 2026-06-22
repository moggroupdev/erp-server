import { relations, sql } from 'drizzle-orm';
import { pgTable, text, uuid, index, check } from 'drizzle-orm/pg-core';
import {
  createdAt,
  deletedAt,
  dimensionUnitEnum,
  nonNegativeNullableQuantityCheck,
  numeric,
  productSourceTypeEnum,
} from './common';
import { productCategorySubs } from './categories';
import { users } from './users';

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
  ],
);

// ============================== RELATIONS ==============================

export const productsRelations = relations(products, ({ one }) => ({
  createdBy: one(users, {
    fields: [products.createdBy],
    references: [users.id],
  }),
  subCategory: one(productCategorySubs, {
    fields: [products.subCategoryId],
    references: [productCategorySubs.id],
  }),
}));
