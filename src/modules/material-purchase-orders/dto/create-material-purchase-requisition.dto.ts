import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsIn, IsNotEmpty, IsOptional, IsString, ValidateNested } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TrimToNull } from 'src/utils/decorators';
import { PRODUCTION_SUB_DEPARTMENT_VALUES } from 'src/utils/constants';
import { type ProductionSubDepartment } from 'src/utils/types';
import { CreateMaterialPurchaseRequisitionItemDto } from './create-material-purchase-requisition-item.dto';

export class CreateMaterialPurchaseRequisitionDto {
  @IsIn(PRODUCTION_SUB_DEPARTMENT_VALUES)
  @IsNotEmpty()
  @ApiProperty({ enum: PRODUCTION_SUB_DEPARTMENT_VALUES })
  productionSubDepartment: ProductionSubDepartment;

  @TrimToNull()
  @IsString()
  @IsOptional()
  @ApiPropertyOptional()
  notes: string | null;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateMaterialPurchaseRequisitionItemDto)
  @ApiProperty({ type: [CreateMaterialPurchaseRequisitionItemDto] })
  items: CreateMaterialPurchaseRequisitionItemDto[];
}
