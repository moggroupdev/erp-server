import { relations } from 'drizzle-orm';
import { pgTable, uuid, text, timestamp, boolean, index, foreignKey } from 'drizzle-orm/pg-core';
import {
  createdAt,
  numeric,
  positiveQuantityCheck,
  productionSubDepartmentEnum,
  legacyWorkOrderTypeEnum,
  materialUnitEnum,
} from './common';
import { users } from './users';
import { materials } from './materials';

// Staging tables for legacy issue transactions - used only for seeding; later loaded into inventory_transactions / inventory_transaction_items
export const legacyInventoryTransactions = pgTable(
  'legacy_inventory_transactions',
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
    workOrderNumberType: legacyWorkOrderTypeEnum('work_order_number_type').notNull().default('base_contract'),
    isCancelled: boolean('is_cancelled').notNull().default(false),
    notes: text('notes'),
    createdAt,
    createdBy: uuid('created_by').notNull(),
  },
  (table) => [
    foreignKey({
      name: 'lit_creator_id_fk',
      columns: [table.creatorId],
      foreignColumns: [users.id],
    }),
    foreignKey({
      name: 'lit_created_by_fk',
      columns: [table.createdBy],
      foreignColumns: [users.id],
    }),
    index('legacy_inv_tx_creator_id_idx').on(table.creatorId),
    index('legacy_inv_tx_production_sub_department_idx').on(table.productionSubDepartment),
    index('legacy_inv_tx_date_idx').on(table.date),
    index('legacy_inv_tx_issue_order_date_idx').on(table.issueOrderDate),
    index('legacy_inv_tx_created_at_idx').on(table.createdAt),
    index('legacy_inv_tx_created_by_idx').on(table.createdBy),
    index('legacy_inv_tx_work_order_number_type_idx').on(table.workOrderNumberType),
  ],
);

export const legacyInventoryTransactionItems = pgTable(
  'legacy_inventory_transaction_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    legacyTransactionId: uuid('legacy_transaction_id').notNull(),
    materialCode: text('material_code')
      .notNull()
      .references(() => materials.code),
    unitOfMeasurementSelected: materialUnitEnum('unit_of_measurement_selected').notNull(),
    quantity: numeric('quantity').notNull(),
    notes: text('notes'),
  },
  (table) => [
    foreignKey({
      name: 'liti_legacy_tx_id_fk',
      columns: [table.legacyTransactionId],
      foreignColumns: [legacyInventoryTransactions.id],
    }),
    index('legacy_inv_tx_items_legacy_transaction_id_idx').on(table.legacyTransactionId),
    index('legacy_inv_tx_items_material_code_idx').on(table.materialCode),
    positiveQuantityCheck('legacy_inv_tx_items_quantity_positive', table.quantity),
  ],
);

// ============================== RELATIONS ==============================

export const legacyInventoryTransactionsRelations = relations(legacyInventoryTransactions, ({ one, many }) => ({
  creator: one(users, {
    fields: [legacyInventoryTransactions.creatorId],
    references: [users.id],
    relationName: 'legacyInventoryTransactionCreator',
  }),
  createdBy: one(users, {
    fields: [legacyInventoryTransactions.createdBy],
    references: [users.id],
    relationName: 'legacyInventoryTransactionCreatedBy',
  }),
  items: many(legacyInventoryTransactionItems),
}));

export const legacyInventoryTransactionItemsRelations = relations(legacyInventoryTransactionItems, ({ one }) => ({
  legacyTransaction: one(legacyInventoryTransactions, {
    fields: [legacyInventoryTransactionItems.legacyTransactionId],
    references: [legacyInventoryTransactions.id],
  }),
  material: one(materials, {
    fields: [legacyInventoryTransactionItems.materialCode],
    references: [materials.code],
  }),
}));