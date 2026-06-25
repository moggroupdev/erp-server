import { pgTable, uuid, text, unique, index, foreignKey } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const materialCategoryMains = pgTable(
  'material_category_mains',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    legacyCode: text('legacy_code').notNull().unique(),
    title: text('title').notNull(),
  },
  (table) => [index('material_category_mains_title_idx').on(table.title)],
);

export const materialCategorySubs = pgTable(
  'material_category_subs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    legacyCode: text('legacy_code').notNull(),
    title: text('title').notNull(),
    mainCategoryId: uuid('main_category_id').notNull(),
  },
  (table) => [
    foreignKey({
      name: 'mat_cat_subs_main_cat_id_fk',
      columns: [table.mainCategoryId],
      foreignColumns: [materialCategoryMains.id],
    }),
    unique('material_category_subs_main_legacy_code_unique').on(table.mainCategoryId, table.legacyCode),
    index('material_category_subs_main_category_id_idx').on(table.mainCategoryId),
    index('material_category_subs_title_idx').on(table.title),
  ],
);

export const productCategoryMains = pgTable(
  'product_category_mains',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    legacyCode: text('legacy_code').notNull().unique(),
    title: text('title').notNull(),
  },
  (table) => [index('product_category_mains_title_idx').on(table.title)],
);

export const productCategorySubs = pgTable(
  'product_category_subs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    legacyCode: text('legacy_code').notNull(),
    title: text('title').notNull(),
    mainCategoryId: uuid('main_category_id').notNull(),
  },
  (table) => [
    foreignKey({
      name: 'prod_cat_subs_main_cat_id_fk',
      columns: [table.mainCategoryId],
      foreignColumns: [productCategoryMains.id],
    }),
    unique('product_category_subs_main_legacy_code_unique').on(table.mainCategoryId, table.legacyCode),
    index('product_category_subs_main_category_id_idx').on(table.mainCategoryId),
    index('product_category_subs_title_idx').on(table.title),
  ],
);

// ============================== RELATIONS ==============================

export const materialCategoryMainsRelations = relations(materialCategoryMains, ({ many }) => ({
  subcategories: many(materialCategorySubs),
}));

export const materialCategorySubsRelations = relations(materialCategorySubs, ({ one }) => ({
  mainCategory: one(materialCategoryMains, {
    fields: [materialCategorySubs.mainCategoryId],
    references: [materialCategoryMains.id],
  }),
}));

export const productCategoryMainsRelations = relations(productCategoryMains, ({ many }) => ({
  subcategories: many(productCategorySubs),
}));

export const productCategorySubsRelations = relations(productCategorySubs, ({ one }) => ({
  mainCategory: one(productCategoryMains, {
    fields: [productCategorySubs.mainCategoryId],
    references: [productCategoryMains.id],
  }),
}));
