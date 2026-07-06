import { relations, sql } from 'drizzle-orm';
import { pgTable, uuid, text, timestamp, index, foreignKey, check, unique } from 'drizzle-orm/pg-core';
import {
  createdAt,
  numeric,
  nonNegativeQuantityCheck,
  positiveQuantityCheck,
  positiveNullableQuantityCheck,
} from './common';
import { users } from './users';
import { vendors } from './vendors';
import { materials } from './materials';
import { contractItems } from './contracts';
import { inventoryTransactionItems } from './inventory-transactions';

export const materialPurchaseOrders = pgTable(
  'material_purchase_orders',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    code: text('code').unique().notNull(), // Format: MPO-00000001
    vendorId: uuid('vendor_id')
      .notNull()
      .references(() => vendors.id),
    totalAmount: numeric('total_amount').notNull(), // app-synced — SUM(quantity_ordered * unit_cost) from material_purchase_order_items
    completedAt: timestamp('completed_at', { withTimezone: true }), // app-synced — set when all order lines are fully received (received + rejected = ordered) across all receipts
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    notes: text('notes'),
    createdAt,
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
  },
  (table) => [
    index('mpo_vendor_id_idx').on(table.vendorId),
    index('mpo_completed_at_idx').on(table.completedAt),
    index('mpo_cancelled_at_idx').on(table.cancelledAt),
    index('mpo_created_at_idx').on(table.createdAt),
    index('mpo_created_by_idx').on(table.createdBy),
    check('mpo_completed_cancelled_exclusive', sql`${table.completedAt} IS NULL OR ${table.cancelledAt} IS NULL`),
    nonNegativeQuantityCheck('mpo_total_amount_non_negative', table.totalAmount),
  ],
);

export const materialPurchaseOrderItems = pgTable(
  'material_purchase_order_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    materialPurchaseOrderId: uuid('material_purchase_order_id').notNull(),
    materialCode: text('material_code')
      .notNull()
      .references(() => materials.code),
    quantityOrdered: numeric('quantity_ordered').notNull(),
    unitCost: numeric('unit_cost').notNull(),
    notes: text('notes'),
  },
  (table) => [
    foreignKey({
      name: 'mpoi_mpo_id_fk',
      columns: [table.materialPurchaseOrderId],
      foreignColumns: [materialPurchaseOrders.id],
    }),
    index('mpoi_mpo_id_idx').on(table.materialPurchaseOrderId),
    index('mpoi_material_code_idx').on(table.materialCode),
    unique('mpoi_mpo_material_unique').on(table.materialPurchaseOrderId, table.materialCode),
    positiveQuantityCheck('mpoi_quantity_ordered_positive', table.quantityOrdered),
    positiveQuantityCheck('mpoi_unit_cost_positive', table.unitCost),
  ],
);

export const materialPurchaseOrderItemContractItems = pgTable(
  'material_purchase_order_item_contract_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    materialPurchaseOrderItemId: uuid('material_purchase_order_item_id').notNull(),
    contractItemId: uuid('contract_item_id').notNull(),
    quantityAllocated: numeric('quantity_allocated'), // Optional — informational only, not validated against quantity_ordered
  },
  (table) => [
    foreignKey({
      name: 'mpoici_mpoi_id_fk',
      columns: [table.materialPurchaseOrderItemId],
      foreignColumns: [materialPurchaseOrderItems.id],
    }),
    foreignKey({
      name: 'mpoici_contract_item_id_fk',
      columns: [table.contractItemId],
      foreignColumns: [contractItems.id],
    }),
    index('mpoici_mpoi_id_idx').on(table.materialPurchaseOrderItemId),
    index('mpoici_contract_item_id_idx').on(table.contractItemId),
    unique('mpoici_mpoi_contract_item_unique').on(table.materialPurchaseOrderItemId, table.contractItemId),
    positiveNullableQuantityCheck('mpoici_quantity_allocated_positive', table.quantityAllocated),
  ],
);

export const materialPurchaseReceipts = pgTable(
  'material_purchase_receipts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    code: text('code').unique().notNull(), // Format: MPR-00000001
    materialPurchaseOrderId: uuid('material_purchase_order_id').notNull(),
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
      name: 'mpr_mpo_id_fk',
      columns: [table.materialPurchaseOrderId],
      foreignColumns: [materialPurchaseOrders.id],
    }),
    index('mpr_mpo_id_idx').on(table.materialPurchaseOrderId),
    index('mpr_received_at_idx').on(table.receivedAt),
    index('mpr_received_by_idx').on(table.receivedBy),
    index('mpr_created_by_idx').on(table.createdBy),
    index('mpr_created_at_idx').on(table.createdAt),
  ],
);

