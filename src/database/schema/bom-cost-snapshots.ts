import { relations } from 'drizzle-orm';
import { pgTable, uuid, text, unique, index } from 'drizzle-orm/pg-core';
import { createdAt, numeric, positiveQuantityCheck } from './common';
import { productUnits } from './product-units';
import { productStandardBoms } from './products';
import { users } from './users';

export const bomCostSnapshots = pgTable(
  'bom_cost_snapshots',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    productUnitId: uuid('product_unit_id')
      .notNull()
      .references(() => productUnits.id),
    standardBomItemId: uuid('standard_bom_item_id')
      .notNull()
      .references(() => productStandardBoms.id),
    unitCost: numeric('unit_cost').notNull(), // Historical snapshot at BOM creation
    notes: text('notes'),
    createdAt,
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
  },
  (table) => [
    unique('bom_cost_snapshots_product_unit_standard_bom_unique').on(table.productUnitId, table.standardBomItemId),
    index('bom_cost_snapshots_product_unit_id_idx').on(table.productUnitId),
    index('bom_cost_snapshots_standard_bom_item_id_idx').on(table.standardBomItemId),
    index('bom_cost_snapshots_created_by_idx').on(table.createdBy),
    positiveQuantityCheck('bom_cost_snapshots_unit_cost_positive', table.unitCost),
  ],
);

// ============================== RELATIONS ==============================

export const bomCostSnapshotsRelations = relations(bomCostSnapshots, ({ one }) => ({
  productUnit: one(productUnits, {
    fields: [bomCostSnapshots.productUnitId],
    references: [productUnits.id],
  }),
  standardBomItem: one(productStandardBoms, {
    fields: [bomCostSnapshots.standardBomItemId],
    references: [productStandardBoms.id],
  }),
  createdBy: one(users, {
    fields: [bomCostSnapshots.createdBy],
    references: [users.id],
  }),
}));
