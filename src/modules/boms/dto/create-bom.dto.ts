import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, ValidateNested } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { CreateBomItemDto } from './create-bom-item.dto';

export class CreateBomDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateBomItemDto)
  @ApiProperty({ type: [CreateBomItemDto] })
  items: CreateBomItemDto[];
}
