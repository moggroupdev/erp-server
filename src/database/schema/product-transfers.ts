import { pgTable, uuid, text, integer, index, foreignKey } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { createdAt, positiveQuantityCheck } from './common';
import { users } from './users';
import { orderItems } from './orders';
import { productionPlanItems } from './production-plans';

export const productTransfers = pgTable(
  'product_transfers',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    code: text('code').unique().notNull(), // Format: PT-000001
    notes: text('notes'),
    createdAt,
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
  },
  (table) => [
    index('product_transfers_code_idx').on(table.code),
    index('product_transfers_created_at_idx').on(table.createdAt),
    index('product_transfers_created_by_idx').on(table.createdBy),
  ],
);

export const productTransferItems = pgTable(
  'product_transfer_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    transferId: uuid('transfer_id').notNull(),
    // The production plan item that originally produced these units. Its orderItemId is implicitly the "from" order item — no need to store it twice.
    productionPlanItemId: uuid('production_plan_item_id').notNull(),
    // The order item receiving the produced units (urgent order)
    toOrderItemId: uuid('to_order_item_id').notNull(),
    quantity: integer('quantity').notNull(),
    notes: text('notes'),
  },
  (table) => [
    foreignKey({
      name: 'prod_transfer_items_transfer_id_fk',
      columns: [table.transferId],
      foreignColumns: [productTransfers.id],
    }),
    foreignKey({
      name: 'prod_transfer_items_pp_item_id_fk',
      columns: [table.productionPlanItemId],
      foreignColumns: [productionPlanItems.id],
    }),
    foreignKey({
      name: 'prod_transfer_items_to_order_item_id_fk',
      columns: [table.toOrderItemId],
      foreignColumns: [orderItems.id],
    }),
    index('product_transfer_items_transfer_id_idx').on(table.transferId),
    index('product_transfer_items_pp_item_id_idx').on(table.productionPlanItemId),
    index('product_transfer_items_to_order_item_id_idx').on(table.toOrderItemId),
    positiveQuantityCheck('product_transfer_items_quantity_positive', table.quantity),
  ],
);

// ============================== RELATIONS ==============================

export const productTransfersRelations = relations(productTransfers, ({ one, many }) => ({
  createdBy: one(users, {
    fields: [productTransfers.createdBy],
    references: [users.id],
    relationName: 'productTransferCreatedBy',
  }),
  items: many(productTransferItems),
}));

export const productTransferItemsRelations = relations(productTransferItems, ({ one }) => ({
  transfer: one(productTransfers, {
    fields: [productTransferItems.transferId],
    references: [productTransfers.id],
  }),
  productionPlanItem: one(productionPlanItems, {
    fields: [productTransferItems.productionPlanItemId],
    references: [productionPlanItems.id],
    relationName: 'productTransferItemPlanItem',
  }),
  toOrderItem: one(orderItems, {
    fields: [productTransferItems.toOrderItemId],
    references: [orderItems.id],
    relationName: 'productTransferItemToOrderItem',
  }),
}));
