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

export const materials = pgTable(
  'materials',
  {
    code: text('code').primaryKey(),
    legacyCode: text('legacy_code').unique(),
    title: text('title').notNull(),
    description: text('description'),
    subCategoryId: uuid('sub_category_id')
      .notNull()
      .references(() => materialCategorySubs.id),
    materialType: materialTypeEnum('material_type').notNull(),
    unit: materialUnitEnum('unit').notNull(),
    unitCost: numeric('unit_cost').notNull(), // @CACHING_APP_SYNCED - Cached unit cost derived from inventory_transaction_items per costing method
    quantity: numeric('quantity').notNull().default(0), // @CACHING_APP_SYNCED - Cached net quantity from inventory_transaction_items (receipt/issue/return)
    openingUnitCost: numeric('opening_unit_cost').default(0), // Unit cost at the start of the project
    openingQuantity: numeric('opening_quantity').default(0), // Quantity on hand at the start of the project
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
    nonNegativeNullableQuantityCheck('materials_opening_unit_cost_non_negative', table.openingUnitCost),
    nonNegativeNullableQuantityCheck('materials_opening_quantity_non_negative', table.openingQuantity),
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
  productStandardBoms: many(productStandardBoms),
}));
