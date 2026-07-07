import { relations, sql } from 'drizzle-orm';
import { pgTable, uuid, text, timestamp, integer, index, check } from 'drizzle-orm/pg-core';
import { createdAt, numeric, percentage, offerStatusEnum, negotiationPartyEnum, nonNegativeQuantityCheck, positiveQuantityCheck } from './common';
import { inquiries } from './inquiries';
import { contracts } from './contracts';
import { products, productDimensions } from './products';
import { users } from './users';

export const offers = pgTable(
  'offers',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    inquiryId: uuid('inquiry_id')
      .notNull()
      .references(() => inquiries.id),
    status: offerStatusEnum('status').notNull().default('draft'),
    validUntil: timestamp('valid_until', { withTimezone: true }),
    totalAmount: numeric('total_amount').notNull(), // @CACHING_APP_SYNCED - SUM(quantity * unit_price) from offer_items
    discountPct: percentage('discount_pct'),
    notes: text('notes'),
    createdAt,
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
  },
  (table) => [
    index('offers_inquiry_id_idx').on(table.inquiryId),
    index('offers_status_idx').on(table.status),
    index('offers_created_at_idx').on(table.createdAt),
    index('offers_created_by_idx').on(table.createdBy),
    nonNegativeQuantityCheck('offers_total_amount_non_negative', table.totalAmount),
    check(
      'offers_discount_pct_check',
      sql`${table.discountPct} IS NULL OR (${table.discountPct} >= 0 AND ${table.discountPct} <= 100)`,
    ),
  ],
);

export const offerItems = pgTable(
  'offer_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    offerId: uuid('offer_id')
      .notNull()
      .references(() => offers.id),
    productDimensionId: uuid('product_dimension_id')
      .notNull()
      .references(() => productDimensions.id),
    productCode: text('product_code') // @RFP_APP_CHECKED - Must match product_dimensions.product_code for product_dimension_id
      .notNull()
      .references(() => products.code),
    title: text('title'),
    notes: text('notes'),
    quantity: integer('quantity').notNull().default(1),
    unitPrice: numeric('unit_price').notNull(), // @HISTORICAL_SNAPSHOT - Quoted price at offer creation
  },
  (table) => [
    index('offer_items_offer_id_idx').on(table.offerId),
    index('offer_items_product_dimension_id_idx').on(table.productDimensionId),
    index('offer_items_product_code_idx').on(table.productCode),
    positiveQuantityCheck('offer_items_quantity_positive', table.quantity),
    positiveQuantityCheck('offer_items_unit_price_positive', table.unitPrice),
  ],
);

export const offerNegotiations = pgTable(
  'offer_negotiations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    offerId: uuid('offer_id')
      .notNull()
      .references(() => offers.id),
    party: negotiationPartyEnum('party').notNull(),
    discountPct: percentage('discount_pct').notNull(), // @APP_CHECKED - When party = company, must not exceed the acting user's role.maxDiscountPct
    notes: text('notes'),
    createdAt,
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
  },
  (table) => [
    index('offer_negotiations_offer_id_idx').on(table.offerId),
    index('offer_negotiations_created_by_idx').on(table.createdBy),
    index('offer_negotiations_created_at_idx').on(table.createdAt),
    check(
      'offer_negotiations_discount_pct_check',
      sql`${table.discountPct} >= 0 AND ${table.discountPct} <= 100`,
    ),
  ],
);

// ============================== RELATIONS ==============================

export const offersRelations = relations(offers, ({ one, many }) => ({
  inquiry: one(inquiries, {
    fields: [offers.inquiryId],
    references: [inquiries.id],
  }),
  createdBy: one(users, {
    fields: [offers.createdBy],
    references: [users.id],
  }),
  items: many(offerItems),
  negotiations: many(offerNegotiations),
  contracts: many(contracts),
}));

export const offerItemsRelations = relations(offerItems, ({ one }) => ({
  offer: one(offers, {
    fields: [offerItems.offerId],
    references: [offers.id],
  }),
  productDimension: one(productDimensions, {
    fields: [offerItems.productDimensionId],
    references: [productDimensions.id],
  }),
  product: one(products, {
    fields: [offerItems.productCode],
    references: [products.code],
  }),
}));

export const offerNegotiationsRelations = relations(offerNegotiations, ({ one }) => ({
  offer: one(offers, {
    fields: [offerNegotiations.offerId],
    references: [offers.id],
  }),
  createdByUser: one(users, {
    fields: [offerNegotiations.createdBy],
    references: [users.id],
  }),
}));
