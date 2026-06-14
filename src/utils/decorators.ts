import { registerDecorator, ValidationOptions, ValidationArguments } from 'class-validator';
import { applyDecorators } from '@nestjs/common';
import { ApiQuery } from '@nestjs/swagger';

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
          if (validationOptions?.egyptianOnly) return `${args.property} must be a valid Egyptian phone number`;
          return `${args.property} must be a valid phone number`;
        },
      },
    });
  };
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
