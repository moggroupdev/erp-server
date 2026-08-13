import { Trim, TrimToNull } from 'src/utils/decorators';
import { IsIn, IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { MATERIAL_UNIT_VALUES } from 'src/utils/constants';
import { type MaterialUnit } from 'src/utils/types';

export class UpdateLegacyInventoryTransactionItemDto {
  @Trim()
  @IsString()
  @IsOptional()
  @ApiPropertyOptional()
  materialCode?: string;

  @IsIn(MATERIAL_UNIT_VALUES)
  @IsOptional()
  @ApiPropertyOptional({ enum: MATERIAL_UNIT_VALUES })
  unitOfMeasurementSelected?: MaterialUnit;

  @IsNumber()
  @IsPositive()
  @IsOptional()
  @ApiPropertyOptional()
  quantity?: number;

  @TrimToNull()
  @IsString()
  @IsOptional()
  @ApiPropertyOptional()
  notes?: string | null;
}
