import { relations, sql } from 'drizzle-orm';
import { pgTable, uuid, text, timestamp, index, foreignKey, check, unique, integer } from 'drizzle-orm/pg-core';
import { createdAt, numeric, positiveQuantityCheck, materialUnitEnum } from './common';
import { users } from './users';
import { suppliers } from './suppliers';
import { materials } from './materials';

// Status is derived: draft (no issued_at), issued, closed (closed_at), cancelled (cancelled_at).
export const requestForQuotations = pgTable(
  'request_for_quotations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    code: text('code').unique().notNull(), // Format: RFQ-00000001
    responseDeadline: timestamp('response_deadline', { withTimezone: true }), // Required once issued_at is set
    notes: text('notes'),
    issuedAt: timestamp('issued_at', { withTimezone: true }),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    createdAt,
    updatedAt: timestamp('updated_at', { withTimezone: true }), // Null until the first successful update
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
  },
  (table) => [
    index('rfq_response_deadline_idx').on(table.responseDeadline),
    index('rfq_issued_at_idx').on(table.issuedAt),
    index('rfq_closed_at_idx').on(table.closedAt),
    index('rfq_cancelled_at_idx').on(table.cancelledAt),
    index('rfq_created_at_idx').on(table.createdAt),
    index('rfq_created_by_idx').on(table.createdBy),
    check(
      'rfq_deadline_required_when_issued',
      sql`${table.issuedAt} IS NULL OR ${table.responseDeadline} IS NOT NULL`,
    ),
    check('rfq_closed_requires_issued', sql`${table.closedAt} IS NULL OR ${table.issuedAt} IS NOT NULL`),
    check('rfq_closed_cancelled_exclusive', sql`${table.closedAt} IS NULL OR ${table.cancelledAt} IS NULL`),
  ],
);

export const requestForQuotationItems = pgTable(
  'request_for_quotation_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    requestForQuotationId: uuid('request_for_quotation_id').notNull(),
    materialCode: text('material_code').notNull(),
    unitOfMeasurementSelected: materialUnitEnum('unit_of_measurement_selected').notNull(), // @APP_CHECKED - Must be the material's base unit or one of its conversions
    quantityRequested: numeric('quantity_requested').notNull(),
    notes: text('notes'),
  },
  (table) => [
    foreignKey({
      name: 'rfqi_rfq_id_fk',
      columns: [table.requestForQuotationId],
      foreignColumns: [requestForQuotations.id],
    }),
    foreignKey({
      name: 'rfqi_material_code_fk',
      columns: [table.materialCode],
      foreignColumns: [materials.code],
    }),
    index('rfqi_rfq_id_idx').on(table.requestForQuotationId),
    index('rfqi_material_code_idx').on(table.materialCode),
    unique('rfqi_rfq_material_unique').on(table.requestForQuotationId, table.materialCode),
    unique('rfqi_id_rfq_id_unique').on(table.id, table.requestForQuotationId),
    unique('rfqi_id_material_unique').on(table.id, table.materialCode),
    positiveQuantityCheck('rfqi_quantity_requested_positive', table.quantityRequested),
  ],
);

// One row per RFQ and supplier: invitation until submitted_at, or declined. Separate from supplier_quotation_emails.
export const supplierQuotations = pgTable(
  'supplier_quotations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    requestForQuotationId: uuid('request_for_quotation_id').notNull(),
    supplierId: uuid('supplier_id')
      .notNull()
      .references(() => suppliers.id),
    paymentTerms: text('payment_terms'),
    deliveryTerms: text('delivery_terms'),
    deliveryPeriodDays: integer('delivery_period_days'), // Required when submitted; comparison key
    validUntil: timestamp('valid_until', { withTimezone: true }), // Required when submitted
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    declinedAt: timestamp('declined_at', { withTimezone: true }),
    notes: text('notes'),
    createdAt,
    updatedAt: timestamp('updated_at', { withTimezone: true }), // Null until the first successful update
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
  },
  (table) => [
    foreignKey({
      name: 'sq_rfq_id_fk',
      columns: [table.requestForQuotationId],
      foreignColumns: [requestForQuotations.id],
    }),
    index('sq_rfq_id_idx').on(table.requestForQuotationId),
    index('sq_supplier_id_idx').on(table.supplierId),
    index('sq_submitted_at_idx').on(table.submittedAt),
    index('sq_declined_at_idx').on(table.declinedAt),
    index('sq_valid_until_idx').on(table.validUntil),
    index('sq_created_at_idx').on(table.createdAt),
    index('sq_created_by_idx').on(table.createdBy),
    unique('sq_rfq_supplier_unique').on(table.requestForQuotationId, table.supplierId),
    unique('sq_id_rfq_id_unique').on(table.id, table.requestForQuotationId),
    unique('sq_id_supplier_id_unique').on(table.id, table.supplierId),
    check('sq_submitted_declined_exclusive', sql`${table.submittedAt} IS NULL OR ${table.declinedAt} IS NULL`),
    check(
      'sq_declined_clears_commercial',
      sql`${table.declinedAt} IS NULL OR (
        ${table.paymentTerms} IS NULL
        AND ${table.deliveryTerms} IS NULL
        AND ${table.deliveryPeriodDays} IS NULL
        AND ${table.validUntil} IS NULL
      )`,
    ),
    check(
      'sq_submitted_requires_commercial',
      sql`${table.submittedAt} IS NULL OR (
        ${table.validUntil} IS NOT NULL
        AND ${table.deliveryPeriodDays} IS NOT NULL
      )`,
    ),
    check(
      'sq_delivery_period_days_positive',
      sql`${table.deliveryPeriodDays} IS NULL OR ${table.deliveryPeriodDays} > 0`,
    ),
  ],
);

