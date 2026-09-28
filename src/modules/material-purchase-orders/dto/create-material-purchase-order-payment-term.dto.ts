import { IsIn, IsInt, IsNotEmpty, IsNumber, IsPositive, ValidateIf } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  MPO_PAYMENT_EVENTS,
  MPO_PAYMENT_EVENT_VALUES,
  MPO_PAYMENT_VALUE_KIND_VALUES,
  MPO_PAYMENT_VALUE_KINDS,
} from 'src/utils/constants';
import { type MpoPaymentEvent, type MpoPaymentValueKind } from 'src/utils/types';

export class CreateMaterialPurchaseOrderPaymentTermDto {
  @IsIn(MPO_PAYMENT_EVENT_VALUES)
  @IsNotEmpty()
  @ApiProperty({ enum: MPO_PAYMENT_EVENT_VALUES })
  event: MpoPaymentEvent;

  @ValidateIf(
    (dto: CreateMaterialPurchaseOrderPaymentTermDto) =>
      dto.event === MPO_PAYMENT_EVENTS.AFTER_RECEIPT || dto.event === MPO_PAYMENT_EVENTS.AFTER_INVOICE,
  )
  @IsInt()
  @IsPositive()
  @ApiPropertyOptional()
  offsetDays?: number | null;

  @IsIn(MPO_PAYMENT_VALUE_KIND_VALUES)
  @IsNotEmpty()
  @ApiProperty({ enum: MPO_PAYMENT_VALUE_KIND_VALUES })
  valueKind: MpoPaymentValueKind;

  @ValidateIf((dto: CreateMaterialPurchaseOrderPaymentTermDto) => dto.valueKind !== MPO_PAYMENT_VALUE_KINDS.REMAINDER)
  @IsNumber({ maxDecimalPlaces: 6 })
  @IsPositive()
  @ApiPropertyOptional()
  value?: number | null;
}
