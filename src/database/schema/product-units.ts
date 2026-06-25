import { relations } from 'drizzle-orm';
import { pgTable, uuid, text, timestamp, index } from 'drizzle-orm/pg-core';
import { createdAt } from './common';
import { users } from './users';
import { orderItems } from './orders';
import { productionPlanItems } from './production-plans';

export const productUnits = pgTable(
  'product_units',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    serialNumber: text('serial_number').notNull().unique(),
    vendorSerialNumber: text('vendor_serial_number').unique(), // For the imported products
    orderItemId: uuid('order_item_id')
      .notNull()
      .references(() => orderItems.id),
    // All the following timestamps are drived from other tables
    producedAt: timestamp('produced_at', { withTimezone: true }), // For the manufactured products
    receivedAt: timestamp('received_at', { withTimezone: true }), // For the imported products
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    installedAt: timestamp('installed_at', { withTimezone: true }),
    notes: text('notes'),
    createdAt,
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
  },
  (table) => [
    index('product_units_order_item_id_idx').on(table.orderItemId),
    index('product_units_created_at_idx').on(table.createdAt),
  ],
);

// ============================== RELATIONS ==============================

export const productUnitsRelations = relations(productUnits, ({ one, many }) => ({
  orderItem: one(orderItems, {
    fields: [productUnits.orderItemId],
    references: [orderItems.id],
  }),
  productionPlanItems: many(productionPlanItems),
  createdBy: one(users, {
    fields: [productUnits.createdBy],
    references: [users.id],
  }),
}));
