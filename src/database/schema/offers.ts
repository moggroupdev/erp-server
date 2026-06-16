import { pgTable, uuid, text, timestamp, integer } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { createdAt, numeric, offerStatusEnum } from './common';
import { users } from './users';
import { customers } from './customers';
import { inquiries, inquiryItems } from './inquiries';
import { products } from './products';

export const offers = pgTable('offers', {
  id: uuid('id').defaultRandom().primaryKey(),
  inquiryId: uuid('inquiry_id')
    .notNull()
    .references(() => inquiries.id),
  customerId: uuid('customer_id')
    .notNull()
    .references(() => customers.id),
  status: offerStatusEnum('status').notNull().default('draft'),
  totalAmount: numeric('total_amount').notNull().default(0),
  validUntil: timestamp('valid_until', { withTimezone: true }),
  notes: text('notes'),
  createdBy: uuid('created_by')
    .notNull()
    .references(() => users.id),
  createdAt,
});

export const offerItems = pgTable('offer_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  offerId: uuid('offer_id')
    .notNull()
    .references(() => offers.id),
  inquiryItemId: uuid('inquiry_item_id').references(() => inquiryItems.id),
  productCode: text('product_code').references(() => products.code),
  title: text('title').notNull(),
  quantity: integer('quantity').notNull().default(1),
  unitPrice: numeric('unit_price').notNull().default(0),
  notes: text('notes'),
});

export const offersRelations = relations(offers, ({ one, many }) => ({
  inquiry: one(inquiries, {
    fields: [offers.inquiryId],
    references: [inquiries.id],
  }),
  customer: one(customers, {
    fields: [offers.customerId],
    references: [customers.id],
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
