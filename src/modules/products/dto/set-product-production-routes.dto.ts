import { Type } from 'class-transformer';
import { IsIn, IsInt, IsNumber, Min, Max, ArrayMinSize, IsArray, ValidateNested } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { PRODUCTION_SUB_DEPARTMENT_VALUES } from 'src/utils/constants';
import { type ProductionSubDepartment } from 'src/utils/types';

class CreateProductProductionRouteDto {
  @IsIn(PRODUCTION_SUB_DEPARTMENT_VALUES)
  @ApiProperty({ enum: PRODUCTION_SUB_DEPARTMENT_VALUES })
  productionSubDepartment: ProductionSubDepartment;

  @IsInt()
  @Min(1)
  @ApiProperty()
  sequenceOrder: number;

  @IsNumber()
  @Min(0.01)
  @Max(100)
  @ApiProperty()
  completionPercentage: number;
}

export class SetProductProductionRoutesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateProductProductionRouteDto)
  @ApiProperty({ type: [CreateProductProductionRouteDto] })
  routes: CreateProductProductionRouteDto[];
}
