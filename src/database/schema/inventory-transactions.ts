import { pgTable, uuid, text, index, check, foreignKey } from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import { createdAt, inventoryTransactionTypeEnum, numeric } from './common';
import { users } from './users';
import { purchaseReceiptItems } from './purchasing';
import { productionPlanItems } from './production-plans';
import { materials } from './materials';
import { products } from './products';

export const inventoryTransactions = pgTable(
  'inventory_transactions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    transactionType: inventoryTransactionTypeEnum('transaction_type').notNull(),
    notes: text('notes'),
    createdAt,
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
  },
  (table) => [
    index('inventory_transactions_created_by_idx').on(table.createdBy),
    index('inventory_transactions_transaction_type_idx').on(table.transactionType),
    index('inventory_transactions_created_at_idx').on(table.createdAt),
  ],
);

export const inventoryTransactionItems = pgTable(
  'inventory_transaction_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    transactionId: uuid('transaction_id').notNull(),
    materialCode: text('material_code')
      .references(() => materials.code),
    productCode: text('product_code')
      .references(() => products.code),
    quantity: numeric('quantity').notNull(),
    unitCost: numeric('unit_cost').notNull(),
    // Source:
    purchaseReceiptItemId: uuid('purchase_receipt_item_id'),
    productionPlanItemId: uuid('production_plan_item_id'),
  },
  (table) => [
    foreignKey({
      name: 'inv_tx_items_tx_id_fk',
      columns: [table.transactionId],
      foreignColumns: [inventoryTransactions.id],
    }),
    foreignKey({
      name: 'inv_tx_items_pr_item_id_fk',
      columns: [table.purchaseReceiptItemId],
      foreignColumns: [purchaseReceiptItems.id],
    }),
    foreignKey({
      name: 'inv_tx_items_pp_item_id_fk',
      columns: [table.productionPlanItemId],
      foreignColumns: [productionPlanItems.id],
    }),
    index('inventory_transaction_items_transaction_id_idx').on(table.transactionId),
    index('inventory_transaction_items_material_code_idx').on(table.materialCode),
    index('inventory_transaction_items_product_code_idx').on(table.productCode),
    index('inventory_transaction_items_purchase_receipt_item_id_idx').on(table.purchaseReceiptItemId),
    index('inventory_transaction_items_production_plan_item_id_idx').on(table.productionPlanItemId),
    check('inventory_transaction_items_quantity_positive', sql`${table.quantity} > 0`),
    check(
      'inventory_transaction_items_source_xor',
      sql`(
        (${table.purchaseReceiptItemId} IS NOT NULL AND ${table.productionPlanItemId} IS NULL)
        OR
        (${table.purchaseReceiptItemId} IS NULL AND ${table.productionPlanItemId} IS NOT NULL)
      )`,
    ),
    check(
      'inventory_transaction_items_material_or_product_xor',
      sql`(
        (${table.materialCode} IS NOT NULL AND ${table.productCode} IS NULL)
        OR
        (${table.materialCode} IS NULL AND ${table.productCode} IS NOT NULL)
      )`,
    ),
  ],
);

// ============================== RELATIONS ==============================

export const inventoryTransactionsRelations = relations(inventoryTransactions, ({ one, many }) => ({
  createdBy: one(users, {
    fields: [inventoryTransactions.createdBy],
    references: [users.id],
    relationName: 'inventoryTransactionCreatedBy',
  }),
  items: many(inventoryTransactionItems),
}));

export const inventoryTransactionItemsRelations = relations(inventoryTransactionItems, ({ one }) => ({
  transaction: one(inventoryTransactions, {
    fields: [inventoryTransactionItems.transactionId],
    references: [inventoryTransactions.id],
  }),
  material: one(materials, {
    fields: [inventoryTransactionItems.materialCode],
    references: [materials.code],
  }),
  product: one(products, {
    fields: [inventoryTransactionItems.productCode],
    references: [products.code],
  }),
  purchaseReceiptItem: one(purchaseReceiptItems, {
    fields: [inventoryTransactionItems.purchaseReceiptItemId],
    references: [purchaseReceiptItems.id],
  }),
  productionPlanItem: one(productionPlanItems, {
    fields: [inventoryTransactionItems.productionPlanItemId],
    references: [productionPlanItems.id],
  }),
}));
