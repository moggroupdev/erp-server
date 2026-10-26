import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { IsUuidString, Trim } from 'src/utils/decorators';

export class CreateCategorySubDto {
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

  @IsUuidString()
  @IsNotEmpty()
  @ApiProperty()
  mainCategoryId: string;
}
