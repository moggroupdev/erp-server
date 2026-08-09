import { relations, sql } from 'drizzle-orm';
import { pgTable, uuid, text, timestamp, index, foreignKey, check, unique } from 'drizzle-orm/pg-core';
import { createdAt, numeric, nonNegativeQuantityCheck, positiveQuantityCheck } from './common';
import { users } from './users';
import { suppliers } from './suppliers';
import { materials } from './materials';
import { inventoryTransactions } from './inventory-transactions';

export const outsourcingOrders = pgTable(
  'outsourcing_orders',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    code: text('code').unique().notNull(), // Format: OSO-00000001
    supplierId: uuid('supplier_id')
      .notNull()
      .references(() => suppliers.id),
    totalAmount: numeric('total_amount').notNull(), // @CACHING_APP_SYNCED - SUM(quantity_ordered * unit_manufacturing_cost) from outsourcing_order_items
    completedAt: timestamp('completed_at', { withTimezone: true }), // @CACHING_APP_SYNCED - Set when all order lines are fully received across all receipts
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    notes: text('notes'),
    createdAt,
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
  },
  (table) => [
    index('oso_supplier_id_idx').on(table.supplierId),
    index('oso_completed_at_idx').on(table.completedAt),
    index('oso_cancelled_at_idx').on(table.cancelledAt),
    index('oso_created_at_idx').on(table.createdAt),
    index('oso_created_by_idx').on(table.createdBy),
    check('oso_completed_cancelled_exclusive', sql`${table.completedAt} IS NULL OR ${table.cancelledAt} IS NULL`),
    nonNegativeQuantityCheck('oso_total_amount_non_negative', table.totalAmount),
  ],
);

export const outsourcingOrderItems = pgTable(
  'outsourcing_order_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    outsourcingOrderId: uuid('outsourcing_order_id').notNull(),
    manufacturedMaterialCode: text('manufactured_material_code')
      .notNull()
      .references(() => materials.code), // @APP_CHECKED - materials.code with material_type = 'manufactured_material'
    quantityOrdered: numeric('quantity_ordered').notNull(),
    unitManufacturingCost: numeric('unit_manufacturing_cost').notNull(),
    notes: text('notes'),
  },
  (table) => [
    foreignKey({
      name: 'osoi_oso_id_fk',
      columns: [table.outsourcingOrderId],
      foreignColumns: [outsourcingOrders.id],
    }),
    index('osoi_oso_id_idx').on(table.outsourcingOrderId),
    index('osoi_manufactured_material_code_idx').on(table.manufacturedMaterialCode),
    unique('osoi_oso_manufactured_material_unique').on(table.outsourcingOrderId, table.manufacturedMaterialCode),
    positiveQuantityCheck('osoi_quantity_ordered_positive', table.quantityOrdered),
    positiveQuantityCheck('osoi_unit_manufacturing_cost_positive', table.unitManufacturingCost),
  ],
);

export const outsourcingReceipts = pgTable(
  'outsourcing_receipts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    code: text('code').unique().notNull(), // Format: OSR-00000001
    outsourcingOrderId: uuid('outsourcing_order_id').notNull(),
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
      name: 'osr_oso_id_fk',
      columns: [table.outsourcingOrderId],
      foreignColumns: [outsourcingOrders.id],
    }),
    index('osr_oso_id_idx').on(table.outsourcingOrderId),
    index('osr_received_at_idx').on(table.receivedAt),
    index('osr_received_by_idx').on(table.receivedBy),
    index('osr_created_by_idx').on(table.createdBy),
    index('osr_created_at_idx').on(table.createdAt),
  ],
);

export const outsourcingReceiptItems = pgTable(
  'outsourcing_receipt_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    outsourcingReceiptId: uuid('outsourcing_receipt_id').notNull(),
    outsourcingOrderItemId: uuid('outsourcing_order_item_id').notNull(),
    quantityReceived: numeric('quantity_received').notNull(),
    quantityRejected: numeric('quantity_rejected').notNull().default(0),
    inspectionNotes: text('inspection_notes'),
  },
  (table) => [
    foreignKey({
      name: 'osri_receipt_id_fk',
      columns: [table.outsourcingReceiptId],
      foreignColumns: [outsourcingReceipts.id],
    }),
    foreignKey({
      name: 'osri_osoi_id_fk',
      columns: [table.outsourcingOrderItemId],
      foreignColumns: [outsourcingOrderItems.id],
    }),
    index('osri_receipt_id_idx').on(table.outsourcingReceiptId),
    index('osri_osoi_id_idx').on(table.outsourcingOrderItemId),
    unique('osri_receipt_osoi_unique').on(table.outsourcingReceiptId, table.outsourcingOrderItemId),
    nonNegativeQuantityCheck('osri_quantity_received_non_negative', table.quantityReceived),
    nonNegativeQuantityCheck('osri_quantity_rejected_non_negative', table.quantityRejected),
  ],
);

// ============================== RELATIONS ==============================

export const outsourcingOrdersRelations = relations(outsourcingOrders, ({ one, many }) => ({
  supplier: one(suppliers, {
    fields: [outsourcingOrders.supplierId],
    references: [suppliers.id],
  }),
  createdBy: one(users, {
    fields: [outsourcingOrders.createdBy],
    references: [users.id],
    relationName: 'outsourcingOrderCreatedBy',
  }),
  items: many(outsourcingOrderItems),
  receipts: many(outsourcingReceipts),
  materialIssueTransactions: many(inventoryTransactions),
}));

export const outsourcingOrderItemsRelations = relations(outsourcingOrderItems, ({ one, many }) => ({
  outsourcingOrder: one(outsourcingOrders, {
    fields: [outsourcingOrderItems.outsourcingOrderId],
    references: [outsourcingOrders.id],
  }),
  manufacturedMaterial: one(materials, {
    fields: [outsourcingOrderItems.manufacturedMaterialCode],
    references: [materials.code],
  }),
  receiptItems: many(outsourcingReceiptItems),
}));

export const outsourcingReceiptsRelations = relations(outsourcingReceipts, ({ one, many }) => ({
  outsourcingOrder: one(outsourcingOrders, {
    fields: [outsourcingReceipts.outsourcingOrderId],
    references: [outsourcingOrders.id],
  }),
  receivedBy: one(users, {
    fields: [outsourcingReceipts.receivedBy],
    references: [users.id],
    relationName: 'outsourcingReceiptReceivedBy',
  }),
  createdBy: one(users, {
    fields: [outsourcingReceipts.createdBy],
    references: [users.id],
    relationName: 'outsourcingReceiptCreatedBy',
  }),
  items: many(outsourcingReceiptItems),
  inventoryTransactions: many(inventoryTransactions),
}));

export const outsourcingReceiptItemsRelations = relations(outsourcingReceiptItems, ({ one }) => ({
  outsourcingReceipt: one(outsourcingReceipts, {
    fields: [outsourcingReceiptItems.outsourcingReceiptId],
    references: [outsourcingReceipts.id],
  }),
  outsourcingOrderItem: one(outsourcingOrderItems, {
    fields: [outsourcingReceiptItems.outsourcingOrderItemId],
    references: [outsourcingOrderItems.id],
  }),
}));
