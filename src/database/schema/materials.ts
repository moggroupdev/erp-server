import { relations } from 'drizzle-orm';
import { pgTable, text, uuid, index } from 'drizzle-orm/pg-core';
import {
  createdAt,
  deletedAt,
  numeric,
  materialUnitEnum,
  materialTypeEnum,
  nonNegativeQuantityCheck,
  nonNegativeNullableQuantityCheck,
  positiveQuantityCheck,
} from './common';
import { materialCategorySubs } from './categories';
import { users } from './users';
import { materialPurchaseOrderItems } from './purchasing-materials';
import { inventoryTransactionItems } from './inventory-transactions';
import { productStandardBoms } from './products';
import { boms } from './boms';

export const materials = pgTable(
  'materials',
  {
    code: text('code').primaryKey(),
    title: text('title').notNull(),
    description: text('description'),
    subCategoryId: uuid('sub_category_id')
      .notNull()
      .references(() => materialCategorySubs.id),
    materialType: materialTypeEnum('material_type').notNull(),
    unit: materialUnitEnum('unit').notNull(),
    unitCost: numeric('unit_cost').notNull(),
    quantity: numeric('quantity').notNull().default(0), // app-synced
    initialQuantity: numeric('initial_quantity').default(0), // Quantity on hand at the start of the project
    minimumStock: numeric('minimum_stock'),
    deletedAt,
    createdAt,
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
  },
  (table) => [
    index('materials_title_idx').on(table.title),
    index('materials_sub_category_id_idx').on(table.subCategoryId),
    nonNegativeQuantityCheck('materials_quantity_non_negative', table.quantity),
    nonNegativeNullableQuantityCheck('materials_initial_quantity_non_negative', table.initialQuantity),
    nonNegativeNullableQuantityCheck('materials_minimum_stock_non_negative', table.minimumStock),
    positiveQuantityCheck('materials_unit_cost_positive', table.unitCost),
  ],
);

// ============================== RELATIONS ==============================

export const materialsRelations = relations(materials, ({ one, many }) => ({
  createdBy: one(users, {
    fields: [materials.createdBy],
    references: [users.id],
  }),
  subCategory: one(materialCategorySubs, {
    fields: [materials.subCategoryId],
    references: [materialCategorySubs.id],
  }),
  purchaseOrderItems: many(materialPurchaseOrderItems),
  inventoryTransactionItems: many(inventoryTransactionItems),
  boms: many(boms),
  productStandardBoms: many(productStandardBoms),
}));
