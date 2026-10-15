import { IsDateString, IsOptional, IsString, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Trim, TrimToNull } from 'src/utils/decorators';
import { translate } from 'src/utils/i18n/translate';

export class CreateLegacyContractUnitDto {
  @Trim()
  @IsString()
  @Matches(/^\d{12}$/, {
    message: () =>
      translate('Serial number must be exactly 12 digits.', 'يجب أن يتكون الرقم التسلسلي من 12 رقمًا بالضبط.'),
  })
  @ApiProperty({ example: '123456789012' })
  serialNumber: string;

  @TrimToNull()
  @IsString()
  @IsOptional()
  @ApiPropertyOptional({ nullable: true })
  supplierSerialNumber: string | null;

  @IsDateString()
  @IsOptional()
  @ApiPropertyOptional()
  producedAt: string | null;
}
