import { pgTable, uuid, text, timestamp, integer, unique, check, index, foreignKey } from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import { createdAt, productionStageEnum, nonNegativeQuantityCheck } from './common';
import { users } from './users';
import { orderItems } from './orders';

export const productionPlans = pgTable(
  'production_plans',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    code: text('code').unique().notNull(), // Format: PP-000001
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
    orderItemId: uuid('order_item_id')
      .notNull()
      .references(() => orderItems.id),
    stage: productionStageEnum('stage').notNull(),
    startDate: timestamp('start_date', { withTimezone: true }),
    estimatedEndDate: timestamp('estimated_end_date', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    quantityPlanned: integer('quantity_planned').notNull().default(1),
    quantityCompleted: integer('quantity_completed').notNull().default(0),
    notes: text('notes'),
  },
  (table) => [
    unique('production_plan_items_plan_order_stage_unique').on(table.planId, table.orderItemId, table.stage),
    index('production_plan_items_plan_id_idx').on(table.planId),
    index('production_plan_items_order_item_id_idx').on(table.orderItemId),
    nonNegativeQuantityCheck('production_plan_items_quantity_planned_non_negative', table.quantityPlanned),
    nonNegativeQuantityCheck('production_plan_items_quantity_completed_non_negative', table.quantityCompleted),
    check(
      'production_plan_items_quantity_completed_lte_planned',
      sql`${table.quantityCompleted} <= ${table.quantityPlanned}`,
    ),
    check(
      'production_plan_items_estimated_end_date_gte_start_date',
      sql`${table.estimatedEndDate} IS NULL OR ${table.startDate} IS NULL OR ${table.estimatedEndDate} >= ${table.startDate}`,
    ),
    check(
      'production_plan_items_completed_at_gte_start_date',
      sql`${table.completedAt} IS NULL OR ${table.startDate} IS NULL OR ${table.completedAt} >= ${table.startDate}`,
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
  orderItem: one(orderItems, {
    fields: [productionPlanItems.orderItemId],
    references: [orderItems.id],
  }),
  notes: many(productionPlanItemNotes),
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
