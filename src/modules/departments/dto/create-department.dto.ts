import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateDepartmentDto {
  @IsString()
  @IsNotEmpty()
  @ApiProperty()
  nameEn: string;

  @IsString()
  @IsNotEmpty()
  @ApiProperty()
  nameAr: string;
}
