import { Trim, TrimToNull } from 'src/utils/decorators';
import { IsIn, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MATERIAL_UNIT_VALUES } from 'src/utils/constants';
import { type MaterialUnit } from 'src/utils/types';

export class CreateLegacyInventoryTransactionItemDto {
  @Trim()
  @IsString()
  @IsNotEmpty()
  @ApiProperty()
  materialCode: string;

  @IsIn(MATERIAL_UNIT_VALUES)
  @ApiProperty({ enum: MATERIAL_UNIT_VALUES })
  unitOfMeasurementSelected: MaterialUnit;

  @IsNumber()
  @IsPositive()
  @ApiProperty()
  quantity: number;

  @TrimToNull()
  @IsString()
  @IsOptional()
  @ApiPropertyOptional()
  notes: string | null;
}
