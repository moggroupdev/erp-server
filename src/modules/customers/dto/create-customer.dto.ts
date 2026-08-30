import { IsPhone, Trim, TrimToNull } from 'src/utils/decorators';
import { IsNotEmpty, IsString, IsEmail, IsOptional, IsIn } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CUSTOMER_CLASSIFICATION_VALUES } from 'src/utils/constants';
import { type CustomerClassification } from 'src/utils/types';

export class CreateCustomerDto {
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

  @IsIn(CUSTOMER_CLASSIFICATION_VALUES)
  @IsOptional()
  @ApiPropertyOptional({ enum: CUSTOMER_CLASSIFICATION_VALUES })
  classification: CustomerClassification | null;

  @TrimToNull()
  @IsString()
  @IsOptional()
  @ApiPropertyOptional()
  notes: string | null;
}
