import { relations, sql } from 'drizzle-orm';
import { pgTable, uuid, text, timestamp, integer, index, foreignKey, check } from 'drizzle-orm/pg-core';
import { createdAt, numeric } from './common';
import { users } from './users';
import { vendors } from './vendors';
import { contractItems } from './contracts';
import { productUnits } from './product-units';

export const productPurchaseOrders = pgTable(
  'product_purchase_orders',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    code: text('code').unique().notNull(), // Format: PPO-0000001
    vendorId: uuid('vendor_id')
      .notNull()
      .references(() => vendors.id),
    totalAmount: numeric('total_amount').notNull(), // app-synced
    completedAt: timestamp('completed_at', { withTimezone: true }), // app-synced
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
  ],
);

export const productPurchaseOrderItems = pgTable(
  'product_purchase_order_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    productPurchaseOrderId: uuid('product_purchase_order_id')
      .notNull()
      .references(() => productPurchaseOrders.id),
    contractItemId: uuid('contract_item_id')
      .notNull()
      .references(() => contractItems.id),
    quantityOrdered: integer('quantity_ordered').notNull(),
    unitCost: numeric('unit_cost').notNull(),
    notes: text('notes'),
  },
  (table) => [
    index('ppoi_ppo_id_idx').on(table.productPurchaseOrderId),
    index('ppoi_contract_item_id_idx').on(table.contractItemId),
    check('ppoi_quantity_ordered_positive', sql`${table.quantityOrdered} > 0`),
  ],
);

export const productPurchaseReceipts = pgTable(
  'product_purchase_receipts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    code: text('code').unique().notNull(), // Format: PPR-0000001
    productPurchaseOrderId: uuid('product_purchase_order_id')
      .notNull()
      .references(() => productPurchaseOrders.id),
    receivedAt: timestamp('received_at', { withTimezone: true }),
    receivedBy: uuid('received_by').references(() => users.id),
    notes: text('notes'),
    createdAt,
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
  },
  (table) => [
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
    productUnitId: uuid('product_unit_id')
      .notNull()
      .unique()
      .references(() => productUnits.id),
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
