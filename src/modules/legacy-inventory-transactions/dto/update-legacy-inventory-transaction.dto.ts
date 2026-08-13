import { IsBoolean, IsDateString, IsIn, IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsUuidString, Trim, TrimToNull } from 'src/utils/decorators';
import { LEGACY_WORK_ORDER_TYPE_VALUES, PRODUCTION_SUB_DEPARTMENT_VALUES } from 'src/utils/constants';
import { type LegacyWorkOrderType, type ProductionSubDepartment } from 'src/utils/types';

export class UpdateLegacyInventoryTransactionDto {
  @Trim()
  @IsString()
  @IsOptional()
  @ApiPropertyOptional()
  issuePermitNumber?: string;

  @Trim()
  @IsString()
  @IsOptional()
  @ApiPropertyOptional()
  issueOrderNumber?: string;

  @IsDateString()
  @IsOptional()
  @ApiPropertyOptional()
  date?: string;

  @IsUuidString()
  @IsOptional()
  @ApiPropertyOptional()
  creatorId?: string;

  @IsIn(PRODUCTION_SUB_DEPARTMENT_VALUES)
  @IsOptional()
  @ApiPropertyOptional({ enum: PRODUCTION_SUB_DEPARTMENT_VALUES })
  productionSubDepartment?: ProductionSubDepartment | null;

  @TrimToNull()
  @IsString()
  @IsOptional()
  @ApiPropertyOptional()
  contractNumber?: string | null;

  @TrimToNull()
  @IsString()
  @IsOptional()
  @ApiPropertyOptional()
  workOrderNumber?: string | null;

  @IsIn(LEGACY_WORK_ORDER_TYPE_VALUES)
  @IsOptional()
  @ApiPropertyOptional({ enum: LEGACY_WORK_ORDER_TYPE_VALUES })
  workOrderNumberType?: LegacyWorkOrderType;

  @IsBoolean()
  @IsOptional()
  @ApiPropertyOptional()
  isCancelled?: boolean;

  @TrimToNull()
  @IsString()
  @IsOptional()
  @ApiPropertyOptional()
  notes?: string | null;
}
