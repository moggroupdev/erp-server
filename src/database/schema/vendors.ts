import { pgTable, uuid, text, boolean } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { createdAt, deletedAt } from './common';
import { users } from './users';
import { governorates } from './governorates';
import { cities } from './cities';

export const vendors = pgTable('vendors', {
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

export const vendorAddresses = pgTable('vendor_addresses', {
  id: uuid('id').defaultRandom().primaryKey(),
  vendorId: uuid('vendor_id')
    .notNull()
    .references(() => vendors.id),
  governorateId: uuid('governorate_id')
    .notNull()
    .references(() => governorates.id),
  cityId: uuid('city_id')
    .notNull()
    .references(() => cities.id),
  addressLine: text('address_line').notNull(),
  isDefault: boolean('is_default').notNull().default(false),
});

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
  governorate: one(governorates, {
    fields: [vendorAddresses.governorateId],
    references: [governorates.id],
  }),
  city: one(cities, {
    fields: [vendorAddresses.cityId],
    references: [cities.id],
  }),
}));
