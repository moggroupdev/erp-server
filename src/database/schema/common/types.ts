import { customType } from 'drizzle-orm/pg-core';

export const numericPrecision = { precision: 15, scale: 3 };

const createNumericType = (precision: number, scale: number) =>
  customType<{ data: number; driverData: string }>({
    dataType: () => `numeric(${precision}, ${scale})`,
    fromDriver: (value: string) => parseFloat(value),
    toDriver: (value: number) => value.toString(),
  });

export const numeric = createNumericType(numericPrecision.precision, numericPrecision.scale);

/** Latitude — WGS84, ±90° with 8 decimal places (~1 mm precision). */
export const geoLat = createNumericType(10, 8);

/** Longitude — WGS84, ±180° with 8 decimal places (~1 mm precision). */
export const geoLng = createNumericType(11, 8);
