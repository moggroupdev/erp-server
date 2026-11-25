import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { TrimToNull } from 'src/utils/decorators';

export class UpdateProductDimensionDto {
  @IsBoolean()
  @IsOptional()
  @ApiPropertyOptional()
  isStandard: boolean | null;

  @TrimToNull()
  @IsString()
  @IsOptional()
  @ApiPropertyOptional()
  notes: string | null;
}
