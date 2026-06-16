import { pgTable, uuid, text, integer } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { createdAt, inquiryStatusEnum, nonNegativeQuantityCheck } from './common';
import { users } from './users';
import { customers } from './customers';
import { products } from './products';
import { offers } from './offers';

export const inquiries = pgTable('inquiries', {
  id: uuid('id').defaultRandom().primaryKey(),
  customerId: uuid('customer_id')
    .notNull()
    .references(() => customers.id),
  status: inquiryStatusEnum('status').notNull().default('pending'),
  notes: text('notes'),
  createdBy: uuid('created_by')
    .notNull()
    .references(() => users.id),
  createdAt,
});

export const inquiryItems = pgTable(
  'inquiry_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    inquiryId: uuid('inquiry_id')
      .notNull()
      .references(() => inquiries.id),
    productCode: text('product_code')
      .notNull()
      .references(() => products.code),
    title: text('title').notNull(),
    quantity: integer('quantity').notNull().default(1),
    notes: text('notes'),
  },
  (table) => [nonNegativeQuantityCheck('inquiry_items_quantity_non_negative', table.quantity)],
);

export const inquiriesRelations = relations(inquiries, ({ one, many }) => ({
  customer: one(customers, {
    fields: [inquiries.customerId],
    references: [customers.id],
  }),
  createdBy: one(users, {
    fields: [inquiries.createdBy],
    references: [users.id],
  }),
  items: many(inquiryItems),
  offers: many(offers),
}));

export const inquiryItemsRelations = relations(inquiryItems, ({ one }) => ({
  inquiry: one(inquiries, {
    fields: [inquiryItems.inquiryId],
    references: [inquiries.id],
  }),
  product: one(products, {
    fields: [inquiryItems.productCode],
    references: [products.code],
  }),
}));
