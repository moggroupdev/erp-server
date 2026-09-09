import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsNotEmpty, IsOptional, IsString, ValidateNested } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsUuidString, TrimToNull } from 'src/utils/decorators';
import { CreateMaterialPurchaseOrderItemDto } from './create-material-purchase-order-item.dto';

export class CreateMaterialPurchaseOrderDto {
  @IsUuidString()
  @IsNotEmpty()
  @ApiProperty()
  supplierId: string;

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
}
