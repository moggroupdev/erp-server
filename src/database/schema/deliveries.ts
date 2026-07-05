import { relations, sql } from 'drizzle-orm';
import { pgTable, uuid, text, timestamp, index, check } from 'drizzle-orm/pg-core';
import { createdAt } from './common';
import { customerAddresses } from './customers';
import { customerReceptions } from './customer-receptions';
import { productUnits } from './product-units';
import { users } from './users';

export const deliveries = pgTable(
  'deliveries',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    code: text('code').unique().notNull(), // Format: DEL-00000001
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
    index('deliveries_assigned_to_idx').on(table.assignedTo),
    index('deliveries_scheduled_at_idx').on(table.scheduledAt),
    index('deliveries_delivered_at_idx').on(table.deliveredAt),
    index('deliveries_cancelled_at_idx').on(table.cancelledAt),
    check('deliveries_delivered_cancelled_exclusive', sql`${table.deliveredAt} IS NULL OR ${table.cancelledAt} IS NULL`),
    check(
      'deliveries_delivered_at_gte_scheduled_at',
      sql`${table.deliveredAt} IS NULL OR ${table.scheduledAt} IS NULL OR ${table.deliveredAt} >= ${table.scheduledAt}`,
    ),
    check(
      'deliveries_cancelled_at_gte_scheduled_at',
      sql`${table.cancelledAt} IS NULL OR ${table.scheduledAt} IS NULL OR ${table.cancelledAt} >= ${table.scheduledAt}`,
    ),
  ],
);

export const deliveryAddresses = pgTable(
  'delivery_addresses',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    deliveryId: uuid('delivery_id')
      .notNull()
      .references(() => deliveries.id),
    customerAddressId: uuid('customer_address_id') // app-checked — must belong to a customer whose units are on this delivery
      .notNull()
      .references(() => customerAddresses.id),
  },
  (table) => [
    index('delivery_addresses_delivery_id_idx').on(table.deliveryId),
    index('delivery_addresses_customer_address_id_idx').on(table.customerAddressId),
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
  addresses: many(deliveryAddresses),
  items: many(deliveryItems),
  customerReceptions: many(customerReceptions),
}));

export const deliveryAddressesRelations = relations(deliveryAddresses, ({ one }) => ({
  delivery: one(deliveries, {
    fields: [deliveryAddresses.deliveryId],
    references: [deliveries.id],
  }),
  customerAddress: one(customerAddresses, {
    fields: [deliveryAddresses.customerAddressId],
    references: [customerAddresses.id],
  }),
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
