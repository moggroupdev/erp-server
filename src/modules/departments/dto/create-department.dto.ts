import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsUuidString, Trim } from 'src/utils/decorators';

export class CreateDepartmentDto {
  @Trim()
  @IsString()
  @IsNotEmpty()
  @ApiProperty()
  nameEn: string;

  @Trim()
  @IsString()
  @IsNotEmpty()
  @ApiProperty()
  nameAr: string;

  @IsUuidString()
  @IsOptional()
  @ApiPropertyOptional()
  managerId: string | null;
}
