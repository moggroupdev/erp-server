import { IsPhone, Trim, TrimToNull } from 'src/utils/decorators';
import { IsNotEmpty, IsString, IsEmail, IsOptional, IsIn } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SUPPLIER_CLASSIFICATION_VALUES } from 'src/utils/constants';
import { type SupplierClassification } from 'src/utils/types';

export class CreateSupplierDto {
  @Trim()
  @IsString()
  @IsNotEmpty()
  @ApiProperty()
  name: string;

  @TrimToNull()
  @IsPhone()
  @IsOptional()
  @ApiPropertyOptional()
  phone: string | null;

  @TrimToNull()
  @IsEmail()
  @IsOptional()
  @ApiPropertyOptional()
  email: string | null;

  @TrimToNull()
  @IsString()
  @IsOptional()
  @ApiPropertyOptional()
  taxNumber: string | null;

  @IsIn(SUPPLIER_CLASSIFICATION_VALUES)
  @IsOptional()
  @ApiPropertyOptional({ enum: SUPPLIER_CLASSIFICATION_VALUES })
  classification: SupplierClassification | null;

  @TrimToNull()
  @IsString()
  @IsOptional()
  @ApiPropertyOptional()
  notes: string | null;
}
