import { pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { createdAt, deletedAt, dimensionUnitEnum, nonNegativeQuantityCheck, numeric, productCategoryEnum } from './common';
import { users } from './users';

export const products = pgTable('products', {
  code: text('code').primaryKey(),
  title: text('title').notNull(),
  description: text('description'),
  category: productCategoryEnum('category').notNull(),
  deletedAt,
  createdAt,
  createdBy: uuid('created_by')
    .notNull()
    .references(() => users.id),
});

export const productStandardDimensions = pgTable(
  'product_standard_dimensions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    productCode: text('product_code')
      .notNull()
      .unique()
      .references(() => products.code),
    length: numeric('length').notNull(),
    width: numeric('width').notNull(),
    height: numeric('height').notNull(),
    unit: dimensionUnitEnum('unit').notNull(),
  },
  (table) => [
    nonNegativeQuantityCheck('product_standard_dimensions_length_non_negative', table.length),
    nonNegativeQuantityCheck('product_standard_dimensions_width_non_negative', table.width),
    nonNegativeQuantityCheck('product_standard_dimensions_height_non_negative', table.height),
  ],
);

export const productsRelations = relations(products, ({ one }) => ({
  createdBy: one(users, {
    fields: [products.createdBy],
    references: [users.id],
  }),
  standardDimensions: one(productStandardDimensions, {
    fields: [products.code],
    references: [productStandardDimensions.productCode],
  }),
}));

export const productStandardDimensionsRelations = relations(productStandardDimensions, ({ one }) => ({
  product: one(products, {
    fields: [productStandardDimensions.productCode],
    references: [products.code],
  }),
}));
