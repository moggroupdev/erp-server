import { pgTable, uuid, text, unique, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { createdAt, numeric, positiveQuantityCheck } from './common';
import { productUnits } from './product-units';
import { materials } from './materials';
import { users } from './users';

export const boms = pgTable(
  'boms',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    productUnitId: uuid('product_unit_id')
      .notNull()
      .references(() => productUnits.id),
    materialCode: text('material_code')
      .notNull()
      .references(() => materials.code),
    quantityRequired: numeric('quantity_required').notNull(), // Quantity of material required
    unitCost: numeric('unit_cost').notNull(), // Historical snapshot at BOM creation
    notes: text('notes'),
    createdAt,
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
  },
  (table) => [
    unique('boms_product_unit_material_unique').on(table.productUnitId, table.materialCode),
    index('boms_product_unit_id_idx').on(table.productUnitId),
    index('boms_material_code_idx').on(table.materialCode),
    index('boms_created_by_idx').on(table.createdBy),
    positiveQuantityCheck('boms_quantity_required_positive', table.quantityRequired),
    positiveQuantityCheck('boms_unit_cost_positive', table.unitCost),
  ],
);

export const bomsRelations = relations(boms, ({ one }) => ({
  productUnit: one(productUnits, {
    fields: [boms.productUnitId],
    references: [productUnits.id],
  }),
  material: one(materials, {
    fields: [boms.materialCode],
    references: [materials.code],
  }),
  createdBy: one(users, {
    fields: [boms.createdBy],
    references: [users.id],
  }),
}));
