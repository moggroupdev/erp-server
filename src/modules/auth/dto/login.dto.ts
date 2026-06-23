import { IsString, IsOptional, IsEmail, IsNotEmpty } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class LoginDto {
  // Optional email - user can login with email or phone
  @IsOptional()
  @IsEmail()
  @ApiPropertyOptional()
  email?: string;

  // Optional phone - user can login with email or phone
  @IsOptional()
  @IsString()
  @ApiPropertyOptional()
  phone?: string;

  @IsString()
  @IsNotEmpty()
  @ApiProperty()
  password: string;
}
