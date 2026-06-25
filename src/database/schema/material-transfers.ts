import { pgTable, uuid, text, index, check, foreignKey } from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import { createdAt, numeric } from './common';
import { users } from './users';
import { materials } from './materials';
import { productionPlanItems } from './production-plans';

export const materialTransfers = pgTable(
  'material_transfers',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    code: text('code').unique().notNull(), // Format: MTR-0000001
    notes: text('notes'),
    createdAt,
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
  },
  (table) => [
    index('material_transfers_code_idx').on(table.code),
    index('material_transfers_created_at_idx').on(table.createdAt),
    index('material_transfers_created_by_idx').on(table.createdBy),
  ],
);

export const materialTransferItems = pgTable(
  'material_transfer_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    transferId: uuid('transfer_id').notNull(),
    materialCode: text('material_code')
      .notNull()
      .references(() => materials.code),
    quantity: numeric('quantity').notNull(),
    fromProductionPlanItemId: uuid('from_production_plan_item_id').notNull(),
    toProductionPlanItemId: uuid('to_production_plan_item_id').notNull(),
    notes: text('notes'),
  },
  (table) => [
    foreignKey({
      name: 'mat_transfer_items_transfer_id_fk',
      columns: [table.transferId],
      foreignColumns: [materialTransfers.id],
    }),
    foreignKey({
      name: 'mat_transfer_items_from_pp_item_id_fk',
      columns: [table.fromProductionPlanItemId],
      foreignColumns: [productionPlanItems.id],
    }),
    foreignKey({
      name: 'mat_transfer_items_to_pp_item_id_fk',
      columns: [table.toProductionPlanItemId],
      foreignColumns: [productionPlanItems.id],
    }),
    index('material_transfer_items_transfer_id_idx').on(table.transferId),
    index('material_transfer_items_material_code_idx').on(table.materialCode),
    index('material_transfer_items_from_pp_item_id_idx').on(table.fromProductionPlanItemId),
    index('material_transfer_items_to_pp_item_id_idx').on(table.toProductionPlanItemId),
    check('material_transfer_items_quantity_positive', sql`${table.quantity} > 0`),
    check(
      'material_transfer_items_different_plan_items',
      sql`${table.fromProductionPlanItemId} <> ${table.toProductionPlanItemId}`,
    ),
  ],
);

// ============================== RELATIONS ==============================

export const materialTransfersRelations = relations(materialTransfers, ({ one, many }) => ({
  createdBy: one(users, {
    fields: [materialTransfers.createdBy],
    references: [users.id],
    relationName: 'materialTransferCreatedBy',
  }),
  items: many(materialTransferItems),
}));

export const materialTransferItemsRelations = relations(materialTransferItems, ({ one }) => ({
  transfer: one(materialTransfers, {
    fields: [materialTransferItems.transferId],
    references: [materialTransfers.id],
  }),
  material: one(materials, {
    fields: [materialTransferItems.materialCode],
    references: [materials.code],
  }),
  fromProductionPlanItem: one(productionPlanItems, {
    fields: [materialTransferItems.fromProductionPlanItemId],
    references: [productionPlanItems.id],
    relationName: 'materialTransferItemFromPlanItem',
  }),
  toProductionPlanItem: one(productionPlanItems, {
    fields: [materialTransferItems.toProductionPlanItemId],
    references: [productionPlanItems.id],
    relationName: 'materialTransferItemToPlanItem',
  }),
}));
