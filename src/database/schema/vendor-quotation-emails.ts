import { pgTable, uuid, text, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { createdAt, vendorQuotationEmailStatusEnum } from './common';
import { users } from './users';
import { vendors } from './vendors';

export const vendorQuotationEmails = pgTable(
  'vendor_quotation_emails',
  {
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
  },
  (table) => [
    index('vendor_quotation_emails_vendor_id_idx').on(table.vendorId),
    index('vendor_quotation_emails_created_by_idx').on(table.createdBy),
    index('vendor_quotation_emails_status_idx').on(table.status),
  ],
);

// ============================== RELATIONS ==============================

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
