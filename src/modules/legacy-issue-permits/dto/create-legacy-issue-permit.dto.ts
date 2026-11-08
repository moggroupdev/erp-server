import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsUuidString, Trim, TrimToNull } from 'src/utils/decorators';
import {
  LEGACY_ISSUE_PERMIT_MAINTENANCE_ORDER_TYPE_VALUES,
  LEGACY_ISSUE_PERMIT_TYPE_VALUES,
  PRODUCTION_SUB_DEPARTMENT_VALUES,
} from 'src/utils/constants';
import {
  type LegacyIssuePermitMaintenanceOrderType,
  type LegacyIssuePermitType,
  type ProductionSubDepartment,
} from 'src/utils/types';
import { CreateLegacyIssuePermitItemDto } from './create-legacy-issue-permit-item.dto';

export class CreateLegacyIssuePermitDto {
  @Trim()
  @IsString()
  @IsNotEmpty()
  @ApiProperty()
  issuePermitNumber: string;

  @TrimToNull()
  @IsString()
  @IsOptional()
  @ApiPropertyOptional()
  issueOrderNumber: string | null;

  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsDateString()
  @IsOptional()
  @ApiPropertyOptional()
  issueOrderDate: string | null;

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

  @IsIn(LEGACY_ISSUE_PERMIT_TYPE_VALUES)
  @ApiProperty({ enum: LEGACY_ISSUE_PERMIT_TYPE_VALUES })
  permitType: LegacyIssuePermitType;

  @TrimToNull()
  @IsString()
  @IsOptional()
  @ApiPropertyOptional()
  contractNumber: string | null;

  @TrimToNull()
  @IsString()
  @IsOptional()
  @ApiPropertyOptional()
  maintenanceOrderNumber: string | null;

  @IsIn(LEGACY_ISSUE_PERMIT_MAINTENANCE_ORDER_TYPE_VALUES)
  @IsOptional()
  @ApiPropertyOptional({ enum: LEGACY_ISSUE_PERMIT_MAINTENANCE_ORDER_TYPE_VALUES })
  maintenanceOrderType: LegacyIssuePermitMaintenanceOrderType | null;

  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsUuidString()
  @IsOptional()
  @ApiPropertyOptional()
  customerId: string | null;

  @IsBoolean()
  @IsOptional()
  @ApiPropertyOptional()
  hasMultipleCustomers: boolean;

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
  @ValidateNested({ each: true })
  @Type(() => CreateLegacyIssuePermitItemDto)
  @ApiProperty({ type: [CreateLegacyIssuePermitItemDto] })
  items: CreateLegacyIssuePermitItemDto[];
}