export const supplierQuotationItems = pgTable(
  'supplier_quotation_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    supplierQuotationId: uuid('supplier_quotation_id').notNull(),
    requestForQuotationItemId: uuid('request_for_quotation_item_id').notNull(),
    requestForQuotationId: uuid('request_for_quotation_id').notNull(), // Composite-FK integrity copy of the quotation's and the RFQ line's request_for_quotation_id
    materialCode: text('material_code').notNull(), // Composite-FK integrity copy of the RFQ line's material_code
    unitOfMeasurementSelected: materialUnitEnum('unit_of_measurement_selected').notNull(), // @APP_CHECKED - Must be the material's base unit or one of its conversions; may differ from the RFQ line
    unitPrice: numeric('unit_price').notNull(),
    notes: text('notes'),
  },
  (table) => [
    foreignKey({
      name: 'sqi_sq_rfq_fk',
      columns: [table.supplierQuotationId, table.requestForQuotationId],
      foreignColumns: [supplierQuotations.id, supplierQuotations.requestForQuotationId],
    }),
    foreignKey({
      name: 'sqi_rfqi_rfq_fk',
      columns: [table.requestForQuotationItemId, table.requestForQuotationId],
      foreignColumns: [requestForQuotationItems.id, requestForQuotationItems.requestForQuotationId],
    }),
    foreignKey({
      name: 'sqi_rfqi_material_fk',
      columns: [table.requestForQuotationItemId, table.materialCode],
      foreignColumns: [requestForQuotationItems.id, requestForQuotationItems.materialCode],
    }),
    index('sqi_sq_id_idx').on(table.supplierQuotationId),
    index('sqi_rfqi_id_idx').on(table.requestForQuotationItemId),
    index('sqi_rfq_id_idx').on(table.requestForQuotationId),
    index('sqi_material_code_idx').on(table.materialCode),
    unique('sqi_sq_rfqi_unique').on(table.supplierQuotationId, table.requestForQuotationItemId),
    unique('sqi_id_material_unique').on(table.id, table.materialCode),
    positiveQuantityCheck('sqi_unit_price_positive', table.unitPrice),
  ],
);

// ============================== RELATIONS ==============================

export const requestForQuotationsRelations = relations(requestForQuotations, ({ one, many }) => ({
  createdBy: one(users, {
    fields: [requestForQuotations.createdBy],
    references: [users.id],
    relationName: 'requestForQuotationCreatedBy',
  }),
  items: many(requestForQuotationItems),
  supplierQuotations: many(supplierQuotations),
}));

export const requestForQuotationItemsRelations = relations(requestForQuotationItems, ({ one, many }) => ({
  requestForQuotation: one(requestForQuotations, {
    fields: [requestForQuotationItems.requestForQuotationId],
    references: [requestForQuotations.id],
  }),
  material: one(materials, {
    fields: [requestForQuotationItems.materialCode],
    references: [materials.code],
  }),
  supplierQuotationItems: many(supplierQuotationItems),
}));

export const supplierQuotationsRelations = relations(supplierQuotations, ({ one, many }) => ({
  requestForQuotation: one(requestForQuotations, {
    fields: [supplierQuotations.requestForQuotationId],
    references: [requestForQuotations.id],
  }),
  supplier: one(suppliers, {
    fields: [supplierQuotations.supplierId],
    references: [suppliers.id],
    relationName: 'supplierQuotationSupplier',
  }),
  createdBy: one(users, {
    fields: [supplierQuotations.createdBy],
    references: [users.id],
    relationName: 'supplierQuotationCreatedBy',
  }),
  items: many(supplierQuotationItems),
}));

export const supplierQuotationItemsRelations = relations(supplierQuotationItems, ({ one }) => ({
  supplierQuotation: one(supplierQuotations, {
    fields: [supplierQuotationItems.supplierQuotationId],
    references: [supplierQuotations.id],
  }),
  requestForQuotationItem: one(requestForQuotationItems, {
    fields: [supplierQuotationItems.requestForQuotationItemId],
    references: [requestForQuotationItems.id],
  }),
  requestForQuotation: one(requestForQuotations, {
    fields: [supplierQuotationItems.requestForQuotationId],
    references: [requestForQuotations.id],
  }),
  material: one(materials, {
    fields: [supplierQuotationItems.materialCode],
    references: [materials.code],
    relationName: 'supplierQuotationItemMaterial',
  }),
}));
