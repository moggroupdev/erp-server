import { pgTable, uuid, text, unique } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const materialCategoryMains = pgTable('material_category_mains', {
  id: uuid('id').defaultRandom().primaryKey(),
  code: text('code').notNull().unique(),
  nameEn: text('name_en').notNull(),
  nameAr: text('name_ar').notNull(),
});

export const materialCategorySubs = pgTable(
  'material_category_subs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    code: text('code').notNull(),
    nameEn: text('name_en').notNull(),
    nameAr: text('name_ar').notNull(),
    mainCategoryId: uuid('main_category_id')
      .notNull()
      .references(() => materialCategoryMains.id),
  },
  (table) => [unique('material_category_subs_main_code_unique').on(table.mainCategoryId, table.code)],
);

export const productCategoryMains = pgTable('product_category_mains', {
  id: uuid('id').defaultRandom().primaryKey(),
  code: text('code').notNull().unique(),
  nameEn: text('name_en').notNull(),
  nameAr: text('name_ar').notNull(),
});

export const productCategorySubs = pgTable(
  'product_category_subs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    code: text('code').notNull(),
    nameEn: text('name_en').notNull(),
    nameAr: text('name_ar').notNull(),
    mainCategoryId: uuid('main_category_id')
      .notNull()
      .references(() => productCategoryMains.id),
  },
  (table) => [unique('product_category_subs_main_code_unique').on(table.mainCategoryId, table.code)],
);

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
