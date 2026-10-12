import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsDateString, IsInt, IsNotEmpty, IsOptional, IsPositive, IsString, ValidateNested } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TrimToNull } from 'src/utils/decorators';
import { CreateSupplierQuotationItemDto } from './create-supplier-quotation-item.dto';

export class SubmitSupplierQuotationDto {
  @TrimToNull()
  @IsString()
  @IsOptional()
  @ApiPropertyOptional()
  paymentTerms: string | null;

  @TrimToNull()
  @IsString()
  @IsOptional()
  @ApiPropertyOptional()
  deliveryTerms: string | null;

  @IsInt()
  @IsPositive()
  @ApiProperty()
  deliveryPeriodDays: number;

  @IsDateString()
  @IsNotEmpty()
  @ApiProperty()
  validUntil: string;

  @TrimToNull()
  @IsString()
  @IsOptional()
  @ApiPropertyOptional()
  notes: string | null;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateSupplierQuotationItemDto)
  @ApiProperty({ type: [CreateSupplierQuotationItemDto] })
  items: CreateSupplierQuotationItemDto[];
}
