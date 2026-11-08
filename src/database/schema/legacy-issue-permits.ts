import { relations, sql } from 'drizzle-orm';
import { pgTable, uuid, text, timestamp, boolean, index, foreignKey, integer, unique, check } from 'drizzle-orm/pg-core';
import {
  createdAt,
  numeric,
  positiveNullableQuantityCheck,
  positiveQuantityCheck,
  productionSubDepartmentEnum,
  legacyIssuePermitTypeEnum,
  legacyIssuePermitMaintenanceOrderTypeEnum,
  materialUnitEnum,
} from './common';
import { users } from './users';
import { materials } from './materials';
import { customers } from './customers';

// Staging tables for legacy issue permits - used only for seeding; later loaded into inventory_transactions / inventory_transaction_items
export const legacyIssuePermits = pgTable(
  'legacy_issue_permits',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    issuePermitNumber: text('issue_permit_number').notNull().unique(),
    issueOrderNumber: text('issue_order_number'),
    issueOrderDate: timestamp('issue_order_date', { withTimezone: true }),
    date: timestamp('date', { withTimezone: true }).notNull(),
    creatorId: uuid('creator_id').notNull(),
    productionSubDepartment: productionSubDepartmentEnum('production_sub_department'),
    permitType: legacyIssuePermitTypeEnum('permit_type').notNull(),
    contractNumber: text('contract_number'),
    maintenanceOrderNumber: text('maintenance_order_number'),
    maintenanceOrderType: legacyIssuePermitMaintenanceOrderTypeEnum('maintenance_order_type'),
    customerId: uuid('customer_id'),
    hasMultipleCustomers: boolean('has_multiple_customers').notNull().default(false),
    isCancelled: boolean('is_cancelled').notNull().default(false),
    notes: text('notes'),
    createdAt,
    createdBy: uuid('created_by').notNull(),
  },
  (table) => [
    foreignKey({
      name: 'lip_creator_id_fk',
      columns: [table.creatorId],
      foreignColumns: [users.id],
    }),
    foreignKey({
      name: 'lip_created_by_fk',
      columns: [table.createdBy],
      foreignColumns: [users.id],
    }),
    foreignKey({
      name: 'lip_customer_id_fk',
      columns: [table.customerId],
      foreignColumns: [customers.id],
    }),
    index('legacy_issue_permit_creator_id_idx').on(table.creatorId),
    index('legacy_issue_permit_production_sub_department_idx').on(table.productionSubDepartment),
    index('legacy_issue_permit_date_idx').on(table.date),
    index('legacy_issue_permit_issue_order_date_idx').on(table.issueOrderDate),
    index('legacy_issue_permit_permit_type_idx').on(table.permitType),
    index('legacy_issue_permit_customer_id_idx').on(table.customerId),
    index('legacy_issue_permit_created_at_idx').on(table.createdAt),
    index('legacy_issue_permit_created_by_idx').on(table.createdBy),
    index('legacy_issue_permit_maintenance_order_type_idx').on(table.maintenanceOrderType),
    check(
      'legacy_issue_permit_issue_order_pair',
      sql`(${table.issueOrderNumber} IS NULL) = (${table.issueOrderDate} IS NULL)`,
    ),
    // Enum literals must match LEGACY_ISSUE_PERMIT_TYPES in src/utils/constants.ts
    check(
      'legacy_issue_permit_contract_number_by_type',
      sql`${table.contractNumber} IS NULL OR ${table.permitType} = 'contract_review'`,
    ),
    check(
      'legacy_issue_permit_maintenance_fields_by_type',
      sql`(${table.maintenanceOrderNumber} IS NULL AND ${table.maintenanceOrderType} IS NULL) OR ${table.permitType} = 'maintenance_order'`,
    ),
    check(
      'legacy_issue_permit_customer_fields_by_type',
      sql`(
        ${table.customerId} IS NULL
        AND ${table.hasMultipleCustomers} = false
      ) OR ${table.permitType} IN ('contract_review', 'maintenance_order')`,
    ),
    check(
      'legacy_issue_permit_production_department_required',
      sql`${table.permitType} <> 'production_department' OR ${table.productionSubDepartment} IS NOT NULL`,
    ),
    check(
      'legacy_issue_permit_multiple_customers_exclusive',
      sql`${table.hasMultipleCustomers} = false OR (
        ${table.customerId} IS NULL
        AND ${table.contractNumber} IS NULL
        AND ${table.maintenanceOrderNumber} IS NULL
      )`,
    ),
  ],
);

export const legacyIssuePermitItems = pgTable(
  'legacy_issue_permit_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    issuePermitId: uuid('issue_permit_id').notNull(),
    sequenceOrder: integer('sequence_order').notNull(), // @APP_CHECKED - Sequential display order within the permit
    materialCode: text('material_code').references(() => materials.code), // @APP_CHECKED - When set, unit_of_measurement_selected and quantity are required
    unitOfMeasurementSelected: materialUnitEnum('unit_of_measurement_selected'), // @APP_CHECKED - Required when material_code is set
    quantity: numeric('quantity'), // @APP_CHECKED - Required when material_code is set
    notes: text('notes'),
  },
  (table) => [
    foreignKey({
      name: 'lipi_issue_permit_id_fk',
      columns: [table.issuePermitId],
      foreignColumns: [legacyIssuePermits.id],
    }),
    unique('legacy_issue_permit_items_permit_sequence_unique').on(table.issuePermitId, table.sequenceOrder),
    index('legacy_issue_permit_items_issue_permit_id_idx').on(table.issuePermitId),
    index('legacy_issue_permit_items_material_code_idx').on(table.materialCode),
    positiveNullableQuantityCheck('legacy_issue_permit_items_quantity_positive', table.quantity),
    positiveQuantityCheck('legacy_issue_permit_items_sequence_order_positive', table.sequenceOrder),
  ],
);

// ============================== RELATIONS ==============================

export const legacyIssuePermitsRelations = relations(legacyIssuePermits, ({ one, many }) => ({
  creator: one(users, {
    fields: [legacyIssuePermits.creatorId],
    references: [users.id],
    relationName: 'legacyIssuePermitCreator',
  }),
  createdBy: one(users, {
    fields: [legacyIssuePermits.createdBy],
    references: [users.id],
    relationName: 'legacyIssuePermitCreatedBy',
  }),
  customer: one(customers, {
    fields: [legacyIssuePermits.customerId],
    references: [customers.id],
  }),
  items: many(legacyIssuePermitItems),
}));

export const legacyIssuePermitItemsRelations = relations(legacyIssuePermitItems, ({ one }) => ({
  issuePermit: one(legacyIssuePermits, {
    fields: [legacyIssuePermitItems.issuePermitId],
    references: [legacyIssuePermits.id],
  }),
  material: one(materials, {
    fields: [legacyIssuePermitItems.materialCode],
    references: [materials.code],
  }),
}));
