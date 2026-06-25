import { pgTable, uuid, text, integer, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { createdAt, inquiryStatusEnum, positiveQuantityCheck } from './common';
import { users } from './users';
import { customers } from './customers';
import { products } from './products';
import { offers } from './offers';

export const inquiries = pgTable(
  'inquiries',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id),
    status: inquiryStatusEnum('status').notNull().default('pending'),
    notes: text('notes'),
    createdAt,
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
  },
  (table) => [
    index('inquiries_customer_id_idx').on(table.customerId),
    index('inquiries_created_by_idx').on(table.createdBy),
    index('inquiries_status_idx').on(table.status),
    index('inquiries_created_at_idx').on(table.createdAt),
  ],
);

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
    title: text('title'),
    notes: text('notes'),
    quantity: integer('quantity').notNull().default(1),
  },
  (table) => [
    index('inquiry_items_inquiry_id_idx').on(table.inquiryId),
    index('inquiry_items_product_code_idx').on(table.productCode),
    positiveQuantityCheck('inquiry_items_quantity_positive', table.quantity),
  ],
);

// ============================== RELATIONS ==============================

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
