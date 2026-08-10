import { IsIn, IsNumber, IsPositive } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { MATERIAL_UNIT_VALUES } from 'src/utils/constants';
import { type MaterialUnit } from 'src/utils/types';

export class CreateMaterialUnitConversionDto {
  @IsIn(MATERIAL_UNIT_VALUES)
  @ApiProperty({ enum: MATERIAL_UNIT_VALUES })
  unit: MaterialUnit;

  @IsNumber()
  @IsPositive()
  @ApiProperty({ description: '1 unit = conversionFactorToBase base units' })
  conversionFactorToBase: number;
}
