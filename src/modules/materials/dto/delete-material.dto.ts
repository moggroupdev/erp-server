import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class DeleteMaterialDto {
  @IsString()
  @IsNotEmpty()
  @ApiProperty({ description: 'Must match the material code exactly' })
  confirmationCode: string;

  /** When true, permanently delete the materials row. Blocked if any reference exists. */
  @IsBoolean()
  @IsOptional()
  @ApiPropertyOptional({ default: false })
  permanent?: boolean;
}
