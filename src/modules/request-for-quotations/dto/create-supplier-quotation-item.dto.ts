import { TrimToNull } from 'src/utils/decorators';
import { IsIn, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MATERIAL_UNIT_VALUES } from 'src/utils/constants';
import { type MaterialUnit } from 'src/utils/types';

export class CreateSupplierQuotationItemDto {
  @IsUUID()
  @IsNotEmpty()
  @ApiProperty()
  requestForQuotationItemId: string;

  @IsIn(MATERIAL_UNIT_VALUES)
  @IsNotEmpty()
  @ApiProperty({ enum: MATERIAL_UNIT_VALUES })
  unitOfMeasurementSelected: MaterialUnit;

  @IsNumber()
  @IsPositive()
  @ApiProperty()
  unitPrice: number;

  @TrimToNull()
  @IsString()
  @IsOptional()
  @ApiPropertyOptional()
  notes: string | null;
}
