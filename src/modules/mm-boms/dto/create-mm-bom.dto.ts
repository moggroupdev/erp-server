import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsNotEmpty, IsString, ValidateNested } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Trim } from 'src/utils/decorators';
import { CreateMmBomItemDto } from './create-mm-bom-item.dto';

export class CreateMmBomDto {
  @Trim()
  @IsString()
  @IsNotEmpty()
  @ApiProperty()
  manufacturedMaterialCode: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateMmBomItemDto)
  @ApiProperty({ type: [CreateMmBomItemDto] })
  items: CreateMmBomItemDto[];
}
