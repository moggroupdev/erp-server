import { pgTable, uuid, text, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { numeric } from './common';
import { cities } from './cities';

export const governorates = pgTable(
  'governorates',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    nameEn: text('name_en').notNull(),
    nameAr: text('name_ar').notNull(),
    shippingCost: numeric('shipping_cost').notNull(),
  },
  (table) => [index('governorates_name_en_idx').on(table.nameEn), index('governorates_name_ar_idx').on(table.nameAr)],
);

export const governoratesRelations = relations(governorates, ({ many }) => ({
  cities: many(cities),
}));
