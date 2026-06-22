import { pgTable, uuid, text, timestamp, integer, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { createdAt, numeric, offerStatusEnum, positiveQuantityCheck } from './common';
import { users } from './users';
import { inquiries, inquiryItems } from './inquiries';
import { products } from './products';

export const offers = pgTable(
  'offers',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    inquiryId: uuid('inquiry_id')
      .notNull()
      .references(() => inquiries.id),
    status: offerStatusEnum('status').notNull().default('draft'),
    totalAmount: numeric('total_amount').notNull(),
    validUntil: timestamp('valid_until', { withTimezone: true }),
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
  ],
);

export const offerItems = pgTable(
  'offer_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    offerId: uuid('offer_id')
      .notNull()
      .references(() => offers.id),
    inquiryItemId: uuid('inquiry_item_id')
      .notNull()
      .references(() => inquiryItems.id),
    // The inquiry_items.product_code already exists, but we need the product_code in offer_items also as the sales team can substitute a different product during quoting.
    productCode: text('product_code')
      .notNull()
      .references(() => products.code),
    title: text('title').notNull(),
    quantity: integer('quantity').notNull().default(1),
    unitPrice: numeric('unit_price').notNull(),
    notes: text('notes'),
  },
  (table) => [
    index('offer_items_offer_id_idx').on(table.offerId),
    index('offer_items_inquiry_item_id_idx').on(table.inquiryItemId),
    index('offer_items_product_code_idx').on(table.productCode),
    positiveQuantityCheck('offer_items_quantity_positive', table.quantity),
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
}));

export const offerItemsRelations = relations(offerItems, ({ one }) => ({
  offer: one(offers, {
    fields: [offerItems.offerId],
    references: [offers.id],
  }),
  inquiryItem: one(inquiryItems, {
    fields: [offerItems.inquiryItemId],
    references: [inquiryItems.id],
  }),
  product: one(products, {
    fields: [offerItems.productCode],
    references: [products.code],
  }),
}));
