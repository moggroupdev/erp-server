import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, ValidateNested } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { CreateMmBomItemDto } from './create-mm-bom-item.dto';

export class CreateMmBomDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateMmBomItemDto)
  @ApiProperty({ type: [CreateMmBomItemDto] })
  items: CreateMmBomItemDto[];
}
