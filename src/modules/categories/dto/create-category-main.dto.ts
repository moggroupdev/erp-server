import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Trim } from 'src/utils/decorators';

export class CreateCategoryMainDto {
  @Trim()
  @IsString()
  @IsNotEmpty()
  @ApiProperty()
  legacyCode: string;

  @Trim()
  @IsString()
  @IsNotEmpty()
  @ApiProperty()
  title: string;
}
