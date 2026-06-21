import { pgTable, uuid, text, index } from 'drizzle-orm/pg-core';

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
