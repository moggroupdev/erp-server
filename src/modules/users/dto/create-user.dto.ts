import { IsPhone, IsUuidString, Trim, TrimToNull } from 'src/utils/decorators';
import { IsBoolean, IsEmail, IsIn, IsNotEmpty, IsOptional, IsString, ValidateIf } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { GENDER_VALUES, PRODUCTION_SUB_DEPARTMENT_VALUES } from 'src/utils/constants';
import { Gender, ProductionSubDepartment } from 'src/utils/types';

export class CreateUserDto {
  @Trim()
  @IsString()
  @IsNotEmpty()
  @ApiProperty()
  name: string;

  @TrimToNull()
  @IsString()
  @IsOptional()
  @ApiPropertyOptional()
  jobTitle: string | null;

  @IsIn(GENDER_VALUES)
  @IsOptional()
  @ApiPropertyOptional({ enum: GENDER_VALUES })
  gender: Gender | null;

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

  @IsBoolean()
  @ApiProperty()
  isLoginEnabled: boolean;

  @ValidateIf((o: CreateUserDto) => o.isLoginEnabled)
  @IsString()
  @IsNotEmpty()
  @ApiPropertyOptional()
  password?: string;

  @IsUuidString()
  @IsOptional()
  @ApiPropertyOptional()
  departmentId: string | null;

  @IsIn(PRODUCTION_SUB_DEPARTMENT_VALUES)
  @IsOptional()
  @ApiPropertyOptional({ enum: PRODUCTION_SUB_DEPARTMENT_VALUES })
  productionSubDepartment: ProductionSubDepartment | null;

  @ValidateIf((o: CreateUserDto) => o.isLoginEnabled)
  @IsUuidString()
  @IsNotEmpty()
  @ApiPropertyOptional()
  roleId?: string | null;
}
