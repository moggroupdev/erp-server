import { pgTable, uuid, text, boolean, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import { createdAt, deletedAt } from './common';
import { users } from './users';
import { cities } from './cities';
import { countries } from './countries';
import { inquiries } from './inquiries';
import { contracts } from './contracts';

export const customers = pgTable(
  'customers',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    code: text('code').unique().notNull(), // Format: CUS-00000001
    name: text('name').notNull(),
    phone: text('phone').unique(),
    email: text('email').unique(),
    notes: text('notes'),
    deletedAt,
    createdAt,
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
  },
  (table) => [
    index('customers_code_idx').on(table.code),
    index('customers_name_idx').on(table.name),
    index('customers_phone_idx').on(table.phone),
    index('customers_email_idx').on(table.email),
  ],
);

export const customerAddresses = pgTable(
  'customer_addresses',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id),
    countryId: uuid('country_id')
      .notNull()
      .references(() => countries.id),
    cityId: uuid('city_id').references(() => cities.id),
    addressLine: text('address_line').notNull(),
    isDefault: boolean('is_default').notNull().default(false),
  },
  (table) => [
    index('customer_addresses_customer_id_idx').on(table.customerId),
    index('customer_addresses_city_id_idx').on(table.cityId),
    index('customer_addresses_country_id_idx').on(table.countryId),
    uniqueIndex('customer_addresses_one_default')
      .on(table.customerId)
      .where(sql`${table.isDefault} = true`),
  ],
);

// ============================== RELATIONS ==============================

export const customersRelations = relations(customers, ({ one, many }) => ({
  createdBy: one(users, {
    fields: [customers.createdBy],
    references: [users.id],
  }),
  addresses: many(customerAddresses),
  inquiries: many(inquiries),
  contracts: many(contracts),
}));

export const customerAddressesRelations = relations(customerAddresses, ({ one }) => ({
  customer: one(customers, {
    fields: [customerAddresses.customerId],
    references: [customers.id],
  }),
  country: one(countries, {
    fields: [customerAddresses.countryId],
    references: [countries.id],
  }),
  city: one(cities, {
    fields: [customerAddresses.cityId],
    references: [cities.id],
  }),
}));
