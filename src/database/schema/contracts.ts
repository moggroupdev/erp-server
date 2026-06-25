import { relations } from 'drizzle-orm';
import { pgTable, uuid, text, timestamp, integer, index } from 'drizzle-orm/pg-core';
import { numeric, createdAt, dimensionUnitEnum, nonNegativeQuantityCheck, positiveQuantityCheck } from './common';
import { customers, customerAddresses } from './customers';
import { users } from './users';
import { products } from './products';
import { inquiries } from './inquiries';
import { previews } from './previews';
import { offers } from './offers';
import { productUnits } from './product-units';
import { productPurchaseOrderItems } from './purchasing-products';

// This represents the contract between the customer and the company (An Order)
export const contracts = pgTable(
  'contracts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    code: text('code').unique().notNull(), // Format: CTR-0000001
    inquiryId: uuid('inquiry_id')
      .notNull()
      .references(() => inquiries.id),
    previewId: uuid('preview_id') // Nullable — some contracts are not from previews
      .unique()
      .references(() => previews.id),
    offerId: uuid('offer_id') // Nullable — some contracts are not from offers
      .unique()
      .references(() => offers.id),
    customerId: uuid('customer_id') // RFP
      .notNull()
      .references(() => customers.id),
    deliveryAddressId: uuid('delivery_address_id')
      .notNull()
      .references(() => customerAddresses.id),
    deliveryTime: timestamp('delivery_time', { withTimezone: true }), // Estimated delivery time
    totalAmount: numeric('total_amount').notNull(), // app-synced
    // Contract status can be deduced from these dates:
    completedAt: timestamp('completed_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    notes: text('notes'),
    createdAt,
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
  },
  (table) => [
    index('contracts_code_idx').on(table.code),
    index('contracts_inquiry_id_idx').on(table.inquiryId),
    index('contracts_customer_id_idx').on(table.customerId),
    index('contracts_delivery_time_idx').on(table.deliveryTime),
    index('contracts_completed_at_idx').on(table.completedAt),
    index('contracts_cancelled_at_idx').on(table.cancelledAt),
    index('contracts_created_at_idx').on(table.createdAt),
    index('contracts_created_by_idx').on(table.createdBy),
  ],
);

export const contractItems = pgTable(
  'contract_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    contractId: uuid('contract_id')
      .notNull()
      .references(() => contracts.id),
    productCode: text('product_code')
      .notNull()
      .references(() => products.code),
    title: text('title'),
    notes: text('notes'),
    unitPrice: numeric('unit_price').notNull(),
    quantity: integer('quantity').notNull().default(1),
  },
  (table) => [
    index('contract_items_contract_id_idx').on(table.contractId),
    index('contract_items_product_code_idx').on(table.productCode),
    positiveQuantityCheck('contract_items_quantity_positive', table.quantity),
  ],
);

// In case of custom dimensions (not standard)
export const contractItemDimensions = pgTable(
  'contract_item_dimensions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    contractItemId: uuid('contract_item_id')
      .notNull()
      .unique()
      .references(() => contractItems.id),
    length: numeric('length').notNull(),
    width: numeric('width').notNull(),
    height: numeric('height').notNull(),
    unit: dimensionUnitEnum('unit').notNull(),
  },
  (table) => [
    nonNegativeQuantityCheck('contract_item_dimensions_length_non_negative', table.length),
    nonNegativeQuantityCheck('contract_item_dimensions_width_non_negative', table.width),
    nonNegativeQuantityCheck('contract_item_dimensions_height_non_negative', table.height),
  ],
);

// ============================== RELATIONS ==============================

export const contractsRelations = relations(contracts, ({ one, many }) => ({
  inquiry: one(inquiries, {
    fields: [contracts.inquiryId],
    references: [inquiries.id],
  }),
  preview: one(previews, {
    fields: [contracts.previewId],
    references: [previews.id],
  }),
  offer: one(offers, {
    fields: [contracts.offerId],
    references: [offers.id],
  }),
  customer: one(customers, {
    fields: [contracts.customerId],
    references: [customers.id],
  }),
  deliveryAddress: one(customerAddresses, {
    fields: [contracts.deliveryAddressId],
    references: [customerAddresses.id],
  }),
  createdBy: one(users, {
    fields: [contracts.createdBy],
    references: [users.id],
  }),
  items: many(contractItems),
}));

export const contractItemsRelations = relations(contractItems, ({ one, many }) => ({
  contract: one(contracts, {
    fields: [contractItems.contractId],
    references: [contracts.id],
  }),
  product: one(products, {
    fields: [contractItems.productCode],
    references: [products.code],
  }),
  dimensions: one(contractItemDimensions, {
    fields: [contractItems.id],
    references: [contractItemDimensions.contractItemId],
  }),
  productUnits: many(productUnits),
  productPurchaseOrderItems: many(productPurchaseOrderItems),
}));

export const contractItemDimensionsRelations = relations(contractItemDimensions, ({ one }) => ({
  contractItem: one(contractItems, {
    fields: [contractItemDimensions.contractItemId],
    references: [contractItems.id],
  }),
}));
