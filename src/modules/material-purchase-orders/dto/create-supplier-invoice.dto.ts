import { Type } from 'class-transformer';
import { IsDateString, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsUuidString, Trim } from 'src/utils/decorators';

export class CreateSupplierInvoiceDto {
  @IsUuidString()
  @IsNotEmpty()
  @ApiProperty()
  materialPurchaseOrderId: string;

  @Trim()
  @IsString()
  @IsNotEmpty()
  @ApiProperty()
  invoiceNumber: string;

  @IsDateString()
  @IsOptional()
  @ApiPropertyOptional()
  issuedAt?: string | null;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  @ApiPropertyOptional()
  totalPurchases?: number | null;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  @ApiPropertyOptional()
  totalDiscount?: number | null;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  @ApiPropertyOptional()
  vatAmount?: number | null;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  @ApiPropertyOptional()
  withholdingTaxAmount?: number | null;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  @ApiPropertyOptional()
  totalAmount?: number | null;
}
