import { Trim, TrimToNull } from 'src/utils/decorators';
import { IsIn, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MATERIAL_UNIT_VALUES, PRODUCTION_SUB_DEPARTMENT_VALUES } from 'src/utils/constants';
import { type MaterialUnit, type ProductionSubDepartment } from 'src/utils/types';

export class CreateBomItemDto {
  @Trim()
  @IsString()
  @IsNotEmpty()
  @ApiProperty()
  materialCode: string;

  @IsNumber()
  @IsPositive()
  @ApiProperty()
  quantityRequired: number;

  @IsIn(MATERIAL_UNIT_VALUES)
  @IsNotEmpty()
  @ApiProperty({ enum: MATERIAL_UNIT_VALUES })
  unitOfMeasurementSelected: MaterialUnit;

  @IsIn(PRODUCTION_SUB_DEPARTMENT_VALUES)
  @IsNotEmpty()
  @ApiProperty({ enum: PRODUCTION_SUB_DEPARTMENT_VALUES })
  productionSubDepartment: ProductionSubDepartment;

  @TrimToNull()
  @IsString()
  @IsOptional()
  @ApiPropertyOptional()
  notes: string | null;
}
