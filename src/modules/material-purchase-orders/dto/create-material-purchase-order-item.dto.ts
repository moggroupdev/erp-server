import { Trim, TrimToNull } from 'src/utils/decorators';
import { IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateMaterialPurchaseOrderItemDto {
  @Trim()
  @IsString()
  @IsNotEmpty()
  @ApiProperty()
  materialCode: string;

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
}
