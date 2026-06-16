import { pgTable, uuid, text, boolean } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { createdAt, deletedAt } from './common';
import { users } from './users';
import { governorates } from './governorates';
import { cities } from './cities';

export const customers = pgTable('customers', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  phone: text('phone'),
  email: text('email'),
  notes: text('notes'),
  deletedAt,
  createdAt,
  createdBy: uuid('created_by')
    .notNull()
    .references(() => users.id),
});

export const customerAddresses = pgTable('customer_addresses', {
  id: uuid('id').defaultRandom().primaryKey(),
  customerId: uuid('customer_id')
    .notNull()
    .references(() => customers.id),
  governorateId: uuid('governorate_id')
    .notNull()
    .references(() => governorates.id),
  cityId: uuid('city_id')
    .notNull()
    .references(() => cities.id),
  addressLine: text('address_line').notNull(),
  isDefault: boolean('is_default').notNull().default(false),
});

export const customersRelations = relations(customers, ({ one, many }) => ({
  createdBy: one(users, {
    fields: [customers.createdBy],
    references: [users.id],
  }),
  addresses: many(customerAddresses),
}));

export const customerAddressesRelations = relations(customerAddresses, ({ one }) => ({
  customer: one(customers, {
    fields: [customerAddresses.customerId],
    references: [customers.id],
  }),
  governorate: one(governorates, {
    fields: [customerAddresses.governorateId],
    references: [governorates.id],
  }),
  city: one(cities, {
    fields: [customerAddresses.cityId],
    references: [cities.id],
  }),
}));
