import { pgTable, uuid, text } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { governorates } from './governorates';

export const cities = pgTable('cities', {
  id: uuid('id').defaultRandom().primaryKey(),
  governorateId: uuid('governorate_id')
    .notNull()
    .references(() => governorates.id),
  nameEn: text('name_en').notNull(),
  nameAr: text('name_ar').notNull(),
});

export const citiesRelations = relations(cities, ({ one }) => ({
  governorate: one(governorates, {
    fields: [cities.governorateId],
    references: [governorates.id],
  }),
}));
