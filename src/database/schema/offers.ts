import { relations } from 'drizzle-orm';
import { pgTable, uuid, text, timestamp, integer, index } from 'drizzle-orm/pg-core';
import { createdAt, numeric, offerStatusEnum, nonNegativeQuantityCheck, positiveQuantityCheck } from './common';
import { inquiries } from './inquiries';
import { contracts } from './contracts';
import { products } from './products';
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
    totalAmount: numeric('total_amount').notNull(), // app-synced
    notes: text('notes'),
    createdAt,
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
  },
  (table) => [
    index('offers_inquiry_id_idx').on(table.inquiryId),
    index('offers_created_by_idx').on(table.createdBy),
    index('offers_status_idx').on(table.status),
    index('offers_created_at_idx').on(table.createdAt),
    nonNegativeQuantityCheck('offers_total_amount_non_negative', table.totalAmount),
  ],
);

export const offerItems = pgTable(
  'offer_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    offerId: uuid('offer_id')
      .notNull()
      .references(() => offers.id),
    productCode: text('product_code')
      .notNull()
      .references(() => products.code),
    title: text('title'),
    notes: text('notes'),
    quantity: integer('quantity').notNull().default(1),
    unitPrice: numeric('unit_price').notNull(),
  },
  (table) => [
    index('offer_items_offer_id_idx').on(table.offerId),
    index('offer_items_product_code_idx').on(table.productCode),
    positiveQuantityCheck('offer_items_quantity_positive', table.quantity),
    positiveQuantityCheck('offer_items_unit_price_positive', table.unitPrice),
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
  contracts: many(contracts),
}));

export const offerItemsRelations = relations(offerItems, ({ one }) => ({
  offer: one(offers, {
    fields: [offerItems.offerId],
    references: [offers.id],
  }),
  product: one(products, {
    fields: [offerItems.productCode],
    references: [products.code],
  }),
}));
