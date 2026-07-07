import { pgTable, uuid, text, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const countries = pgTable(
  'countries',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    code: text('code').notNull().unique(),
    nameEn: text('name_en').notNull(),
    nameAr: text('name_ar').notNull(),
  },
  (table) => [index('countries_name_en_idx').on(table.nameEn), index('countries_name_ar_idx').on(table.nameAr)],
);

// No country_id — governorates are Egypt-only; country is implied for domestic addresses.
export const governorates = pgTable(
  'governorates',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    nameEn: text('name_en').notNull(),
    nameAr: text('name_ar').notNull(),
  },
  (table) => [index('governorates_name_en_idx').on(table.nameEn), index('governorates_name_ar_idx').on(table.nameAr)],
);

export const cities = pgTable(
  'cities',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    governorateId: uuid('governorate_id')
      .notNull()
      .references(() => governorates.id),
    nameEn: text('name_en').notNull(),
    nameAr: text('name_ar').notNull(),
  },
  (table) => [
    index('cities_governorate_id_idx').on(table.governorateId),
    index('cities_name_en_idx').on(table.nameEn),
    index('cities_name_ar_idx').on(table.nameAr),
  ],
);

// ============================== RELATIONS ==============================

export const governoratesRelations = relations(governorates, ({ many }) => ({
  cities: many(cities),
}));

export const citiesRelations = relations(cities, ({ one }) => ({
  governorate: one(governorates, {
    fields: [cities.governorateId],
    references: [governorates.id],
  }),
}));
