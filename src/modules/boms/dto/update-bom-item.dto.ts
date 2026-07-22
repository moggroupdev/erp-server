import { TrimToNull } from 'src/utils/decorators';
import { IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateBomItemDto {
  @IsNumber()
  @IsPositive()
  @IsOptional()
  @ApiPropertyOptional()
  quantityRequired?: number;

  @TrimToNull()
  @IsString()
  @IsOptional()
  @ApiPropertyOptional()
  notes: string | null;
}
