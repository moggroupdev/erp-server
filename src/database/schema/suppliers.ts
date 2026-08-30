import { relations, sql } from 'drizzle-orm';
import { pgTable, uuid, text, boolean, index, uniqueIndex, check } from 'drizzle-orm/pg-core';
import { createdAt, blacklistedAt, supplierClassificationEnum } from './common';
import { users } from './users';
import { cities, countries } from './locations';
import { materialPurchaseOrders } from './purchasing-materials';
import { productPurchaseOrders } from './purchasing-products';
import { supplierQuotationEmails } from './supplier-quotation-emails';

export const suppliers = pgTable(
  'suppliers',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    code: text('code').unique().notNull(), // Format: SUP-00000001
    name: text('name').notNull(),
    phone: text('phone').unique(),
    email: text('email').unique(),
    taxNumber: text('tax_number').unique(),
    classification: supplierClassificationEnum('classification'),
    notes: text('notes'),
    blacklistedAt,
    addedToBlacklistBy: uuid('added_to_blacklist_by').references(() => users.id),
    createdAt,
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
  },
  (table) => [
    index('suppliers_name_idx').on(table.name),
    index('suppliers_classification_idx').on(table.classification),
    index('suppliers_blacklisted_at_idx').on(table.blacklistedAt),
    index('suppliers_added_to_blacklist_by_idx').on(table.addedToBlacklistBy),
    check('suppliers_blacklist_pair', sql`(${table.blacklistedAt} IS NULL) = (${table.addedToBlacklistBy} IS NULL)`),
  ],
);

export const supplierAddresses = pgTable(
  'supplier_addresses',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    supplierId: uuid('supplier_id')
      .notNull()
      .references(() => suppliers.id),
    countryId: uuid('country_id')
      .notNull()
      .references(() => countries.id),
    cityId: uuid('city_id').references(() => cities.id),
    addressLine: text('address_line'),
    isDefault: boolean('is_default').notNull().default(false),
  },
  (table) => [
    index('supplier_addresses_supplier_id_idx').on(table.supplierId),
    index('supplier_addresses_city_id_idx').on(table.cityId),
    index('supplier_addresses_country_id_idx').on(table.countryId),
    uniqueIndex('supplier_addresses_one_default')
      .on(table.supplierId)
      .where(sql`${table.isDefault} = true`),
  ],
);

// ============================== RELATIONS ==============================

export const suppliersRelations = relations(suppliers, ({ one, many }) => ({
  createdBy: one(users, {
    fields: [suppliers.createdBy],
    references: [users.id],
    relationName: 'supplierCreatedBy',
  }),
  addedToBlacklistBy: one(users, {
    fields: [suppliers.addedToBlacklistBy],
    references: [users.id],
    relationName: 'supplierAddedToBlacklistBy',
  }),
  addresses: many(supplierAddresses),
  materialPurchaseOrders: many(materialPurchaseOrders),
  productPurchaseOrders: many(productPurchaseOrders),
  quotationEmails: many(supplierQuotationEmails),
}));

export const supplierAddressesRelations = relations(supplierAddresses, ({ one }) => ({
  supplier: one(suppliers, {
    fields: [supplierAddresses.supplierId],
    references: [suppliers.id],
  }),
  country: one(countries, {
    fields: [supplierAddresses.countryId],
    references: [countries.id],
  }),
  city: one(cities, {
    fields: [supplierAddresses.cityId],
    references: [cities.id],
  }),
}));
