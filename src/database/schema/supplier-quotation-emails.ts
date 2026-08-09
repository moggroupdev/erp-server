import { pgTable, uuid, text, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { createdAt, supplierQuotationEmailStatusEnum } from './common';
import { users } from './users';
import { suppliers } from './suppliers';

export const supplierQuotationEmails = pgTable(
  'supplier_quotation_emails',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    supplierId: uuid('supplier_id')
      .notNull()
      .references(() => suppliers.id),
    recipientEmail: text('recipient_email').notNull(),
    subject: text('subject').notNull(),
    body: text('body').notNull(),
    status: supplierQuotationEmailStatusEnum('status').notNull().default('draft'),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
    createdAt,
  },
  (table) => [
    index('supplier_quotation_emails_supplier_id_idx').on(table.supplierId),
    index('supplier_quotation_emails_status_idx').on(table.status),
    index('supplier_quotation_emails_created_at_idx').on(table.createdAt),
    index('supplier_quotation_emails_created_by_idx').on(table.createdBy),
  ],
);

// ============================== RELATIONS ==============================

export const supplierQuotationEmailsRelations = relations(supplierQuotationEmails, ({ one }) => ({
  supplier: one(suppliers, {
    fields: [supplierQuotationEmails.supplierId],
    references: [suppliers.id],
  }),
  createdBy: one(users, {
    fields: [supplierQuotationEmails.createdBy],
    references: [users.id],
    relationName: 'supplierQuotationEmailCreatedBy',
  }),
}));
