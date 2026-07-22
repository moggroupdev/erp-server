import { IsUuidString, Trim, TrimToNull } from 'src/utils/decorators';
import { IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MATERIAL_TYPE_VALUES, MATERIAL_UNIT_VALUES } from 'src/utils/constants';
import { type MaterialType, type MaterialUnit } from 'src/utils/types';

export class CreateMaterialDto {
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

  @IsIn(MATERIAL_TYPE_VALUES)
  @ApiProperty({ enum: MATERIAL_TYPE_VALUES })
  materialType: MaterialType;

  @IsIn(MATERIAL_UNIT_VALUES)
  @ApiProperty({ enum: MATERIAL_UNIT_VALUES })
  unitOfMeasurement: MaterialUnit;

  @TrimToNull()
  @IsString()
  @IsOptional()
  @ApiPropertyOptional()
  legacyCode: string | null;

  @IsNumber()
  @Min(0)
  @IsOptional()
  @ApiPropertyOptional()
  minimumStock: number | null;
}
