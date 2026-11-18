import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsUuidString, Trim } from 'src/utils/decorators';
import { PRODUCT_SOURCE_TYPE_VALUES } from 'src/utils/constants';
import { type ProductSourceType } from 'src/utils/types';

function optionalBoolean() {
  return Transform(({ value }: { value: unknown }) => {
    if (value === true || value === 'true') return true;
    if (value === false || value === 'false' || value == null || value === '') return false;
    return value;
  });
}

export class ExportProductsExcelQueryDto {
  @Trim()
  @IsString()
  @IsOptional()
  @ApiPropertyOptional()
  keyword?: string;

  @IsUuidString()
  @IsOptional()
  @ApiPropertyOptional()
  mainCategoryId?: string;

  @IsUuidString()
  @IsOptional()
  @ApiPropertyOptional()
  subCategoryId?: string;

  @IsIn(PRODUCT_SOURCE_TYPE_VALUES)
  @IsOptional()
  @ApiPropertyOptional({ enum: PRODUCT_SOURCE_TYPE_VALUES })
  sourceType?: ProductSourceType;

  @IsOptional()
  @optionalBoolean()
  @IsBoolean()
  @ApiPropertyOptional()
  reviewEstimate?: boolean;

  @IsOptional()
  @optionalBoolean()
  @IsBoolean()
  @ApiPropertyOptional()
  addedToDatabase?: boolean;

  @IsOptional()
  @optionalBoolean()
  @IsBoolean()
  @ApiPropertyOptional()
  design?: boolean;

  @IsOptional()
  @optionalBoolean()
  @IsBoolean()
  @ApiPropertyOptional()
  completionDate?: boolean;

  @IsOptional()
  @optionalBoolean()
  @IsBoolean()
  @ApiPropertyOptional()
  notes?: boolean;
}
