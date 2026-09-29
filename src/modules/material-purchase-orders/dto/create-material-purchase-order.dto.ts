import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsIn, IsInt, IsNotEmpty, IsOptional, IsPositive, IsString, ValidateIf, ValidateNested } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsUuidString, TrimToNull } from 'src/utils/decorators';
import { MPO_DELIVERY_LOCATION_VALUES, MPO_DELIVERY_TIMING_VALUES, MPO_DELIVERY_TIMINGS } from 'src/utils/constants';
import { type MpoDeliveryLocation, type MpoDeliveryTiming } from 'src/utils/types';
import { CreateMaterialPurchaseOrderItemDto } from './create-material-purchase-order-item.dto';
import { CreateMaterialPurchaseOrderPaymentTermDto } from './create-material-purchase-order-payment-term.dto';

export class CreateMaterialPurchaseOrderDto {
  @IsUuidString()
  @IsNotEmpty()
  @ApiProperty()
  supplierId: string;

  @IsIn(MPO_DELIVERY_LOCATION_VALUES)
  @IsNotEmpty()
  @ApiProperty({ enum: MPO_DELIVERY_LOCATION_VALUES })
  deliveryLocation: MpoDeliveryLocation;

  @IsIn(MPO_DELIVERY_TIMING_VALUES)
  @IsNotEmpty()
  @ApiProperty({ enum: MPO_DELIVERY_TIMING_VALUES })
  deliveryTiming: MpoDeliveryTiming;

  @ValidateIf((dto: CreateMaterialPurchaseOrderDto) => dto.deliveryTiming === MPO_DELIVERY_TIMINGS.WITHIN_DAYS)
  @IsInt()
  @IsPositive()
  @ApiPropertyOptional()
  deliveryPeriodDays?: number | null;

  @TrimToNull()
  @IsString()
  @IsOptional()
  @ApiPropertyOptional()
  notes: string | null;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateMaterialPurchaseOrderItemDto)
  @ApiProperty({ type: [CreateMaterialPurchaseOrderItemDto] })
  items: CreateMaterialPurchaseOrderItemDto[];

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateMaterialPurchaseOrderPaymentTermDto)
  @ApiProperty({ type: [CreateMaterialPurchaseOrderPaymentTermDto] })
  paymentTerms: CreateMaterialPurchaseOrderPaymentTermDto[];
}
