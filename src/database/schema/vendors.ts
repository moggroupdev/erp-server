import { relations, sql } from 'drizzle-orm';
import { pgTable, uuid, text, boolean, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { createdAt, deletedAt, egyptianCityRequiredCheck } from './common';
import { users } from './users';
import { countries } from './countries';
import { cities } from './cities';

export const vendors = pgTable(
  'vendors',
  {
    id: uuid('id').defaultRandom().primaryKey(),
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
    index('vendors_created_by_idx').on(table.createdBy),
    index('vendors_name_idx').on(table.name),
    index('vendors_phone_idx').on(table.phone),
    index('vendors_email_idx').on(table.email),
  ],
);

export const vendorAddresses = pgTable(
  'vendor_addresses',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    vendorId: uuid('vendor_id')
      .notNull()
      .references(() => vendors.id),
    countryId: uuid('country_id')
      .notNull()
      .references(() => countries.id),
    cityId: uuid('city_id').references(() => cities.id),
    addressLine: text('address_line').notNull(),
    isDefault: boolean('is_default').notNull().default(false),
  },
  (table) => [
    index('vendor_addresses_vendor_id_idx').on(table.vendorId),
    index('vendor_addresses_city_id_idx').on(table.cityId),
    index('vendor_addresses_country_id_idx').on(table.countryId),
    egyptianCityRequiredCheck('vendor_addresses_egyptian_city_required', table.countryId, table.cityId),
    uniqueIndex('vendor_addresses_one_default')
      .on(table.vendorId)
      .where(sql`${table.isDefault} = true`),
  ],
);

// ============================== RELATIONS ==============================

export const vendorsRelations = relations(vendors, ({ one, many }) => ({
  createdBy: one(users, {
    fields: [vendors.createdBy],
    references: [users.id],
  }),
  addresses: many(vendorAddresses),
}));

export const vendorAddressesRelations = relations(vendorAddresses, ({ one }) => ({
  vendor: one(vendors, {
    fields: [vendorAddresses.vendorId],
    references: [vendors.id],
  }),
  country: one(countries, {
    fields: [vendorAddresses.countryId],
    references: [countries.id],
  }),
  city: one(cities, {
    fields: [vendorAddresses.cityId],
    references: [cities.id],
  }),
}));
