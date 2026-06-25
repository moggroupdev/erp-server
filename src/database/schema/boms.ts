import { pgTable, uuid, text, unique, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { createdAt, numeric, nonNegativeQuantityCheck } from './common';
import { users } from './users';
import { productUnits } from './product-units';
import { materials } from './materials';

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
    unitCost: numeric('unit_cost').notNull(), // Unit cost of the material at the time of the BOM creation (Historical snapshot)
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
    nonNegativeQuantityCheck('boms_quantity_required_non_negative', table.quantityRequired),
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
