import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsUuidString, TrimToNull } from 'src/utils/decorators';
import { CreateMaterialPurchaseReceiptItemDto } from './create-material-purchase-receipt-item.dto';

export class CreateMaterialPurchaseReceiptDto {
  @IsUuidString()
  @IsNotEmpty()
  @ApiProperty()
  materialPurchaseOrderId: string;

  @TrimToNull()
  @IsString()
  @IsOptional()
  @ApiPropertyOptional()
  notes: string | null;

  @IsDateString()
  @IsOptional()
  @ApiPropertyOptional()
  receivedAt: string | null;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateMaterialPurchaseReceiptItemDto)
  @ApiProperty({ type: [CreateMaterialPurchaseReceiptItemDto] })
  items: CreateMaterialPurchaseReceiptItemDto[];
}
