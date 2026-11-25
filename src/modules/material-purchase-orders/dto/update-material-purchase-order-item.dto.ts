import { Trim, TrimToNull } from 'src/utils/decorators';
import { IsBoolean, IsIn, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MATERIAL_UNIT_VALUES } from 'src/utils/constants';
import { type MaterialUnit } from 'src/utils/types';

export class UpdateMaterialPurchaseOrderItemDto {
  @Trim()
  @IsString()
  @IsNotEmpty()
  @ApiProperty()
  materialCode: string;

  @IsIn(MATERIAL_UNIT_VALUES)
  @IsNotEmpty()
  @ApiProperty({ enum: MATERIAL_UNIT_VALUES })
  unitOfMeasurementSelected: MaterialUnit;

  @IsNumber()
  @IsPositive()
  @ApiProperty()
  quantityOrdered: number;

  @IsNumber()
  @IsPositive()
  @ApiProperty()
  unitPrice: number;

  @TrimToNull()
  @IsString()
  @IsOptional()
  @ApiPropertyOptional()
  notes: string | null;

  @IsBoolean()
  @IsOptional()
  @ApiPropertyOptional({
    description:
      'When true, recompute completedAt from receipt coverage. When omitted or false, leave completedAt unchanged. Does not stamp updatedAt.',
  })
  updateCompletedAt?: boolean;
}
