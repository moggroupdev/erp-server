import { Type } from 'class-transformer';
import { Trim, TrimToNull } from 'src/utils/decorators';
import { IsArray, IsIn, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString, ValidateNested } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MATERIAL_UNIT_VALUES } from 'src/utils/constants';
import { type MaterialUnit } from 'src/utils/types';
import { CreateMaterialPurchaseOrderItemRequisitionAllocationDto } from './create-material-purchase-order-item-requisition-allocation.dto';

export class CreateMaterialPurchaseOrderItemDto {
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

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => CreateMaterialPurchaseOrderItemRequisitionAllocationDto)
  @ApiPropertyOptional({ type: [CreateMaterialPurchaseOrderItemRequisitionAllocationDto] })
  requisitionAllocations?: CreateMaterialPurchaseOrderItemRequisitionAllocationDto[];
}
