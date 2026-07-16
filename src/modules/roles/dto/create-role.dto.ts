import { IsUuidString, Trim, TrimToNull } from 'src/utils/decorators';
import {
  ArrayUnique,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PERMISSION_VALUES } from 'src/utils/constants';
import { type Permission } from 'src/utils/types';

export class CreateRoleDto {
  @Trim()
  @IsString()
  @IsNotEmpty()
  @ApiProperty()
  name: string;

  @TrimToNull()
  @IsString()
  @IsOptional()
  @ApiPropertyOptional()
  description: string | null;

  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  @ApiPropertyOptional()
  maxDiscountPct: number | null;

  @IsUuidString()
  @IsOptional()
  @ApiPropertyOptional()
  departmentId: string | null;

  @Trim()
  @IsString()
  @IsNotEmpty()
  @Matches(/^\/[a-zA-Z0-9\-_/]*$/, { message: 'homeUrl must be a relative path starting with "/".' })
  @ApiProperty()
  homeUrl: string;

  @IsArray()
  @ArrayUnique()
  @IsIn(PERMISSION_VALUES, { each: true })
  @ApiProperty({ type: [String], enum: PERMISSION_VALUES })
  permissions: Permission[];
}
