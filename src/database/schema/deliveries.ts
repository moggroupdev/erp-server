import { relations } from 'drizzle-orm';
import { pgTable, uuid, text, timestamp, integer, index } from 'drizzle-orm/pg-core';
import { createdAt, positiveQuantityCheck } from './common';
import { orders, orderItems } from './orders';
import { users } from './users';

export const deliveries = pgTable(
  'deliveries',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    code: text('code').unique().notNull(), // Format: DE-000001
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    notes: text('notes'),
    createdAt,
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
  },
  (table) => [
    index('deliveries_code_idx').on(table.code),
    index('deliveries_order_id_idx').on(table.orderId),
    index('deliveries_scheduled_at_idx').on(table.scheduledAt),
    index('deliveries_delivered_at_idx').on(table.deliveredAt),
    index('deliveries_cancelled_at_idx').on(table.cancelledAt),
  ],
);

export const deliveryItems = pgTable(
  'delivery_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    deliveryId: uuid('delivery_id')
      .notNull()
      .references(() => deliveries.id),
    orderItemId: uuid('order_item_id')
      .notNull()
      .references(() => orderItems.id),
    quantity: integer('quantity').notNull(),
    notes: text('notes'),
  },
  (table) => [
    index('delivery_items_delivery_id_idx').on(table.deliveryId),
    index('delivery_items_order_item_id_idx').on(table.orderItemId),
    positiveQuantityCheck('delivery_items_quantity_positive', table.quantity),
  ],
);

// ============================== RELATIONS ==============================

export const deliveriesRelations = relations(deliveries, ({ one, many }) => ({
  order: one(orders, {
    fields: [deliveries.orderId],
    references: [orders.id],
  }),
  createdBy: one(users, {
    fields: [deliveries.createdBy],
    references: [users.id],
  }),
  items: many(deliveryItems),
}));

export const deliveryItemsRelations = relations(deliveryItems, ({ one }) => ({
  delivery: one(deliveries, {
    fields: [deliveryItems.deliveryId],
    references: [deliveries.id],
  }),
  orderItem: one(orderItems, {
    fields: [deliveryItems.orderItemId],
    references: [orderItems.id],
  }),
}));
