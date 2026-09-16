import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsIn, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString, ValidateNested } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Trim, TrimToNull } from 'src/utils/decorators';
import { MATERIAL_UNIT_VALUES } from 'src/utils/constants';
import { type MaterialUnit } from 'src/utils/types';

export class ReplaceDepartmentBomItemDto {
  @Trim()
  @IsString()
  @IsNotEmpty()
  @ApiProperty()
  materialCode: string;

  @IsNumber()
  @IsPositive()
  @ApiProperty()
  quantityRequired: number;

  @IsIn(MATERIAL_UNIT_VALUES)
  @IsNotEmpty()
  @ApiProperty({ enum: MATERIAL_UNIT_VALUES })
  unitOfMeasurementSelected: MaterialUnit;

  @TrimToNull()
  @IsString()
  @IsOptional()
  @ApiPropertyOptional()
  notes: string | null;
}

export class ReplaceDepartmentBomDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ReplaceDepartmentBomItemDto)
  @ApiProperty({ type: [ReplaceDepartmentBomItemDto] })
  items: ReplaceDepartmentBomItemDto[];
}
