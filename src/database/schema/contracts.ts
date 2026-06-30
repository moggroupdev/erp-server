import { relations, sql } from 'drizzle-orm';
import { pgTable, uuid, text, timestamp, integer, index, check, type AnyPgColumn } from 'drizzle-orm/pg-core';
import { numeric, createdAt, nonNegativeQuantityCheck, positiveQuantityCheck } from './common';
import { customers, customerAddresses } from './customers';
import { productDimensions } from './products';
import { inquiries } from './inquiries';
import { previews } from './previews';
import { offers } from './offers';
import { users } from './users';
import { productUnits } from './product-units';
import { productPurchaseOrderItems } from './purchasing-products';
import { deliveries } from './deliveries';
import { installations } from './installations';

// This represents the contract between the customer and the company (An Order)
export const contracts = pgTable(
  'contracts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    code: text('code').unique().notNull(), // Format: CTR-00000001
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
    startedAt: timestamp('started_at', { withTimezone: true }), // Work order start date (تاريخ بداية أمر الشغل)
    completedAt: timestamp('completed_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    cancelledBy: uuid('cancelled_by').references(() => users.id),
    cancellationReason: text('cancellation_reason'),
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
    index('contracts_created_at_idx').on(table.createdAt),
    index('contracts_created_by_idx').on(table.createdBy),
    index('contracts_delivery_time_idx').on(table.deliveryTime),
    index('contracts_started_at_idx').on(table.startedAt),
    index('contracts_completed_at_idx').on(table.completedAt),
    index('contracts_cancelled_at_idx').on(table.cancelledAt),
    check('contracts_completed_cancelled_exclusive', sql`${table.completedAt} IS NULL OR ${table.cancelledAt} IS NULL`),
    check(
      'contracts_completed_after_started',
      sql`${table.completedAt} IS NULL OR ${table.startedAt} IS NULL OR ${table.completedAt} >= ${table.startedAt}`,
    ),
    check(
      'contracts_cancelled_after_started',
      sql`${table.cancelledAt} IS NULL OR ${table.startedAt} IS NULL OR ${table.cancelledAt} >= ${table.startedAt}`,
    ),
    nonNegativeQuantityCheck('contracts_total_amount_non_negative', table.totalAmount),
  ],
);

export const contractItems = pgTable(
  'contract_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    contractId: uuid('contract_id')
      .notNull()
      .references(() => contracts.id),
    productDimensionId: uuid('product_dimension_id')
      .notNull()
      .references(() => productDimensions.id),
    productCode: text('product_code').notNull(), // RFP
    title: text('title'),
    notes: text('notes'),
    unitPrice: numeric('unit_price').notNull(),
    quantity: integer('quantity').notNull().default(1),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id), // May differ from contract creator when lines are appended later
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    cancelledBy: uuid('cancelled_by').references(() => users.id), // Null when cancelled via parent contract cascade
    cancellationReason: text('cancellation_reason'), // Set on the old row when cancelled or replaced
    previousVersionId: uuid('previous_version_id').references((): AnyPgColumn => contractItems.id), // Set on replacement rows only — cancel-and-replace history link
  },
  (table) => [
    index('contract_items_contract_id_idx').on(table.contractId),
    index('contract_items_product_dimension_id_idx').on(table.productDimensionId),
    index('contract_items_product_code_idx').on(table.productCode),
    index('contract_items_created_by_idx').on(table.createdBy),
    index('contract_items_cancelled_at_idx').on(table.cancelledAt),
    index('contract_items_previous_version_id_idx').on(table.previousVersionId),
    positiveQuantityCheck('contract_items_quantity_positive', table.quantity),
    positiveQuantityCheck('contract_items_unit_price_positive', table.unitPrice),
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
    relationName: 'contractCreatedBy',
  }),
  cancelledByUser: one(users, {
    fields: [contracts.cancelledBy],
    references: [users.id],
    relationName: 'contractCancelledBy',
  }),
  items: many(contractItems),
  deliveries: many(deliveries),
  installations: many(installations),
}));

export const contractItemsRelations = relations(contractItems, ({ one, many }) => ({
  contract: one(contracts, {
    fields: [contractItems.contractId],
    references: [contracts.id],
  }),
  productDimension: one(productDimensions, {
    fields: [contractItems.productDimensionId],
    references: [productDimensions.id],
  }),
  createdByUser: one(users, {
    fields: [contractItems.createdBy],
    references: [users.id],
    relationName: 'contractItemCreatedBy',
  }),
  cancelledByUser: one(users, {
    fields: [contractItems.cancelledBy],
    references: [users.id],
    relationName: 'contractItemCancelledBy',
  }),
  previousVersion: one(contractItems, {
    fields: [contractItems.previousVersionId],
    references: [contractItems.id],
    relationName: 'contractItemVersionChain',
  }),
  nextVersions: many(contractItems, {
    relationName: 'contractItemVersionChain',
  }),
  productUnits: many(productUnits),
  productPurchaseOrderItems: many(productPurchaseOrderItems),
}));
