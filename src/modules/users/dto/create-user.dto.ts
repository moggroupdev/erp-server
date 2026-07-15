import { IsPhone, IsUuidString, Trim, TrimToNull } from 'src/utils/decorators';
import { IsEmail, IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PRODUCTION_SUB_DEPARTMENT_VALUES } from 'src/utils/constants';
import { ProductionSubDepartment } from 'src/utils/types';

export class CreateUserDto {
  @Trim()
  @IsString()
  @IsNotEmpty()
  @ApiProperty()
  name: string;

  @TrimToNull()
  @IsPhone()
  @IsOptional()
  @ApiPropertyOptional()
  phone: string | null;

  @TrimToNull()
  @IsEmail()
  @IsOptional()
  @ApiPropertyOptional()
  email: string | null;

  @IsString()
  @IsNotEmpty()
  @ApiProperty()
  password: string;

  @IsUuidString()
  @IsOptional()
  @ApiPropertyOptional()
  departmentId: string | null;

  @IsIn(PRODUCTION_SUB_DEPARTMENT_VALUES)
  @IsOptional()
  @ApiPropertyOptional({ enum: PRODUCTION_SUB_DEPARTMENT_VALUES })
  productionSubDepartment: ProductionSubDepartment | null;

  @IsUuidString()
  @IsNotEmpty()
  @ApiProperty()
  roleId: string;
}
