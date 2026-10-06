import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  Min,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Trim, TrimToNull } from 'src/utils/decorators';
import { MATERIAL_UNIT_VALUES, MM_SOURCING_TYPE_VALUES } from 'src/utils/constants';
import { type MaterialUnit, type MmSourcingType } from 'src/utils/types';

export class ReplaceDepartmentBomItemDto {
  @Trim()
  @IsString()
  @IsNotEmpty()
  @ApiProperty()
  materialCode: string;

  @IsNumber()
  @Min(0)
  @ApiProperty()
  quantityRequired: number;

  @IsIn(MATERIAL_UNIT_VALUES)
  @IsNotEmpty()
  @ApiProperty({ enum: MATERIAL_UNIT_VALUES })
  unitOfMeasurementSelected: MaterialUnit;

  // @APP_CHECKED - Non-null iff material is a manufactured_material; null otherwise
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsIn(MM_SOURCING_TYPE_VALUES)
  @IsOptional()
  @ApiPropertyOptional({ enum: MM_SOURCING_TYPE_VALUES, nullable: true })
  mmSourcingType: MmSourcingType | null;

  @TrimToNull()
  @IsString()
  @IsOptional()
  @ApiPropertyOptional()
  notes: string | null;

  @IsNumber()
  @Min(0)
  @IsOptional()
  @ApiPropertyOptional({ nullable: true })
  legacyQuantity: number | null;
}

export class ReplaceDepartmentBomDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ReplaceDepartmentBomItemDto)
  @ApiProperty({ type: [ReplaceDepartmentBomItemDto] })
  items: ReplaceDepartmentBomItemDto[];
}
