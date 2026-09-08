import { relations, sql } from 'drizzle-orm';
import { pgTable, uuid, text, timestamp, index, foreignKey, check, unique } from 'drizzle-orm/pg-core';
import { createdAt, numeric, nonNegativeNullableQuantityCheck } from './common';
import { users } from './users';
import { suppliers } from './suppliers';
import { materialPurchaseOrders } from './purchasing-materials';
import { outsourcingOrders } from './outsourcing';

export const supplierInvoices = pgTable(
  'supplier_invoices',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    invoiceNumber: text('invoice_number').notNull(), // Unique per supplier (see sinv_supplier_invoice_number_unique)
    issuedAt: timestamp('issued_at', { withTimezone: true }),
    totalPurchases: numeric('total_purchases'),
    totalDiscount: numeric('total_discount'),
    vatAmount: numeric('vat_amount'),
    withholdingTaxAmount: numeric('withholding_tax_amount'),
    totalAmount: numeric('total_amount'),
    materialPurchaseOrderId: uuid('material_purchase_order_id'),
    outsourcingOrderId: uuid('outsourcing_order_id'),
    supplierId: uuid('supplier_id') // @RFP_APP_CHECKED - Copy from linked order's supplier_id on insert; must match parent
      .notNull()
      .references(() => suppliers.id),
    createdAt,
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
  },
  (table) => [
    foreignKey({
      name: 'sinv_mpo_id_fk',
      columns: [table.materialPurchaseOrderId],
      foreignColumns: [materialPurchaseOrders.id],
    }),
    foreignKey({
      name: 'sinv_oso_id_fk',
      columns: [table.outsourcingOrderId],
      foreignColumns: [outsourcingOrders.id],
    }),
    index('sinv_mpo_id_idx').on(table.materialPurchaseOrderId),
    index('sinv_oso_id_idx').on(table.outsourcingOrderId),
    index('sinv_supplier_id_idx').on(table.supplierId),
    index('sinv_issued_at_idx').on(table.issuedAt),
    index('sinv_created_at_idx').on(table.createdAt),
    index('sinv_created_by_idx').on(table.createdBy),
    unique('sinv_supplier_invoice_number_unique').on(table.supplierId, table.invoiceNumber),
    check(
      'sinv_link_exclusive',
      sql`num_nonnulls(${table.materialPurchaseOrderId}, ${table.outsourcingOrderId}) = 1`,
    ),
    nonNegativeNullableQuantityCheck('sinv_total_purchases_non_negative', table.totalPurchases),
    nonNegativeNullableQuantityCheck('sinv_total_discount_non_negative', table.totalDiscount),
    nonNegativeNullableQuantityCheck('sinv_vat_amount_non_negative', table.vatAmount),
    nonNegativeNullableQuantityCheck('sinv_withholding_tax_amount_non_negative', table.withholdingTaxAmount),
    nonNegativeNullableQuantityCheck('sinv_total_amount_non_negative', table.totalAmount),
  ],
);

// ============================== RELATIONS ==============================

export const supplierInvoicesRelations = relations(supplierInvoices, ({ one }) => ({
  materialPurchaseOrder: one(materialPurchaseOrders, {
    fields: [supplierInvoices.materialPurchaseOrderId],
    references: [materialPurchaseOrders.id],
  }),
  outsourcingOrder: one(outsourcingOrders, {
    fields: [supplierInvoices.outsourcingOrderId],
    references: [outsourcingOrders.id],
  }),
  supplier: one(suppliers, {
    fields: [supplierInvoices.supplierId],
    references: [suppliers.id],
  }),
  createdBy: one(users, {
    fields: [supplierInvoices.createdBy],
    references: [users.id],
    relationName: 'supplierInvoiceCreatedBy',
  }),
}));
