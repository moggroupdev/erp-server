import { IsBoolean, IsIn, IsOptional, ValidateIf } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MATERIAL_TYPE_VALUES, MATERIAL_TYPES, MM_SOURCING_TYPE_VALUES } from 'src/utils/constants';
import { type MaterialType, type MmSourcingType } from 'src/utils/types';

export class SetMaterialTypeDto {
  @IsIn(MATERIAL_TYPE_VALUES)
  @ApiProperty({ enum: MATERIAL_TYPE_VALUES })
  materialType: MaterialType;

  // Required only when moving into manufactured_material.
  @ValidateIf((dto: SetMaterialTypeDto) => dto.materialType === MATERIAL_TYPES.MANUFACTURED_MATERIAL)
  @IsIn(MM_SOURCING_TYPE_VALUES)
  @ApiPropertyOptional({ enum: MM_SOURCING_TYPE_VALUES })
  defaultMmSourcingType?: MmSourcingType;

  // Required (checked in service, not here) only when leaving manufactured_material with affected BOM lines.
  @IsBoolean()
  @IsOptional()
  @ApiPropertyOptional()
  confirmed?: boolean;
}
