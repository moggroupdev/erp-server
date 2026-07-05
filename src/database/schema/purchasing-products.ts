import { relations, sql } from 'drizzle-orm';
import { pgTable, uuid, text, timestamp, integer, index, foreignKey, check } from 'drizzle-orm/pg-core';
import { createdAt, numeric, nonNegativeQuantityCheck, positiveQuantityCheck } from './common';
import { users } from './users';
import { vendors } from './vendors';
import { contractItems } from './contracts';
import { productUnits } from './product-units';

export const productPurchaseOrders = pgTable(
  'product_purchase_orders',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    code: text('code').unique().notNull(), // Format: PPO-00000001
    vendorId: uuid('vendor_id')
      .notNull()
      .references(() => vendors.id),
    totalAmount: numeric('total_amount').notNull(), // app-synced — SUM(quantity_ordered * unit_cost) from product_purchase_order_items
    completedAt: timestamp('completed_at', { withTimezone: true }), // app-synced — set when every ordered unit has a linked product_purchase_receipt_items row
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    notes: text('notes'),
    createdAt,
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
  },
  (table) => [
    index('ppo_code_idx').on(table.code),
    index('ppo_vendor_id_idx').on(table.vendorId),
    index('ppo_created_at_idx').on(table.createdAt),
    index('ppo_created_by_idx').on(table.createdBy),
    index('ppo_completed_at_idx').on(table.completedAt),
    index('ppo_cancelled_at_idx').on(table.cancelledAt),
    check('ppo_completed_cancelled_exclusive', sql`${table.completedAt} IS NULL OR ${table.cancelledAt} IS NULL`),
    nonNegativeQuantityCheck('ppo_total_amount_non_negative', table.totalAmount),
  ],
);

export const productPurchaseOrderItems = pgTable(
  'product_purchase_order_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    productPurchaseOrderId: uuid('product_purchase_order_id').notNull(),
    contractItemId: uuid('contract_item_id').notNull(),
    quantityOrdered: integer('quantity_ordered').notNull(),
    unitCost: numeric('unit_cost').notNull(),
    notes: text('notes'),
  },
  (table) => [
    foreignKey({
      name: 'ppoi_ppo_id_fk',
      columns: [table.productPurchaseOrderId],
      foreignColumns: [productPurchaseOrders.id],
    }),
    foreignKey({
      name: 'ppoi_contract_item_id_fk',
      columns: [table.contractItemId],
      foreignColumns: [contractItems.id],
    }),
    index('ppoi_ppo_id_idx').on(table.productPurchaseOrderId),
    index('ppoi_contract_item_id_idx').on(table.contractItemId),
    check('ppoi_quantity_ordered_positive', sql`${table.quantityOrdered} > 0`),
    positiveQuantityCheck('ppoi_unit_cost_positive', table.unitCost),
  ],
);

export const productPurchaseReceipts = pgTable(
  'product_purchase_receipts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    code: text('code').unique().notNull(), // Format: PPR-00000001
    productPurchaseOrderId: uuid('product_purchase_order_id').notNull(),
    receivedAt: timestamp('received_at', { withTimezone: true }),
    receivedBy: uuid('received_by').references(() => users.id),
    notes: text('notes'),
    createdAt,
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
  },
  (table) => [
    foreignKey({
      name: 'ppr_ppo_id_fk',
      columns: [table.productPurchaseOrderId],
      foreignColumns: [productPurchaseOrders.id],
    }),
    index('ppr_code_idx').on(table.code),
    index('ppr_ppo_id_idx').on(table.productPurchaseOrderId),
    index('ppr_received_at_idx').on(table.receivedAt),
    index('ppr_received_by_idx').on(table.receivedBy),
    index('ppr_created_at_idx').on(table.createdAt),
    index('ppr_created_by_idx').on(table.createdBy),
  ],
);

export const productPurchaseReceiptItems = pgTable(
  'product_purchase_receipt_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    productPurchaseReceiptId: uuid('product_purchase_receipt_id').notNull(),
    productPurchaseOrderItemId: uuid('product_purchase_order_item_id').notNull(),
    productUnitId: uuid('product_unit_id').notNull().unique(),
    inspectionNotes: text('inspection_notes'),
  },
  (table) => [
    foreignKey({
      name: 'ppri_receipt_id_fk',
      columns: [table.productPurchaseReceiptId],
      foreignColumns: [productPurchaseReceipts.id],
    }),
    foreignKey({
      name: 'ppri_ppoi_id_fk',
      columns: [table.productPurchaseOrderItemId],
      foreignColumns: [productPurchaseOrderItems.id],
    }),
    foreignKey({
      name: 'ppri_product_unit_id_fk',
      columns: [table.productUnitId],
      foreignColumns: [productUnits.id],
    }),
    index('ppri_receipt_id_idx').on(table.productPurchaseReceiptId),
    index('ppri_ppoi_id_idx').on(table.productPurchaseOrderItemId),
    index('ppri_product_unit_id_idx').on(table.productUnitId),
  ],
);

// ============================== RELATIONS ==============================

export const productPurchaseOrdersRelations = relations(productPurchaseOrders, ({ one, many }) => ({
  vendor: one(vendors, {
    fields: [productPurchaseOrders.vendorId],
    references: [vendors.id],
  }),
  createdBy: one(users, {
    fields: [productPurchaseOrders.createdBy],
    references: [users.id],
    relationName: 'productPurchaseOrderCreatedBy',
  }),
  items: many(productPurchaseOrderItems),
  receipts: many(productPurchaseReceipts),
}));

export const productPurchaseOrderItemsRelations = relations(productPurchaseOrderItems, ({ one, many }) => ({
  productPurchaseOrder: one(productPurchaseOrders, {
    fields: [productPurchaseOrderItems.productPurchaseOrderId],
    references: [productPurchaseOrders.id],
  }),
  contractItem: one(contractItems, {
    fields: [productPurchaseOrderItems.contractItemId],
    references: [contractItems.id],
  }),
  receiptItems: many(productPurchaseReceiptItems),
}));

export const productPurchaseReceiptsRelations = relations(productPurchaseReceipts, ({ one, many }) => ({
  productPurchaseOrder: one(productPurchaseOrders, {
    fields: [productPurchaseReceipts.productPurchaseOrderId],
    references: [productPurchaseOrders.id],
  }),
  receivedBy: one(users, {
    fields: [productPurchaseReceipts.receivedBy],
    references: [users.id],
    relationName: 'productPurchaseReceiptReceivedBy',
  }),
  createdBy: one(users, {
    fields: [productPurchaseReceipts.createdBy],
    references: [users.id],
    relationName: 'productPurchaseReceiptCreatedBy',
  }),
  items: many(productPurchaseReceiptItems),
}));

export const productPurchaseReceiptItemsRelations = relations(productPurchaseReceiptItems, ({ one }) => ({
  productPurchaseReceipt: one(productPurchaseReceipts, {
    fields: [productPurchaseReceiptItems.productPurchaseReceiptId],
    references: [productPurchaseReceipts.id],
  }),
  productPurchaseOrderItem: one(productPurchaseOrderItems, {
    fields: [productPurchaseReceiptItems.productPurchaseOrderItemId],
    references: [productPurchaseOrderItems.id],
  }),
  productUnit: one(productUnits, {
    fields: [productPurchaseReceiptItems.productUnitId],
    references: [productUnits.id],
  }),
}));
