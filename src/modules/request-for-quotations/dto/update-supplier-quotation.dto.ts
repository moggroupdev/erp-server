import { IsDateString, IsInt, IsOptional, IsPositive, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { TrimToNull } from 'src/utils/decorators';

export class UpdateSupplierQuotationDto {
  @TrimToNull()
  @IsString()
  @IsOptional()
  @ApiPropertyOptional()
  paymentTerms?: string | null;

  @TrimToNull()
  @IsString()
  @IsOptional()
  @ApiPropertyOptional()
  deliveryTerms?: string | null;

  @IsInt()
  @IsPositive()
  @IsOptional()
  @ApiPropertyOptional()
  deliveryPeriodDays?: number | null;

  @IsDateString()
  @IsOptional()
  @ApiPropertyOptional()
  validUntil?: string | null;

  @TrimToNull()
  @IsString()
  @IsOptional()
  @ApiPropertyOptional()
  notes?: string | null;
}
