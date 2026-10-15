import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

function optionalBoolean() {
  return Transform(({ value }: { value: unknown }) => {
    if (value === true || value === 'true') return true;
    if (value === false || value === 'false' || value == null || value === '') return false;
    return value;
  });
}

export class ExportProductsExcelQueryDto {
  @IsOptional()
  @optionalBoolean()
  @IsBoolean()
  @ApiPropertyOptional()
  reviewEstimate?: boolean;

  @IsOptional()
  @optionalBoolean()
  @IsBoolean()
  @ApiPropertyOptional()
  addedToDatabase?: boolean;

  @IsOptional()
  @optionalBoolean()
  @IsBoolean()
  @ApiPropertyOptional()
  design?: boolean;

  @IsOptional()
  @optionalBoolean()
  @IsBoolean()
  @ApiPropertyOptional()
  completionDate?: boolean;

  @IsOptional()
  @optionalBoolean()
  @IsBoolean()
  @ApiPropertyOptional()
  notes?: boolean;
}
