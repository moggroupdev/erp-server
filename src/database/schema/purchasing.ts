import { pgTable, uuid, text, timestamp } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { createdAt, numeric, purchaseOrderStatusEnum, purchaseReceiptStatusEnum, nonNegativeQuantityCheck } from './common';
import { users } from './users';
import { vendors } from './vendors';
import { materials } from './materials';

export const purchaseOrders = pgTable('purchase_orders', {
  id: uuid('id').defaultRandom().primaryKey(),
  vendorId: uuid('vendor_id')
    .notNull()
    .references(() => vendors.id),
  status: purchaseOrderStatusEnum('status').notNull().default('pending'),
  totalAmount: numeric('total_amount').notNull(),
  notes: text('notes'),
  createdBy: uuid('created_by')
    .notNull()
    .references(() => users.id),
  createdAt,
});

export const purchaseOrderItems = pgTable(
  'purchase_order_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    purchaseOrderId: uuid('purchase_order_id')
      .notNull()
      .references(() => purchaseOrders.id),
    materialCode: text('material_code')
      .notNull()
      .references(() => materials.code),
    quantityOrdered: numeric('quantity_ordered').notNull(),
    unitCost: numeric('unit_cost').notNull(),
  },
  (table) => [nonNegativeQuantityCheck('purchase_order_items_quantity_ordered_non_negative', table.quantityOrdered)],
);

export const purchaseReceipts = pgTable('purchase_receipts', {
  id: uuid('id').defaultRandom().primaryKey(),
  purchaseOrderId: uuid('purchase_order_id')
    .notNull()
    .references(() => purchaseOrders.id),
  status: purchaseReceiptStatusEnum('status').notNull().default('pending'),
  receivedAt: timestamp('received_at', { withTimezone: true }),
  receivedBy: uuid('received_by').references(() => users.id),
  notes: text('notes'),
  createdAt,
  createdBy: uuid('created_by')
    .notNull()
    .references(() => users.id),
});

export const purchaseReceiptItems = pgTable(
  'purchase_receipt_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    purchaseReceiptId: uuid('purchase_receipt_id')
      .notNull()
      .references(() => purchaseReceipts.id),
    purchaseOrderItemId: uuid('purchase_order_item_id')
      .notNull()
      .references(() => purchaseOrderItems.id),
    quantityReceived: numeric('quantity_received').notNull(),
    quantityRejected: numeric('quantity_rejected').notNull().default(0),
    inspectionNotes: text('inspection_notes'),
  },
  (table) => [
    nonNegativeQuantityCheck('purchase_receipt_items_quantity_received_non_negative', table.quantityReceived),
    nonNegativeQuantityCheck('purchase_receipt_items_quantity_rejected_non_negative', table.quantityRejected),
  ],
);

export const purchaseOrdersRelations = relations(purchaseOrders, ({ one, many }) => ({
  vendor: one(vendors, {
    fields: [purchaseOrders.vendorId],
    references: [vendors.id],
  }),
  createdBy: one(users, {
    fields: [purchaseOrders.createdBy],
    references: [users.id],
    relationName: 'purchaseOrderCreatedBy',
  }),
  items: many(purchaseOrderItems),
  receipts: many(purchaseReceipts),
}));

export const purchaseOrderItemsRelations = relations(purchaseOrderItems, ({ one, many }) => ({
  purchaseOrder: one(purchaseOrders, {
    fields: [purchaseOrderItems.purchaseOrderId],
    references: [purchaseOrders.id],
  }),
  material: one(materials, {
    fields: [purchaseOrderItems.materialCode],
    references: [materials.code],
  }),
  receiptItems: many(purchaseReceiptItems),
}));

export const purchaseReceiptsRelations = relations(purchaseReceipts, ({ one, many }) => ({
  purchaseOrder: one(purchaseOrders, {
    fields: [purchaseReceipts.purchaseOrderId],
    references: [purchaseOrders.id],
  }),
  receivedBy: one(users, {
    fields: [purchaseReceipts.receivedBy],
    references: [users.id],
    relationName: 'purchaseReceiptReceivedBy',
  }),
  createdBy: one(users, {
    fields: [purchaseReceipts.createdBy],
    references: [users.id],
    relationName: 'purchaseReceiptCreatedBy',
  }),
  items: many(purchaseReceiptItems),
}));

export const purchaseReceiptItemsRelations = relations(purchaseReceiptItems, ({ one }) => ({
  purchaseReceipt: one(purchaseReceipts, {
    fields: [purchaseReceiptItems.purchaseReceiptId],
    references: [purchaseReceipts.id],
  }),
  purchaseOrderItem: one(purchaseOrderItems, {
    fields: [purchaseReceiptItems.purchaseOrderItemId],
    references: [purchaseOrderItems.id],
  }),
}));
