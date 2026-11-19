import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class MergeMaterialPreviewQueryDto {
  @IsString()
  @IsNotEmpty()
  @ApiProperty({ description: 'Material code to merge into the kept material (then hard-delete)' })
  removeCode: string;
}
