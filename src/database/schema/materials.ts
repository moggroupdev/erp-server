import { relations, sql } from 'drizzle-orm';
import { pgTable, text, uuid, index, foreignKey, unique, check } from 'drizzle-orm/pg-core';
import {
  createdAt,
  deletedAt,
  numeric,
  materialUnitEnum,
  materialTypeEnum,
  nonNegativeQuantityCheck,
  nonNegativeNullableQuantityCheck,
  positiveQuantityCheck,
} from './common';
import { materialCategorySubs } from './categories';
import { users } from './users';
import { materialPurchaseOrderItems } from './purchasing-materials';
import { inventoryTransactionItems } from './inventory-transactions';
import { productStandardBoms } from './products';
import { outsourcingOrderItems } from './outsourcing';

export const materials = pgTable(
  'materials',
  {
    code: text('code').primaryKey(),
    legacyCode: text('legacy_code').unique(),
    title: text('title').notNull(),
    description: text('description'),
    subCategoryId: uuid('sub_category_id')
      .notNull()
      .references(() => materialCategorySubs.id),
    materialType: materialTypeEnum('material_type').notNull(),
    unitOfMeasurement: materialUnitEnum('unit_of_measurement').notNull(),
    unitPrice: numeric('unit_price').notNull().default(0), // @CACHING_APP_SYNCED - Cached unit price derived from inventory_transaction_items per costing method
    quantity: numeric('quantity').notNull().default(0), // @CACHING_APP_SYNCED - Cached net quantity from inventory_transaction_items (receipt/issue/return)
    openingUnitPrice: numeric('opening_unit_price').default(0), // Unit price at the start of the project
    openingQuantity: numeric('opening_quantity').default(0), // Quantity on hand at the start of the project
    minimumStock: numeric('minimum_stock'),
    deletedAt,
    createdAt,
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
  },
  (table) => [
    index('materials_title_idx').on(table.title),
    index('materials_sub_category_id_idx').on(table.subCategoryId),
    nonNegativeQuantityCheck('materials_unit_price_non_negative', table.unitPrice),
    nonNegativeQuantityCheck('materials_quantity_non_negative', table.quantity),
    nonNegativeNullableQuantityCheck('materials_opening_unit_price_non_negative', table.openingUnitPrice),
    nonNegativeNullableQuantityCheck('materials_opening_quantity_non_negative', table.openingQuantity),
    nonNegativeNullableQuantityCheck('materials_minimum_stock_non_negative', table.minimumStock),
  ],
);

// Alternate units for a material with fixed conversion factors into materials.unit_of_measurement (base unit).
export const materialUnitConversions = pgTable(
  'material_unit_conversions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    materialCode: text('material_code')
      .notNull()
      .references(() => materials.code),
    unit: materialUnitEnum('unit').notNull(), // @APP_CHECKED - must differ from materials.unit_of_measurement
    conversionFactorToBase: numeric('conversion_factor_to_base').notNull(), // 1 `unit` = conversionFactorToBase base units
    createdAt,
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
  },
  (table) => [
    unique('muc_material_unit_unique').on(table.materialCode, table.unit),
    index('muc_material_code_idx').on(table.materialCode),
    positiveQuantityCheck('muc_conversion_factor_positive', table.conversionFactorToBase),
  ],
);

// Standard BOM template for a manufactured material (material with material_type = 'manufactured_material').
export const manufacturedMaterialBoms = pgTable(
  'manufactured_material_boms',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    manufacturedMaterialCode: text('manufactured_material_code').notNull(), // @APP_CHECKED - materials.code with material_type = 'manufactured_material'
    materialCode: text('material_code').notNull(), // Component material
    quantityRequired: numeric('quantity_required').notNull(),
    notes: text('notes'),
    createdAt,
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
  },
  (table) => [
    foreignKey({
      name: 'mmb_manufactured_material_code_fk',
      columns: [table.manufacturedMaterialCode],
      foreignColumns: [materials.code],
    }),
    foreignKey({
      name: 'mmb_material_code_fk',
      columns: [table.materialCode],
      foreignColumns: [materials.code],
    }),
    unique('manufactured_material_boms_manufactured_material_material_unique').on(
      table.manufacturedMaterialCode,
      table.materialCode,
    ),
    index('manufactured_material_boms_manufactured_material_code_idx').on(table.manufacturedMaterialCode),
    index('manufactured_material_boms_material_code_idx').on(table.materialCode),
    check('manufactured_material_boms_no_self_reference', sql`${table.manufacturedMaterialCode} <> ${table.materialCode}`),
    positiveQuantityCheck('manufactured_material_boms_quantity_required_positive', table.quantityRequired),
  ],
);

// ============================== RELATIONS ==============================

export const materialsRelations = relations(materials, ({ one, many }) => ({
  createdBy: one(users, {
    fields: [materials.createdBy],
    references: [users.id],
  }),
  subCategory: one(materialCategorySubs, {
    fields: [materials.subCategoryId],
    references: [materialCategorySubs.id],
  }),
  purchaseOrderItems: many(materialPurchaseOrderItems),
  inventoryTransactionItems: many(inventoryTransactionItems),
  productStandardBoms: many(productStandardBoms),
  unitConversions: many(materialUnitConversions),
  manufacturedMaterialBoms: many(manufacturedMaterialBoms, {
    relationName: 'manufacturedMaterialBomManufacturedMaterial',
  }),
  componentOfManufacturedMaterialBoms: many(manufacturedMaterialBoms, {
    relationName: 'manufacturedMaterialBomMaterial',
  }),
  outsourcingOrderItems: many(outsourcingOrderItems),
}));

export const materialUnitConversionsRelations = relations(materialUnitConversions, ({ one }) => ({
  material: one(materials, {
    fields: [materialUnitConversions.materialCode],
    references: [materials.code],
  }),
  createdBy: one(users, {
    fields: [materialUnitConversions.createdBy],
    references: [users.id],
  }),
}));

export const manufacturedMaterialBomsRelations = relations(manufacturedMaterialBoms, ({ one }) => ({
  manufacturedMaterial: one(materials, {
    fields: [manufacturedMaterialBoms.manufacturedMaterialCode],
    references: [materials.code],
    relationName: 'manufacturedMaterialBomManufacturedMaterial',
  }),
  material: one(materials, {
    fields: [manufacturedMaterialBoms.materialCode],
    references: [materials.code],
    relationName: 'manufacturedMaterialBomMaterial',
  }),
  createdBy: one(users, {
    fields: [manufacturedMaterialBoms.createdBy],
    references: [users.id],
  }),
}));
