import { IsString, IsEmail, IsOptional, IsNotEmpty, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RegisterDto {
  @IsString()
  @IsNotEmpty()
  @ApiProperty()
  name: string;

  @IsOptional()
  @IsEmail()
  @ApiPropertyOptional()
  email?: string;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional()
  phone?: string;

  @IsString()
  @IsNotEmpty()
  @ApiProperty()
  password: string;

  @IsUUID()
  @IsNotEmpty()
  @ApiProperty({ description: 'The role to assign to the new user' })
  roleId: string;

  // Custom validation: ensure at least email or phone is provided
  // This is checked in the service layer for clearer error messages
}
