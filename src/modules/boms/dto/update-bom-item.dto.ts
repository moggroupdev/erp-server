import { Trim, TrimToNull } from 'src/utils/decorators';
import { IsBoolean, IsIn, Min, IsNotEmpty, IsNumber, IsOptional, IsString, ValidateIf } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MATERIAL_UNIT_VALUES, MM_SOURCING_TYPE_VALUES, PRODUCTION_SUB_DEPARTMENT_VALUES } from 'src/utils/constants';
import { type MaterialUnit, type MmSourcingType, type ProductionSubDepartment } from 'src/utils/types';

export class UpdateBomItemDto {
  @Trim()
  @IsString()
  @IsNotEmpty()
  @ApiProperty()
  materialCode: string;

  @IsNumber()
  @Min(0)
  @IsOptional()
  @ApiPropertyOptional()
  quantityRequired?: number;

  @IsIn(MATERIAL_UNIT_VALUES)
  @IsNotEmpty()
  @ApiProperty({ enum: MATERIAL_UNIT_VALUES })
  unitOfMeasurementSelected: MaterialUnit;

  @IsIn(PRODUCTION_SUB_DEPARTMENT_VALUES)
  @IsNotEmpty()
  @ApiProperty({ enum: PRODUCTION_SUB_DEPARTMENT_VALUES })
  productionSubDepartment: ProductionSubDepartment;

  // @APP_CHECKED - Non-null iff material is a manufactured_material; null otherwise
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsIn(MM_SOURCING_TYPE_VALUES)
  @IsOptional()
  @ApiPropertyOptional({ enum: MM_SOURCING_TYPE_VALUES, nullable: true })
  mmSourcingType: MmSourcingType | null;

  @TrimToNull()
  @IsString()
  @IsOptional()
  @ApiPropertyOptional()
  notes: string | null;

  @IsNumber()
  @Min(0)
  @IsOptional()
  @ApiPropertyOptional({ nullable: true })
  legacyQuantity: number | null;

  // Omitted means false. True requires quantityRequired = 0 and legacyQuantity > 0.
  @IsBoolean()
  @IsOptional()
  @ApiPropertyOptional()
  noLongerUsed?: boolean;
}
