import { IsBoolean, IsIn, IsNumber, IsOptional, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DIMENSION_UNIT_VALUES } from 'src/utils/constants';
import { type DimensionUnit } from 'src/utils/types';

export class CreateProductDimensionDto {
  @IsNumber()
  @Min(0)
  @ApiProperty()
  length: number;

  @IsNumber()
  @Min(0)
  @ApiProperty()
  width: number;

  @IsNumber()
  @Min(0)
  @ApiProperty()
  height: number;

  @IsIn(DIMENSION_UNIT_VALUES)
  @ApiProperty({ enum: DIMENSION_UNIT_VALUES })
  dimensionUnit: DimensionUnit;

  @IsBoolean()
  @IsOptional()
  @ApiPropertyOptional()
  isDefault: boolean | null;
}
