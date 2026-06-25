import { relations } from 'drizzle-orm';
import { pgTable, uuid, text, timestamp, index } from 'drizzle-orm/pg-core';
import { createdAt } from './common';
import { orders } from './orders';
import { users } from './users';
import { productUnits } from './product-units';

export const installations = pgTable(
  'installations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    code: text('code').unique().notNull(), // Format: IN-000001
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id),
    // Status can be deduced from these dates
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
    installedAt: timestamp('installed_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    assignedTo: uuid('assigned_to').references(() => users.id),
    notes: text('notes'),
    createdAt,
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
  },
  (table) => [
    index('installations_code_idx').on(table.code),
    index('installations_order_id_idx').on(table.orderId),
    index('installations_assigned_to_idx').on(table.assignedTo),
    index('installations_scheduled_at_idx').on(table.scheduledAt),
    index('installations_installed_at_idx').on(table.installedAt),
    index('installations_cancelled_at_idx').on(table.cancelledAt),
  ],
);

export const installationItems = pgTable(
  'installation_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    installationId: uuid('installation_id')
      .notNull()
      .references(() => installations.id),
    productUnitId: uuid('product_unit_id')
      .notNull()
      .unique()
      .references(() => productUnits.id),
    notes: text('notes'),
  },
  (table) => [
    index('installation_items_installation_id_idx').on(table.installationId),
    index('installation_items_product_unit_id_unique').on(table.productUnitId),
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
  productUnit: one(productUnits, {
    fields: [installationItems.productUnitId],
    references: [productUnits.id],
  }),
}));
