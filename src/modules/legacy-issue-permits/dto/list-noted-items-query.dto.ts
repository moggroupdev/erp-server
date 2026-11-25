import { Transform } from 'class-transformer';
import { IsBoolean, IsDateString, IsIn, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsUuidString } from 'src/utils/decorators';
import { LEGACY_ISSUE_PERMIT_TYPE_VALUES, PRODUCTION_SUB_DEPARTMENT_VALUES } from 'src/utils/constants';
import { type LegacyIssuePermitType, type ProductionSubDepartment } from 'src/utils/types';

/** Query bool that stays undefined when omitted (unlike defaults-to-false transforms). */
function optionalQueryBoolean() {
  return Transform(({ value }: { value: unknown }) => {
    if (value === true || value === 'true') return true;
    if (value === false || value === 'false') return false;
    if (value == null || value === '') return undefined;
    return value;
  });
}

export class ListNotedItemsQueryDto {
  @IsDateString()
  @IsOptional()
  @ApiPropertyOptional({ description: 'Inclusive start of permit date range (calendar day).' })
  from?: string;

  @IsDateString()
  @IsOptional()
  @ApiPropertyOptional({ description: 'Inclusive end of permit date range (calendar day).' })
  to?: string;

  @IsIn(LEGACY_ISSUE_PERMIT_TYPE_VALUES)
  @IsOptional()
  @ApiPropertyOptional({ enum: LEGACY_ISSUE_PERMIT_TYPE_VALUES })
  permitType?: LegacyIssuePermitType;

  @IsIn(PRODUCTION_SUB_DEPARTMENT_VALUES)
  @IsOptional()
  @ApiPropertyOptional({ enum: PRODUCTION_SUB_DEPARTMENT_VALUES })
  productionSubDepartment?: ProductionSubDepartment;

  @IsOptional()
  @optionalQueryBoolean()
  @IsBoolean()
  @ApiPropertyOptional()
  isSst?: boolean;

  @IsOptional()
  @optionalQueryBoolean()
  @IsBoolean()
  @ApiPropertyOptional()
  isCancelled?: boolean;

  @IsUuidString()
  @IsOptional()
  @ApiPropertyOptional()
  customerId?: string;

  @IsUuidString()
  @IsOptional()
  @ApiPropertyOptional()
  creatorId?: string;
}
