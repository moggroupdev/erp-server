import { pgTable, uuid, text, timestamp } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { createdAt, previewStatusEnum } from './common';
import { users } from './users';
import { inquiries, inquiryItems } from './inquiries';

export const previews = pgTable('previews', {
  id: uuid('id').defaultRandom().primaryKey(),
  inquiryId: uuid('inquiry_id')
    .notNull()
    .references(() => inquiries.id),
  scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
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
});

export const previewItems = pgTable('preview_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  previewId: uuid('preview_id')
    .notNull()
    .references(() => previews.id),
  inquiryItemId: uuid('inquiry_item_id')
    .notNull()
    .references(() => inquiryItems.id),
  dimensions: text('dimensions'),
  notes: text('notes'),
});

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
}));
