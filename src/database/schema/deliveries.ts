import { pgTable, uuid, text, timestamp, integer, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { createdAt, deliveryStatusEnum, nonNegativeQuantityCheck } from './common';
import { users } from './users';
import { orders, orderItems } from './orders';

export const deliveries = pgTable(
  'deliveries',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id),
    status: deliveryStatusEnum('status').notNull().default('pending'),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    notes: text('notes'),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
    createdAt,
  },
  (table) => [
    index('deliveries_order_id_idx').on(table.orderId),
    index('deliveries_created_by_idx').on(table.createdBy),
    index('deliveries_status_idx').on(table.status),
    index('deliveries_created_at_idx').on(table.createdAt),
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
    nonNegativeQuantityCheck('delivery_items_quantity_non_negative', table.quantity),
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
