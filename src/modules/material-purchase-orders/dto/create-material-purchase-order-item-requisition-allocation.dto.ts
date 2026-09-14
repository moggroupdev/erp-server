import { IsNotEmpty, IsNumber, IsPositive } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { IsUuidString } from 'src/utils/decorators';

/** `quantityAllocated` is in the requisition line's `unitOfMeasurementSelected`. */
export class CreateMaterialPurchaseOrderItemRequisitionAllocationDto {
  @IsUuidString()
  @IsNotEmpty()
  @ApiProperty()
  materialPurchaseRequisitionItemId: string;

  @IsNumber()
  @IsPositive()
  @ApiProperty({ description: 'Quantity in the requisition line unit' })
  quantityAllocated: number;
}
