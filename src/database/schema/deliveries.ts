import { relations } from 'drizzle-orm';
import { pgTable, uuid, text, timestamp, index } from 'drizzle-orm/pg-core';
import { createdAt } from './common';
import { orders } from './orders';
import { users } from './users';
import { productUnits } from './product-units';

export const deliveries = pgTable(
  'deliveries',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    code: text('code').unique().notNull(), // Format: DEL-0000001
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id),
    // Status can be deduced from these dates
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    assignedTo: uuid('assigned_to').references(() => users.id),
    notes: text('notes'),
    createdAt,
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
  },
  (table) => [
    index('deliveries_code_idx').on(table.code),
    index('deliveries_order_id_idx').on(table.orderId),
    index('deliveries_assigned_to_idx').on(table.assignedTo),
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
    productUnitId: uuid('product_unit_id')
      .notNull()
      .unique()
      .references(() => productUnits.id),
    notes: text('notes'),
  },
  (table) => [index('delivery_items_delivery_id_idx').on(table.deliveryId)],
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
    relationName: 'deliveryCreatedBy',
  }),
  assignedTo: one(users, {
    fields: [deliveries.assignedTo],
    references: [users.id],
    relationName: 'deliveryAssignedTo',
  }),
  items: many(deliveryItems),
}));

export const deliveryItemsRelations = relations(deliveryItems, ({ one }) => ({
  delivery: one(deliveries, {
    fields: [deliveryItems.deliveryId],
    references: [deliveries.id],
  }),
  productUnit: one(productUnits, {
    fields: [deliveryItems.productUnitId],
    references: [productUnits.id],
  }),
}));
