import { Type, Transform, plainToInstance } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsUuidString, Trim } from 'src/utils/decorators';
import { MATERIAL_UNIT_VALUES } from 'src/utils/constants';
import { type MaterialUnit } from 'src/utils/types';

export class CreateLegacyReceiptPermitItemDto {
  @Trim()
  @IsString()
  @IsNotEmpty()
  @ApiProperty()
  materialCode: string;

  @IsIn(MATERIAL_UNIT_VALUES)
  @IsNotEmpty()
  @ApiProperty({ enum: MATERIAL_UNIT_VALUES })
  unitOfMeasurementSelected: MaterialUnit;

  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  @ApiProperty()
  quantity: number;

  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  @ApiProperty()
  unitPrice: number;
}

export class CreateLegacyReceiptPermitBlockDto {
  @Trim()
  @IsString()
  @IsNotEmpty()
  @ApiProperty({ description: 'Legacy / old-system addition permit number (رقم إذن الإضافة)' })
  legacyNumber: string;

  @IsDateString()
  @IsNotEmpty()
  @ApiProperty()
  receivedAt: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateLegacyReceiptPermitItemDto)
  @ApiProperty({ type: [CreateLegacyReceiptPermitItemDto] })
  items: CreateLegacyReceiptPermitItemDto[];
}

export class CreateLegacyReceiptPermitInvoiceDto {
  @Trim()
  @IsString()
  @IsNotEmpty()
  @ApiProperty()
  invoiceNumber: string;

  @IsDateString()
  @IsNotEmpty()
  @ApiProperty()
  issuedAt: string;

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

/** Nested body parsed from the multipart `payload` JSON string. */
export class CreateLegacyReceiptPermitDto {
  @IsUuidString()
  @IsNotEmpty()
  @ApiProperty()
  supplierId: string;

  @ValidateNested()
  @Type(() => CreateLegacyReceiptPermitInvoiceDto)
  @ApiProperty({ type: CreateLegacyReceiptPermitInvoiceDto })
  invoice: CreateLegacyReceiptPermitInvoiceDto;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateLegacyReceiptPermitBlockDto)
  @ApiProperty({ type: [CreateLegacyReceiptPermitBlockDto] })
  permits: CreateLegacyReceiptPermitBlockDto[];
}

/**
 * Multipart form wrapper: `pdf` file + `payload` JSON string.
 * Must `plainToInstance` after JSON.parse so ValidationPipe whitelist sees DTO metadata
 * (a bare plain object is rejected as `property supplierId should not exist`).
 */
export class CreateLegacyReceiptPermitFormDto {
  @Transform(({ value }) => {
    const raw =
      typeof value === 'string'
        ? (() => {
            try {
              return JSON.parse(value);
            } catch {
              return value;
            }
          })()
        : value;

    if (raw == null || typeof raw !== 'object') return raw;
    return plainToInstance(CreateLegacyReceiptPermitDto, raw);
  })
  @ValidateNested()
  @Type(() => CreateLegacyReceiptPermitDto)
  @ApiProperty({ type: CreateLegacyReceiptPermitDto })
  payload: CreateLegacyReceiptPermitDto;
}
