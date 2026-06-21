import { relations } from 'drizzle-orm';
import { pgTable, text, uuid, index } from 'drizzle-orm/pg-core';
import {
  createdAt,
  deletedAt,
  numeric,
  materialUnitEnum,
  nonNegativeQuantityCheck,
  nonNegativeNullableQuantityCheck,
} from './common';
import { materialCategorySubs } from './categories';
import { users } from './users';

export const materials = pgTable(
  'materials',
  {
    code: text('code').primaryKey(),
    title: text('title').notNull(),
    description: text('description'),
    subCategoryId: uuid('sub_category_id')
      .notNull()
      .references(() => materialCategorySubs.id),
    unit: materialUnitEnum('unit').notNull(),
    unitCost: numeric('unit_cost').notNull(),
    quantity: numeric('quantity').notNull().default(0),
    defaultPurchaseQuantity: numeric('default_purchase_quantity'),
    deletedAt,
    createdAt,
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
  },
  (table) => [
    index('materials_sub_category_id_idx').on(table.subCategoryId),
    index('materials_created_by_idx').on(table.createdBy),
    index('materials_title_idx').on(table.title),
    nonNegativeQuantityCheck('materials_quantity_non_negative', table.quantity),
    nonNegativeNullableQuantityCheck('materials_default_purchase_quantity_non_negative', table.defaultPurchaseQuantity),
  ],
);

// ============================== RELATIONS ==============================

export const materialsRelations = relations(materials, ({ one }) => ({
  createdBy: one(users, {
    fields: [materials.createdBy],
    references: [users.id],
  }),
  subCategory: one(materialCategorySubs, {
    fields: [materials.subCategoryId],
    references: [materialCategorySubs.id],
  }),
}));
