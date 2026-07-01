import { pgTable, uuid, text, integer, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { createdAt, inquiryStatusEnum, positiveQuantityCheck } from './common';
import { users } from './users';
import { customers } from './customers';
import { products, productDimensions } from './products';
import { offers } from './offers';
import { previews } from './previews';
import { contracts } from './contracts';

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
    productDimensionId: uuid('product_dimension_id')
      .notNull()
      .references(() => productDimensions.id),
    productCode: text('product_code').notNull().references(() => products.code), // RFP
    title: text('title'),
    notes: text('notes'),
    quantity: integer('quantity').notNull().default(1),
  },
  (table) => [
    index('inquiry_items_inquiry_id_idx').on(table.inquiryId),
    index('inquiry_items_product_dimension_id_idx').on(table.productDimensionId),
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
  previews: many(previews),
  contracts: many(contracts),
}));

export const inquiryItemsRelations = relations(inquiryItems, ({ one }) => ({
  inquiry: one(inquiries, {
    fields: [inquiryItems.inquiryId],
    references: [inquiries.id],
  }),
  productDimension: one(productDimensions, {
    fields: [inquiryItems.productDimensionId],
    references: [productDimensions.id],
  }),
  product: one(products, {
    fields: [inquiryItems.productCode],
    references: [products.code],
  }),
}));
