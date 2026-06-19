import { pgTable, uuid, text, check } from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import { createdAt, inventoryTransactionTypeEnum, numeric } from './common';
import { users } from './users';
import { purchaseReceipts } from './purchasing';
import { productionPlans } from './production-plans';
import { orders } from './orders';
import { materials } from './materials';

export const inventoryTransactions = pgTable(
  'inventory_transactions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    transactionType: inventoryTransactionTypeEnum('transaction_type').notNull(),
    purchaseReceiptId: uuid('purchase_receipt_id').references(() => purchaseReceipts.id),
    productionPlanId: uuid('production_plan_id').references(() => productionPlans.id),
    orderId: uuid('order_id').references(() => orders.id),
    notes: text('notes'),
    createdAt,
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
  },
  (table) => [
    check(
      'inventory_transactions_receipt_check',
      sql`(
        (
          ${table.transactionType} = 'receipt'
          AND ${table.purchaseReceiptId} IS NOT NULL
          AND ${table.productionPlanId} IS NULL
          AND ${table.orderId} IS NULL
        )
        OR
        (
          ${table.transactionType} = 'issue'
          AND ${table.purchaseReceiptId} IS NULL
          AND ${table.productionPlanId} IS NOT NULL
          AND ${table.orderId} IS NOT NULL
        )
      )`,
    ),
  ],
);

export const inventoryTransactionItems = pgTable(
  'inventory_transaction_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    transactionId: uuid('transaction_id')
      .notNull()
      .references(() => inventoryTransactions.id),
    materialCode: text('material_code')
      .notNull()
      .references(() => materials.code),
    quantity: numeric('quantity').notNull(),
    unitCost: numeric('unit_cost'),
  },
  (table) => [check('inventory_transaction_items_quantity_positive', sql`${table.quantity} > 0`)],
);

export const inventoryTransactionsRelations = relations(inventoryTransactions, ({ one, many }) => ({
  createdBy: one(users, {
    fields: [inventoryTransactions.createdBy],
    references: [users.id],
    relationName: 'inventoryTransactionCreatedBy',
  }),
  purchaseReceipt: one(purchaseReceipts, {
    fields: [inventoryTransactions.purchaseReceiptId],
    references: [purchaseReceipts.id],
  }),
  productionPlan: one(productionPlans, {
    fields: [inventoryTransactions.productionPlanId],
    references: [productionPlans.id],
  }),
  order: one(orders, {
    fields: [inventoryTransactions.orderId],
    references: [orders.id],
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
}));
