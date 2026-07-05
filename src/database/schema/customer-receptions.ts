import { relations } from 'drizzle-orm';
import { pgTable, uuid, text, timestamp, index } from 'drizzle-orm/pg-core';
import { createdAt } from './common';
import { customers } from './customers';
import { deliveries } from './deliveries';
import { installations } from './installations';
import { productUnits } from './product-units';
import { users } from './users';

export const customerReceptions = pgTable(
  'customer_receptions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    code: text('code').unique().notNull(), // Format: REC-00000001
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id),
    deliveryId: uuid('delivery_id') // app-checked — when set, all items must belong to this delivery
      .references(() => deliveries.id),
    installationId: uuid('installation_id') // app-checked — when set, all items must belong to this installation
      .references(() => installations.id),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull(), // Warranty start date
    notes: text('notes'),
    createdAt,
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
  },
  (table) => [
    index('customer_receptions_code_idx').on(table.code),
    index('customer_receptions_customer_id_idx').on(table.customerId),
    index('customer_receptions_delivery_id_idx').on(table.deliveryId),
    index('customer_receptions_installation_id_idx').on(table.installationId),
    index('customer_receptions_received_at_idx').on(table.receivedAt),
  ],
);

export const customerReceptionItems = pgTable(
  'customer_reception_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    customerReceptionId: uuid('customer_reception_id')
      .notNull()
      .references(() => customerReceptions.id),
    productUnitId: uuid('product_unit_id')
      .notNull()
      .unique()
      .references(() => productUnits.id),
    notes: text('notes'),
  },
  (table) => [index('customer_reception_items_reception_id_idx').on(table.customerReceptionId)],
);

// ============================== RELATIONS ==============================

export const customerReceptionsRelations = relations(customerReceptions, ({ one, many }) => ({
  customer: one(customers, {
    fields: [customerReceptions.customerId],
    references: [customers.id],
  }),
  delivery: one(deliveries, {
    fields: [customerReceptions.deliveryId],
    references: [deliveries.id],
  }),
  installation: one(installations, {
    fields: [customerReceptions.installationId],
    references: [installations.id],
  }),
  createdBy: one(users, {
    fields: [customerReceptions.createdBy],
    references: [users.id],
    relationName: 'customerReceptionCreatedBy',
  }),
  items: many(customerReceptionItems),
}));

export const customerReceptionItemsRelations = relations(customerReceptionItems, ({ one }) => ({
  customerReception: one(customerReceptions, {
    fields: [customerReceptionItems.customerReceptionId],
    references: [customerReceptions.id],
  }),
  productUnit: one(productUnits, {
    fields: [customerReceptionItems.productUnitId],
    references: [productUnits.id],
  }),
}));