export const materialPurchaseReceiptItems = pgTable(
  'material_purchase_receipt_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    materialPurchaseReceiptId: uuid('material_purchase_receipt_id').notNull(),
    materialPurchaseOrderItemId: uuid('material_purchase_order_item_id').notNull(),
    quantityReceived: numeric('quantity_received').notNull(),
    quantityRejected: numeric('quantity_rejected').notNull().default(0),
    inspectionNotes: text('inspection_notes'),
  },
  (table) => [
    foreignKey({
      name: 'mpri_receipt_id_fk',
      columns: [table.materialPurchaseReceiptId],
      foreignColumns: [materialPurchaseReceipts.id],
    }),
    foreignKey({
      name: 'mpri_mpoi_id_fk',
      columns: [table.materialPurchaseOrderItemId],
      foreignColumns: [materialPurchaseOrderItems.id],
    }),
    index('mpri_receipt_id_idx').on(table.materialPurchaseReceiptId),
    index('mpri_mpoi_id_idx').on(table.materialPurchaseOrderItemId),
    unique('mpri_receipt_mpoi_unique').on(table.materialPurchaseReceiptId, table.materialPurchaseOrderItemId),
    nonNegativeQuantityCheck('mpri_quantity_received_non_negative', table.quantityReceived),
    nonNegativeQuantityCheck('mpri_quantity_rejected_non_negative', table.quantityRejected),
  ],
);

// ============================== RELATIONS ==============================

export const materialPurchaseOrdersRelations = relations(materialPurchaseOrders, ({ one, many }) => ({
  vendor: one(vendors, {
    fields: [materialPurchaseOrders.vendorId],
    references: [vendors.id],
  }),
  createdBy: one(users, {
    fields: [materialPurchaseOrders.createdBy],
    references: [users.id],
    relationName: 'materialPurchaseOrderCreatedBy',
  }),
  items: many(materialPurchaseOrderItems),
  receipts: many(materialPurchaseReceipts),
}));

export const materialPurchaseOrderItemsRelations = relations(materialPurchaseOrderItems, ({ one, many }) => ({
  materialPurchaseOrder: one(materialPurchaseOrders, {
    fields: [materialPurchaseOrderItems.materialPurchaseOrderId],
    references: [materialPurchaseOrders.id],
  }),
  material: one(materials, {
    fields: [materialPurchaseOrderItems.materialCode],
    references: [materials.code],
  }),
  contractItemAllocations: many(materialPurchaseOrderItemContractItems),
  receiptItems: many(materialPurchaseReceiptItems),
}));

export const materialPurchaseOrderItemContractItemsRelations = relations(
  materialPurchaseOrderItemContractItems,
  ({ one }) => ({
    materialPurchaseOrderItem: one(materialPurchaseOrderItems, {
      fields: [materialPurchaseOrderItemContractItems.materialPurchaseOrderItemId],
      references: [materialPurchaseOrderItems.id],
    }),
    contractItem: one(contractItems, {
      fields: [materialPurchaseOrderItemContractItems.contractItemId],
      references: [contractItems.id],
    }),
  }),
);

export const materialPurchaseReceiptsRelations = relations(materialPurchaseReceipts, ({ one, many }) => ({
  materialPurchaseOrder: one(materialPurchaseOrders, {
    fields: [materialPurchaseReceipts.materialPurchaseOrderId],
    references: [materialPurchaseOrders.id],
  }),
  receivedBy: one(users, {
    fields: [materialPurchaseReceipts.receivedBy],
    references: [users.id],
    relationName: 'materialPurchaseReceiptReceivedBy',
  }),
  createdBy: one(users, {
    fields: [materialPurchaseReceipts.createdBy],
    references: [users.id],
    relationName: 'materialPurchaseReceiptCreatedBy',
  }),
  items: many(materialPurchaseReceiptItems),
}));

export const materialPurchaseReceiptItemsRelations = relations(materialPurchaseReceiptItems, ({ one, many }) => ({
  materialPurchaseReceipt: one(materialPurchaseReceipts, {
    fields: [materialPurchaseReceiptItems.materialPurchaseReceiptId],
    references: [materialPurchaseReceipts.id],
  }),
  materialPurchaseOrderItem: one(materialPurchaseOrderItems, {
    fields: [materialPurchaseReceiptItems.materialPurchaseOrderItemId],
    references: [materialPurchaseOrderItems.id],
  }),
  inventoryTransactionItems: many(inventoryTransactionItems),
}));
