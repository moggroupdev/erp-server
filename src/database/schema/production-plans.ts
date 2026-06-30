import { relations, sql } from 'drizzle-orm';
import { pgTable, uuid, text, timestamp, check, index, foreignKey, unique } from 'drizzle-orm/pg-core';
import { createdAt } from './common';
import { inventoryTransactionItems } from './inventory-transactions';
import { productUnits } from './product-units';
import { users } from './users';
import { departments } from './departments';

export const productionPlans = pgTable(
  'production_plans',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    code: text('code').unique().notNull(), // Format: PPL-00000001
    name: text('name').notNull(),
    startDate: timestamp('start_date', { withTimezone: true }).notNull(),
    endDate: timestamp('end_date', { withTimezone: true }).notNull(),
    notes: text('notes'),
    createdAt,
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
  },
  (table) => [
    index('production_plans_code_idx').on(table.code),
    index('production_plans_name_idx').on(table.name),
    index('production_plans_start_date_idx').on(table.startDate),
    index('production_plans_end_date_idx').on(table.endDate),
    check('production_plans_end_date_gte_start_date', sql`${table.endDate} >= ${table.startDate}`),
  ],
);

export const productionPlanItems = pgTable(
  'production_plan_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    planId: uuid('plan_id')
      .notNull()
      .references(() => productionPlans.id),
    productUnitId: uuid('product_unit_id')
      .notNull()
      .references(() => productUnits.id),
    productionDepartmentId: uuid('production_department_id') // app-synced (Should be a PRODUCTION department)
      .notNull()
      .references(() => departments.id),
    startDate: timestamp('start_date', { withTimezone: true }),
    estimatedEndDate: timestamp('estimated_end_date', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }), // Set when parent product unit is cancelled
    notes: text('notes'),
  },
  (table) => [
    index('production_plan_items_plan_id_idx').on(table.planId),
    index('production_plan_items_product_unit_id_idx').on(table.productUnitId),
    index('production_plan_items_production_department_id_idx').on(table.productionDepartmentId),
    index('production_plan_items_completed_at_idx').on(table.completedAt),
    index('production_plan_items_cancelled_at_idx').on(table.cancelledAt),
    unique('production_plan_items_plan_unit_dept_unique').on(
      table.planId,
      table.productUnitId,
      table.productionDepartmentId,
    ),
    check(
      'production_plan_items_estimated_end_date_gte_start_date',
      sql`${table.estimatedEndDate} IS NULL OR ${table.startDate} IS NULL OR ${table.estimatedEndDate} >= ${table.startDate}`,
    ),
    check(
      'production_plan_items_completed_at_gte_start_date',
      sql`${table.completedAt} IS NULL OR ${table.startDate} IS NULL OR ${table.completedAt} >= ${table.startDate}`,
    ),
    check(
      'production_plan_items_completed_cancelled_exclusive',
      sql`${table.completedAt} IS NULL OR ${table.cancelledAt} IS NULL`,
    ),
  ],
);

export const productionPlanItemNotes = pgTable(
  'production_plan_item_notes',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    planItemId: uuid('plan_item_id').notNull(),
    note: text('note').notNull(),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
    createdAt,
  },
  (table) => [
    foreignKey({
      name: 'pp_item_notes_plan_item_id_fk',
      columns: [table.planItemId],
      foreignColumns: [productionPlanItems.id],
    }),
    index('production_plan_item_notes_plan_item_id_idx').on(table.planItemId),
    index('production_plan_item_notes_created_by_idx').on(table.createdBy),
  ],
);

// ============================== RELATIONS ==============================

export const productionPlansRelations = relations(productionPlans, ({ one, many }) => ({
  createdBy: one(users, {
    fields: [productionPlans.createdBy],
    references: [users.id],
  }),
  items: many(productionPlanItems),
}));

export const productionPlanItemsRelations = relations(productionPlanItems, ({ one, many }) => ({
  plan: one(productionPlans, {
    fields: [productionPlanItems.planId],
    references: [productionPlans.id],
  }),
  productUnit: one(productUnits, {
    fields: [productionPlanItems.productUnitId],
    references: [productUnits.id],
  }),
  productionDepartment: one(departments, {
    fields: [productionPlanItems.productionDepartmentId],
    references: [departments.id],
  }),
  notes: many(productionPlanItemNotes),
  inventoryTransactionItems: many(inventoryTransactionItems),
}));

export const productionPlanItemNotesRelations = relations(productionPlanItemNotes, ({ one }) => ({
  planItem: one(productionPlanItems, {
    fields: [productionPlanItemNotes.planItemId],
    references: [productionPlanItems.id],
  }),
  createdBy: one(users, {
    fields: [productionPlanItemNotes.createdBy],
    references: [users.id],
  }),
}));
