import { IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { MATERIAL_TYPE_VALUES } from 'src/utils/constants';
import { type MaterialType } from 'src/utils/types';

export class MaterialTypeChangePreviewQueryDto {
  @IsIn(MATERIAL_TYPE_VALUES)
  @ApiProperty({ enum: MATERIAL_TYPE_VALUES })
  targetType: MaterialType;
}
