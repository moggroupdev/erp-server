import { IsNumber, IsPositive } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateMaterialUnitConversionDto {
  @IsNumber()
  @IsPositive()
  @ApiProperty({ description: '1 unit = conversionFactorToBase base units' })
  conversionFactorToBase: number;
}
