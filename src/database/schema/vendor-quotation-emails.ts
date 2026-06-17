import { pgTable, uuid, text } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { createdAt, vendorQuotationEmailStatusEnum } from './common';
import { users } from './users';
import { vendors } from './vendors';

export const vendorQuotationEmails = pgTable('vendor_quotation_emails', {
  id: uuid('id').defaultRandom().primaryKey(),
  vendorId: uuid('vendor_id')
    .notNull()
    .references(() => vendors.id),
  recipientEmail: text('recipient_email').notNull(),
  subject: text('subject').notNull(),
  body: text('body').notNull(),
  status: vendorQuotationEmailStatusEnum('status').notNull().default('draft'),
  createdBy: uuid('created_by')
    .notNull()
    .references(() => users.id),
  createdAt,
});

export const vendorQuotationEmailsRelations = relations(vendorQuotationEmails, ({ one }) => ({
  vendor: one(vendors, {
    fields: [vendorQuotationEmails.vendorId],
    references: [vendors.id],
  }),
  createdBy: one(users, {
    fields: [vendorQuotationEmails.createdBy],
    references: [users.id],
    relationName: 'vendorQuotationEmailCreatedBy',
  }),
}));
