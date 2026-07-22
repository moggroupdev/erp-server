import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsNotEmpty, ValidateNested } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { IsUuidString } from 'src/utils/decorators';
import { CreateBomItemDto } from './create-bom-item.dto';

export class CreateBomDto {
  @IsUuidString()
  @IsNotEmpty()
  @ApiProperty()
  productDimensionId: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateBomItemDto)
  @ApiProperty({ type: [CreateBomItemDto] })
  items: CreateBomItemDto[];
}
