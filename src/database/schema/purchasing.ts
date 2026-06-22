import { relations, sql } from 'drizzle-orm';
import { pgTable, uuid, text, timestamp, index, foreignKey, check } from 'drizzle-orm/pg-core';
import { createdAt, numeric, nonNegativeQuantityCheck } from './common';
import { users } from './users';
import { vendors } from './vendors';
import { materials } from './materials';
import { products } from './products';
import { boms } from './boms';
import { orderItems } from './orders';

export const purchaseOrders = pgTable(
  'purchase_orders',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    vendorId: uuid('vendor_id')
      .notNull()
      .references(() => vendors.id),
    totalAmount: numeric('total_amount').notNull(),
    // Purchase order status can be deduced from these dates:
    completedAt: timestamp('completed_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    notes: text('notes'),
    createdAt,
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
  },
  (table) => [
    index('purchase_orders_vendor_id_idx').on(table.vendorId),
    index('purchase_orders_completed_at_idx').on(table.completedAt),
    index('purchase_orders_cancelled_at_idx').on(table.cancelledAt),
    index('purchase_orders_created_by_idx').on(table.createdBy),
    index('purchase_orders_created_at_idx').on(table.createdAt),
  ],
);

export const purchaseOrderItems = pgTable(
  'purchase_order_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    purchaseOrderId: uuid('purchase_order_id')
      .notNull()
      .references(() => purchaseOrders.id),
    materialCode: text('material_code').references(() => materials.code),
    productCode: text('product_code').references(() => products.code),
    bomId: uuid('bom_id').references(() => boms.id),
    orderItemId: uuid('order_item_id').references(() => orderItems.id),
    quantityOrdered: numeric('quantity_ordered').notNull(),
    unitCost: numeric('unit_cost').notNull(),
    notes: text('notes'),
  },
  (table) => [
    index('purchase_order_items_purchase_order_id_idx').on(table.purchaseOrderId),
    index('purchase_order_items_material_code_idx').on(table.materialCode),
    index('purchase_order_items_product_code_idx').on(table.productCode),
    index('purchase_order_items_bom_id_idx').on(table.bomId),
    index('purchase_order_items_order_item_id_idx').on(table.orderItemId),
    nonNegativeQuantityCheck('purchase_order_items_quantity_ordered_non_negative', table.quantityOrdered),
    check(
      'purchase_order_items_material_or_product_xor',
      sql`(
        (${table.materialCode} IS NOT NULL AND ${table.productCode} IS NULL)
        OR
        (${table.materialCode} IS NULL AND ${table.productCode} IS NOT NULL)
      )`,
    ),
    check('purchase_order_items_bom_material_check', sql`(${table.bomId} IS NULL OR ${table.materialCode} IS NOT NULL)`),
    check(
      'purchase_order_items_order_item_product_check',
      sql`(${table.orderItemId} IS NULL OR ${table.productCode} IS NOT NULL)`,
    ),
  ],
);

export const purchaseReceipts = pgTable(
  'purchase_receipts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    purchaseOrderId: uuid('purchase_order_id')
      .notNull()
      .references(() => purchaseOrders.id),
    // Purchase receipt status can be deduced from these dates:
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    receivedAt: timestamp('received_at', { withTimezone: true }),
    receivedBy: uuid('received_by').references(() => users.id),
    notes: text('notes'),
    createdAt,
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
  },
  (table) => [
    index('purchase_receipts_purchase_order_id_idx').on(table.purchaseOrderId),
    index('purchase_receipts_received_at_idx').on(table.receivedAt),
    index('purchase_receipts_cancelled_at_idx').on(table.cancelledAt),
    index('purchase_receipts_received_by_idx').on(table.receivedBy),
    index('purchase_receipts_created_by_idx').on(table.createdBy),
    index('purchase_receipts_created_at_idx').on(table.createdAt),
  ],
);

export const purchaseReceiptItems = pgTable(
  'purchase_receipt_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    purchaseReceiptId: uuid('purchase_receipt_id').notNull(),
    purchaseOrderItemId: uuid('purchase_order_item_id').notNull(),
    quantityReceived: numeric('quantity_received').notNull(),
    quantityRejected: numeric('quantity_rejected').notNull().default(0),
    inspectionNotes: text('inspection_notes'),
  },
  (table) => [
    foreignKey({
      name: 'pr_items_receipt_id_fk',
      columns: [table.purchaseReceiptId],
      foreignColumns: [purchaseReceipts.id],
    }),
    foreignKey({
      name: 'pr_items_po_item_id_fk',
      columns: [table.purchaseOrderItemId],
      foreignColumns: [purchaseOrderItems.id],
    }),
    index('purchase_receipt_items_purchase_receipt_id_idx').on(table.purchaseReceiptId),
    index('purchase_receipt_items_purchase_order_item_id_idx').on(table.purchaseOrderItemId),
    nonNegativeQuantityCheck('purchase_receipt_items_quantity_received_non_negative', table.quantityReceived),
    nonNegativeQuantityCheck('purchase_receipt_items_quantity_rejected_non_negative', table.quantityRejected),
  ],
);

// ============================== RELATIONS ==============================

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
  product: one(products, {
    fields: [purchaseOrderItems.productCode],
    references: [products.code],
  }),
  bom: one(boms, {
    fields: [purchaseOrderItems.bomId],
    references: [boms.id],
  }),
  orderItem: one(orderItems, {
    fields: [purchaseOrderItems.orderItemId],
    references: [orderItems.id],
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
