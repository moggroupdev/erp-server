import { pgTable, uuid, text, timestamp, integer } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { createdAt, deliveryStatusEnum } from './common';
import { users } from './users';
import { orders, orderItems } from './orders';
import { customerAddresses } from './customers';

export const deliveries = pgTable('deliveries', {
  id: uuid('id').defaultRandom().primaryKey(),
  orderId: uuid('order_id')
    .notNull()
    .references(() => orders.id),
  addressId: uuid('address_id')
    .notNull()
    .references(() => customerAddresses.id),
  status: deliveryStatusEnum('status').notNull().default('pending'),
  scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
  deliveredAt: timestamp('delivered_at', { withTimezone: true }),
  notes: text('notes'),
  createdBy: uuid('created_by')
    .notNull()
    .references(() => users.id),
  createdAt,
});

export const deliveryItems = pgTable('delivery_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  deliveryId: uuid('delivery_id')
    .notNull()
    .references(() => deliveries.id),
  orderItemId: uuid('order_item_id')
    .notNull()
    .references(() => orderItems.id),
  quantity: integer('quantity').notNull(),
  notes: text('notes'),
});

export const deliveriesRelations = relations(deliveries, ({ one, many }) => ({
  order: one(orders, {
    fields: [deliveries.orderId],
    references: [orders.id],
  }),
  address: one(customerAddresses, {
    fields: [deliveries.addressId],
    references: [customerAddresses.id],
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
