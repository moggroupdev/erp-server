import { TrimToNull } from 'src/utils/decorators';
import { IsIn, IsNumber, IsOptional, IsPositive, IsString, ValidateIf } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { MATERIAL_UNIT_VALUES } from 'src/utils/constants';
import { type MaterialUnit } from 'src/utils/types';

export class CreateLegacyIssuePermitItemDto {
  @TrimToNull()
  @IsString()
  @IsOptional()
  @ApiPropertyOptional()
  materialCode: string | null;

  @ValidateIf((o: CreateLegacyIssuePermitItemDto) => !!o.materialCode)
  @IsIn(MATERIAL_UNIT_VALUES)
  @ApiPropertyOptional({ enum: MATERIAL_UNIT_VALUES, nullable: true })
  unitOfMeasurementSelected: MaterialUnit | null;

  @ValidateIf((o: CreateLegacyIssuePermitItemDto) => !!o.materialCode)
  @IsNumber()
  @IsPositive()
  @ApiPropertyOptional({ nullable: true })
  quantity: number | null;

  @TrimToNull()
  @IsString()
  @IsOptional()
  @ApiPropertyOptional()
  notes: string | null;
}
