import { pgTable, uuid, text, timestamp, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { createdAt, dimensionUnitEnum, nonNegativeQuantityCheck, numeric, previewStatusEnum } from './common';
import { users } from './users';
import { inquiries, inquiryItems } from './inquiries';

export const previews = pgTable(
  'previews',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    inquiryId: uuid('inquiry_id')
      .notNull()
      .references(() => inquiries.id),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }).notNull(),
    visitedAt: timestamp('visited_at', { withTimezone: true }),
    assignedTo: uuid('assigned_to')
      .notNull()
      .references(() => users.id),
    notes: text('notes'),
    status: previewStatusEnum('status').notNull().default('scheduled'),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
    createdAt,
  },
  (table) => [
    index('previews_inquiry_id_idx').on(table.inquiryId),
    index('previews_assigned_to_idx').on(table.assignedTo),
    index('previews_created_by_idx').on(table.createdBy),
    index('previews_status_idx').on(table.status),
    index('previews_scheduled_at_idx').on(table.scheduledAt),
  ],
);

export const previewItems = pgTable(
  'preview_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    previewId: uuid('preview_id')
      .notNull()
      .references(() => previews.id),
    inquiryItemId: uuid('inquiry_item_id')
      .notNull()
      .references(() => inquiryItems.id),
    notes: text('notes'),
  },
  (table) => [
    index('preview_items_preview_id_idx').on(table.previewId),
    index('preview_items_inquiry_item_id_idx').on(table.inquiryItemId),
  ],
);

export const previewItemDimensions = pgTable(
  'preview_item_dimensions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    previewItemId: uuid('preview_item_id')
      .notNull()
      .unique()
      .references(() => previewItems.id),
    length: numeric('length').notNull(),
    width: numeric('width').notNull(),
    height: numeric('height').notNull(),
    unit: dimensionUnitEnum('unit').notNull(),
  },
  (table) => [
    nonNegativeQuantityCheck('preview_item_dimensions_length_non_negative', table.length),
    nonNegativeQuantityCheck('preview_item_dimensions_width_non_negative', table.width),
    nonNegativeQuantityCheck('preview_item_dimensions_height_non_negative', table.height),
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
}));

export const previewItemsRelations = relations(previewItems, ({ one }) => ({
  preview: one(previews, {
    fields: [previewItems.previewId],
    references: [previews.id],
  }),
  inquiryItem: one(inquiryItems, {
    fields: [previewItems.inquiryItemId],
    references: [inquiryItems.id],
  }),
  dimensions: one(previewItemDimensions, {
    fields: [previewItems.id],
    references: [previewItemDimensions.previewItemId],
  }),
}));

export const previewItemDimensionsRelations = relations(previewItemDimensions, ({ one }) => ({
  previewItem: one(previewItems, {
    fields: [previewItemDimensions.previewItemId],
    references: [previewItems.id],
  }),
}));
