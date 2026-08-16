import { TrimToNull } from 'src/utils/decorators';
import { IsIn, IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { MATERIAL_UNIT_VALUES } from 'src/utils/constants';
import { type MaterialUnit } from 'src/utils/types';

export class CreateLegacyIssuePermitItemDto {
  @TrimToNull()
  @IsString()
  @IsOptional()
  @ApiPropertyOptional()
  materialCode: string | null;

  @IsIn(MATERIAL_UNIT_VALUES)
  @IsOptional()
  @ApiPropertyOptional({ enum: MATERIAL_UNIT_VALUES, nullable: true })
  unitOfMeasurementSelected: MaterialUnit | null;

  @IsNumber()
  @IsPositive()
  @IsOptional()
  @ApiPropertyOptional({ nullable: true })
  quantity: number | null;

  @TrimToNull()
  @IsString()
  @IsOptional()
  @ApiPropertyOptional()
  notes: string | null;
}
