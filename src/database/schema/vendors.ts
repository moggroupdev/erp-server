import { relations, sql } from 'drizzle-orm';
import { pgTable, uuid, text, boolean, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { createdAt, deletedAt } from './common';
import { users } from './users';
import { cities, countries } from './locations';
import { materialPurchaseOrders } from './purchasing-materials';
import { productPurchaseOrders } from './purchasing-products';
import { vendorQuotationEmails } from './vendor-quotation-emails';

export const vendors = pgTable(
  'vendors',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    code: text('code').unique().notNull(), // Format: VEN-00000001
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
    index('vendors_name_idx').on(table.name),
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
  materialPurchaseOrders: many(materialPurchaseOrders),
  productPurchaseOrders: many(productPurchaseOrders),
  quotationEmails: many(vendorQuotationEmails),
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
