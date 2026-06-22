import { relations } from 'drizzle-orm';
import { pgTable, uuid, text, timestamp, integer, index } from 'drizzle-orm/pg-core';
import { createdAt, nonNegativeQuantityCheck } from './common';
import { orders, orderItems } from './orders';
import { users } from './users';

export const installations = pgTable(
  'installations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
    installedAt: timestamp('installed_at', { withTimezone: true }),
    assignedTo: uuid('assigned_to')
      .references(() => users.id),
    notes: text('notes'),
    createdAt,
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
  },
  (table) => [
    index('installations_order_id_idx').on(table.orderId),
    index('installations_assigned_to_idx').on(table.assignedTo),
    index('installations_scheduled_at_idx').on(table.scheduledAt),
    index('installations_installed_at_idx').on(table.installedAt),
    index('installations_created_by_idx').on(table.createdBy),
  ]
);

export const installationItems = pgTable(
  'installation_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    installationId: uuid('installation_id')
      .notNull()
      .references(() => installations.id),
    orderItemId: uuid('order_item_id')
      .notNull()
      .references(() => orderItems.id),
    quantity: integer('quantity').notNull(),
    notes: text('notes'),
  },
  (table) => [
    index('installation_items_installation_id_idx').on(table.installationId),
    index('installation_items_order_item_id_idx').on(table.orderItemId),
    nonNegativeQuantityCheck('installation_items_quantity_non_negative', table.quantity),
  ],
);

// ============================== RELATIONS ==============================

export const installationsRelations = relations(installations, ({ one, many }) => ({
  order: one(orders, {
    fields: [installations.orderId],
    references: [orders.id],
  }),
  createdBy: one(users, {
    fields: [installations.createdBy],
    references: [users.id],
    relationName: 'installationCreatedBy',
  }),
  assignedTo: one(users, {
    fields: [installations.assignedTo],
    references: [users.id],
    relationName: 'installationAssignedTo',
  }),
  items: many(installationItems),
}));

export const installationItemsRelations = relations(installationItems, ({ one }) => ({
  installation: one(installations, {
    fields: [installationItems.installationId],
    references: [installations.id],
  }),
  orderItem: one(orderItems, {
    fields: [installationItems.orderItemId],
    references: [orderItems.id],
  }),
}));
