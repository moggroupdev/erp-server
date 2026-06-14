import { boolean, timestamp, customType } from 'drizzle-orm/pg-core';

export const moneyPrecision = { precision: 15, scale: 3 };

// Custom numeric type that returns JavaScript numbers instead of strings
export const money = customType<{ data: number; driverData: string }>({
  dataType: () => `numeric(${moneyPrecision.precision}, ${moneyPrecision.scale})`,
  fromDriver: (value: string) => parseFloat(value),
  toDriver: (value: number) => value.toString(),
});

export const isDeleted = boolean('is_deleted').notNull().default(false);
export const createdAt = timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
