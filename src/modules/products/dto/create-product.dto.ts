import { IsUuidString, Trim, TrimToNull } from 'src/utils/decorators';
import { IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PRODUCT_SOURCE_TYPE_VALUES } from 'src/utils/constants';
import { type ProductSourceType } from 'src/utils/types';

export class CreateProductDto {
  @Trim()
  @IsString()
  @IsNotEmpty()
  @ApiProperty()
  title: string;

  @TrimToNull()
  @IsString()
  @IsOptional()
  @ApiPropertyOptional()
  description: string | null;

  @IsUuidString()
  @IsNotEmpty()
  @ApiProperty()
  subCategoryId: string;

  @IsIn(PRODUCT_SOURCE_TYPE_VALUES)
  @ApiProperty({ enum: PRODUCT_SOURCE_TYPE_VALUES })
  sourceType: ProductSourceType;

  @IsNumber()
  @Min(1)
  @IsOptional()
  @ApiPropertyOptional()
  estimatedProductionTime: number | null;

  @IsNumber()
  @Min(0)
  @ApiProperty()
  pricingFactor: number;
}
