import { registerDecorator, ValidationOptions, ValidationArguments, isUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';
import { EGYPT_COUNTRY_ID } from 'src/utils/constants';
import { TrimToNull } from 'src/utils/decorators';
import { translate } from 'src/utils/i18n/translate';

/** cityId is required when countryId is Egypt, and must be absent otherwise. */
function ValidateAddressCity(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'validateAddressCity',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(cityId: unknown, args: ValidationArguments) {
          const dto = args.object as { countryId: string; cityId?: string | null };
          if (dto.countryId === EGYPT_COUNTRY_ID) return typeof cityId === 'string' && cityId.length > 0 && isUUID(cityId);
          return cityId === undefined || cityId === null;
        },
        defaultMessage(args: ValidationArguments) {
          const dto = args.object as { countryId: string };
          if (dto.countryId === EGYPT_COUNTRY_ID)
            return translate('cityId is required when country is Egypt', 'cityId مطلوب عندما تكون الدولة مصر');
          return translate(
            'cityId must not be provided when country is not Egypt',
            'يجب عدم تقديم cityId عندما تكون الدولة غير مصر',
          );
        },
      },
    });
  };
}

/** Shared address shape for entities that own addresses (customers, vendors, …). */
export class CreateAddressDto {
  @IsUUID()
  @IsNotEmpty()
  @ApiProperty()
  countryId: string;

  @ValidateAddressCity()
  @ApiPropertyOptional()
  cityId: string | null;

  @TrimToNull()
  @IsString()
  @IsOptional()
  @ApiPropertyOptional()
  addressLine: string | null;

  @IsBoolean()
  @IsOptional()
  @ApiPropertyOptional({ default: false })
  isDefault: boolean | null;
}
