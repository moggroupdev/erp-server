import { IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsUuidString, TrimToNull } from 'src/utils/decorators';
import { MATERIAL_UNIT_VALUES } from 'src/utils/constants';
import { type MaterialUnit } from 'src/utils/types';

export class CreateMaterialPurchaseReceiptItemDto {
  @IsUuidString()
  @IsNotEmpty()
  @ApiProperty()
  materialPurchaseOrderItemId: string;

  @IsIn(MATERIAL_UNIT_VALUES)
  @IsNotEmpty()
  @ApiProperty({ enum: MATERIAL_UNIT_VALUES })
  unitOfMeasurementSelected: MaterialUnit;

  @IsNumber()
  @Min(0)
  @ApiProperty()
  quantityReceived: number;

  @IsNumber()
  @Min(0)
  @ApiProperty()
  quantityRejected: number;

  @TrimToNull()
  @IsString()
  @IsOptional()
  @ApiPropertyOptional()
  inspectionNotes: string | null;
}
