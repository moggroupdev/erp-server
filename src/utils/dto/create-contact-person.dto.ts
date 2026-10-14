import { IsPhone, Trim, TrimToNull } from 'src/utils/decorators';
import { IsBoolean, IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Shared contact-person shape for entities that own contacts (customers, suppliers, …). */
export class CreateContactPersonDto {
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
  @IsOptional()
  @ApiPropertyOptional({ default: false })
  isPrimary: boolean | null;
}
