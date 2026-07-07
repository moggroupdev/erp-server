import { relations, sql } from 'drizzle-orm';
import { pgTable, uuid, text, timestamp, index, check } from 'drizzle-orm/pg-core';
import { createdAt } from './common';
import { inquiries } from './inquiries';
import { contracts } from './contracts';
import { products, productDimensions } from './products';
import { users } from './users';

export const previews = pgTable(
  'previews',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    inquiryId: uuid('inquiry_id')
      .notNull()
      .references(() => inquiries.id),
    // Preview status can be deduced from these dates:
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }).notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    notes: text('notes'),
    assignedTo: uuid('assigned_to')
      .notNull()
      .references(() => users.id),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
    createdAt,
  },
  (table) => [
    index('previews_inquiry_id_idx').on(table.inquiryId),
    index('previews_scheduled_at_idx').on(table.scheduledAt),
    index('previews_completed_at_idx').on(table.completedAt),
    index('previews_cancelled_at_idx').on(table.cancelledAt),
    index('previews_assigned_to_idx').on(table.assignedTo),
    index('previews_created_by_idx').on(table.createdBy),
    index('previews_created_at_idx').on(table.createdAt),
    check('previews_completed_cancelled_exclusive', sql`${table.completedAt} IS NULL OR ${table.cancelledAt} IS NULL`),
    check(
      'previews_completed_at_gte_scheduled_at',
      sql`${table.completedAt} IS NULL OR ${table.completedAt} >= ${table.scheduledAt}`,
    ),
    check(
      'previews_cancelled_at_gte_scheduled_at',
      sql`${table.cancelledAt} IS NULL OR ${table.cancelledAt} >= ${table.scheduledAt}`,
    ),
  ],
);

export const previewItems = pgTable(
  'preview_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    previewId: uuid('preview_id')
      .notNull()
      .references(() => previews.id),
    productDimensionId: uuid('product_dimension_id')
      .notNull()
      .references(() => productDimensions.id),
    productCode: text('product_code') // @RFP_APP_CHECKED - Must match product_dimensions.product_code for product_dimension_id
      .notNull()
      .references(() => products.code),
    notes: text('notes'),
  },
  (table) => [
    index('preview_items_preview_id_idx').on(table.previewId),
    index('preview_items_product_dimension_id_idx').on(table.productDimensionId),
    index('preview_items_product_code_idx').on(table.productCode),
  ],
);

// ============================== RELATIONS ==============================

export const previewsRelations = relations(previews, ({ one, many }) => ({
  inquiry: one(inquiries, {
    fields: [previews.inquiryId],
    references: [inquiries.id],
  }),
  assignedTo: one(users, {
    fields: [previews.assignedTo],
    references: [users.id],
    relationName: 'assignedTo',
  }),
  createdBy: one(users, {
    fields: [previews.createdBy],
    references: [users.id],
    relationName: 'previewCreatedBy',
  }),
  items: many(previewItems),
  contracts: many(contracts),
}));

export const previewItemsRelations = relations(previewItems, ({ one }) => ({
  preview: one(previews, {
    fields: [previewItems.previewId],
    references: [previews.id],
  }),
  productDimension: one(productDimensions, {
    fields: [previewItems.productDimensionId],
    references: [productDimensions.id],
  }),
  product: one(products, {
    fields: [previewItems.productCode],
    references: [products.code],
  }),
}));
