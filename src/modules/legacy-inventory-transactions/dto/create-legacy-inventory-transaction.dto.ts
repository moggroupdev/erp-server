import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsUuidString, Trim, TrimToNull } from 'src/utils/decorators';
import { LEGACY_WORK_ORDER_TYPE_VALUES, PRODUCTION_SUB_DEPARTMENT_VALUES } from 'src/utils/constants';
import { type LegacyWorkOrderType, type ProductionSubDepartment } from 'src/utils/types';
import { CreateLegacyInventoryTransactionItemDto } from './create-legacy-inventory-transaction-item.dto';

export class CreateLegacyInventoryTransactionDto {
  @Trim()
  @IsString()
  @IsNotEmpty()
  @ApiProperty()
  issuePermitNumber: string;

  @Trim()
  @IsString()
  @IsNotEmpty()
  @ApiProperty()
  issueOrderNumber: string;

  @IsDateString()
  @ApiProperty()
  issueOrderDate: string;

  @IsDateString()
  @ApiProperty()
  date: string;

  @IsUuidString()
  @IsNotEmpty()
  @ApiProperty()
  creatorId: string;

  @IsIn(PRODUCTION_SUB_DEPARTMENT_VALUES)
  @IsOptional()
  @ApiPropertyOptional({ enum: PRODUCTION_SUB_DEPARTMENT_VALUES })
  productionSubDepartment: ProductionSubDepartment | null;

  @TrimToNull()
  @IsString()
  @IsOptional()
  @ApiPropertyOptional()
  contractNumber: string | null;

  @TrimToNull()
  @IsString()
  @IsOptional()
  @ApiPropertyOptional()
  workOrderNumber: string | null;

  @IsIn(LEGACY_WORK_ORDER_TYPE_VALUES)
  @IsOptional()
  @ApiPropertyOptional({ enum: LEGACY_WORK_ORDER_TYPE_VALUES })
  workOrderNumberType: LegacyWorkOrderType;

  @IsBoolean()
  @IsOptional()
  @ApiPropertyOptional()
  isCancelled: boolean;

  @TrimToNull()
  @IsString()
  @IsOptional()
  @ApiPropertyOptional()
  notes: string | null;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateLegacyInventoryTransactionItemDto)
  @ApiProperty({ type: [CreateLegacyInventoryTransactionItemDto] })
  items: CreateLegacyInventoryTransactionItemDto[];
}