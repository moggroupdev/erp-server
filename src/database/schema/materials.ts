import { relations } from 'drizzle-orm';
import { pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { createdAt, deletedAt, numeric, materialUnitEnum } from './common';
import { users } from './users';

export const materials = pgTable('materials', {
  code: text('code').primaryKey(),
  title: text('title').notNull(),
  description: text('description'),
  unit: materialUnitEnum('unit').notNull(),
  unitCost: numeric('unit_cost').notNull(),
  quantity: numeric('quantity').notNull().default(0),
  defaultPurchaseQuantity: numeric('default_purchase_quantity'),
  deletedAt,
  createdAt,
  createdBy: uuid('created_by')
    .notNull()
    .references(() => users.id),
});

export const materialsRelations = relations(materials, ({ one }) => ({
  createdBy: one(users, {
    fields: [materials.createdBy],
    references: [users.id],
  }),
}));
