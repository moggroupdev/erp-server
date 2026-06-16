import { pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { createdAt, deletedAt, productCategoryEnum } from './common';
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

export const productsRelations = relations(products, ({ one }) => ({
  createdBy: one(users, {
    fields: [products.createdBy],
    references: [users.id],
  }),
}));
