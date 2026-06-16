import { pgTable, uuid, text, timestamp } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { createdAt, numeric, purchaseOrderStatusEnum, nonNegativeQuantityCheck } from './common';
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
  receivedAt: timestamp('received_at', { withTimezone: true }),
  receivedBy: uuid('received_by').references(() => users.id),
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
    quantityReceived: numeric('quantity_received').notNull().default(0),
    quantityRejected: numeric('quantity_rejected').notNull().default(0),
    inspectionNotes: text('inspection_notes'),
  },
  (table) => [
    nonNegativeQuantityCheck('purchase_order_items_quantity_ordered_non_negative', table.quantityOrdered),
    nonNegativeQuantityCheck('purchase_order_items_quantity_received_non_negative', table.quantityReceived),
    nonNegativeQuantityCheck('purchase_order_items_quantity_rejected_non_negative', table.quantityRejected),
  ],
);

export const purchaseOrdersRelations = relations(purchaseOrders, ({ one, many }) => ({
  vendor: one(vendors, {
    fields: [purchaseOrders.vendorId],
    references: [vendors.id],
  }),
  receivedBy: one(users, {
    fields: [purchaseOrders.receivedBy],
    references: [users.id],
    relationName: 'purchaseOrderReceivedBy',
  }),
  createdBy: one(users, {
    fields: [purchaseOrders.createdBy],
    references: [users.id],
    relationName: 'purchaseOrderCreatedBy',
  }),
  items: many(purchaseOrderItems),
}));

export const purchaseOrderItemsRelations = relations(purchaseOrderItems, ({ one }) => ({
  purchaseOrder: one(purchaseOrders, {
    fields: [purchaseOrderItems.purchaseOrderId],
    references: [purchaseOrders.id],
  }),
  material: one(materials, {
    fields: [purchaseOrderItems.materialCode],
    references: [materials.code],
  }),
}));
