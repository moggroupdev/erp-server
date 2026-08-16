import { relations } from 'drizzle-orm';
import { pgTable, uuid, text, timestamp, boolean, index, foreignKey, integer, unique } from 'drizzle-orm/pg-core';
import {
  createdAt,
  numeric,
    positiveNullableQuantityCheck,
    positiveQuantityCheck,
    productionSubDepartmentEnum,
  legacyIssuePermitWorkOrderTypeEnum,
  materialUnitEnum,
} from './common';
import { users } from './users';
import { materials } from './materials';

// Staging tables for legacy issue permits - used only for seeding; later loaded into inventory_transactions / inventory_transaction_items
export const legacyIssuePermits = pgTable(
  'legacy_issue_permits',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    issuePermitNumber: text('issue_permit_number').notNull().unique(),
    issueOrderNumber: text('issue_order_number').notNull(),
    issueOrderDate: timestamp('issue_order_date', { withTimezone: true }).notNull(),
    date: timestamp('date', { withTimezone: true }).notNull(),
    creatorId: uuid('creator_id').notNull(),
    productionSubDepartment: productionSubDepartmentEnum('production_sub_department'),
    contractNumber: text('contract_number'),
    workOrderNumber: text('work_order_number'),
    workOrderNumberType: legacyIssuePermitWorkOrderTypeEnum('work_order_number_type').notNull().default('base_contract'),
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
    index('legacy_issue_permit_creator_id_idx').on(table.creatorId),
    index('legacy_issue_permit_production_sub_department_idx').on(table.productionSubDepartment),
    index('legacy_issue_permit_date_idx').on(table.date),
    index('legacy_issue_permit_issue_order_date_idx').on(table.issueOrderDate),
    index('legacy_issue_permit_created_at_idx').on(table.createdAt),
    index('legacy_issue_permit_created_by_idx').on(table.createdBy),
    index('legacy_issue_permit_work_order_number_type_idx').on(table.workOrderNumberType),
  ],
);

export const legacyIssuePermitItems = pgTable(
  'legacy_issue_permit_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    issuePermitId: uuid('issue_permit_id').notNull(),
    sequenceOrder: integer('sequence_order').notNull(), // @APP_CHECKED - Sequential display order within the permit
    materialCode: text('material_code').references(() => materials.code),
    unitOfMeasurementSelected: materialUnitEnum('unit_of_measurement_selected'),
    quantity: numeric('quantity'),
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
