import { registerDecorator, ValidationOptions, ValidationArguments } from 'class-validator';
import { Transform } from 'class-transformer';
import { applyDecorators } from '@nestjs/common';
import { ApiQuery } from '@nestjs/swagger';
import { translate } from 'src/utils/i18n/translate';

export interface PhoneValidationOptions extends ValidationOptions {
  egyptianOnly?: boolean;
}

export function IsPhone(validationOptions?: PhoneValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'IsPhone',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          // Allow `undefined` and `null` (handled by @IsOptional)
          if (value === undefined || value === null || value === '') return true;
          if (typeof value !== 'string') return false;
          const egyptianOnly = validationOptions?.egyptianOnly ?? false;
          if (egyptianOnly) return /^(\+?20|0)(10|11|12|15)\d{8}$/.test(value);
          return /^\+?\d{7,15}$/.test(value);
        },

        defaultMessage(args: ValidationArguments) {
          if (validationOptions?.egyptianOnly)
            return translate(
              `${args.property} must be a valid Egyptian phone number`,
              `${args.property} يجب أن يكون رقم هاتف مصريًا صالحًا`,
            );
          return translate(
            `${args.property} must be a valid phone number`,
            `${args.property} يجب أن يكون رقم هاتف صالحًا`,
          );
        },
      },
    });
  };
}

/**
 * Accepts any hex UUID string Postgres accepts (8-4-4-4-12).
 * Unlike `@IsUUID()`, does not require RFC 4122 version/variant bits — needed for
 * some seeded IDs in `data/departments.csv` that are valid PG uuids but not RFC-strict.
 */
export function IsUuidString(validationOptions?: ValidationOptions) {
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'IsUuidString',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          if (value === undefined || value === null || value === '') return true;
          return typeof value === 'string' && UUID_RE.test(value);
        },
        defaultMessage(args: ValidationArguments) {
          return translate(`${args.property} must be a UUID`, `${args.property} يجب أن يكون معرف UUID صالحًا`);
        },
      },
    });
  };
}

/** Trims string values before validation. Requires ValidationPipe `transform: true`. */
export function Trim() {
  return Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));
}

/** Trims strings and coerces whitespace-only values to `null`. */
export function TrimToNull() {
  return Transform(({ value }) => {
    if (value == null) return value;
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed === '' ? null : trimmed;
  });
}

export function ApiListQueries() {
  return applyDecorators(
    ApiQuery({ name: 'page', type: Number, required: false, example: 1 }),
    ApiQuery({ name: 'limit', type: Number, required: false, example: 10 }),
    ApiQuery({ name: 'keyword', type: String, required: false }),
    ApiQuery({ name: 'sortBy', type: String, required: false, example: '-createdAt' }),
    ApiQuery({ name: 'fields', type: String, required: false }),
  );
}
