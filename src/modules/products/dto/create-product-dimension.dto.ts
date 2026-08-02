import { IsBoolean, IsNumber, IsOptional, Min, ValidateIf } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsLengthDepthXorDiameter } from 'src/utils/decorators';

export class CreateProductDimensionDto {
  @ValidateIf((o: CreateProductDimensionDto) => o.diameter == null)
  @IsNumber()
  @Min(0)
  @ApiPropertyOptional()
  length: number | null;

  @ValidateIf((o: CreateProductDimensionDto) => o.diameter == null)
  @IsNumber()
  @Min(0)
  @ApiPropertyOptional()
  depth: number | null;

  @ValidateIf((o: CreateProductDimensionDto) => o.length == null && o.depth == null)
  @IsNumber()
  @Min(0)
  @ApiPropertyOptional()
  diameter: number | null;

  @IsNumber()
  @Min(0)
  @IsLengthDepthXorDiameter()
  @ApiProperty()
  height: number;

  @IsBoolean()
  @IsOptional()
  @ApiPropertyOptional()
  isDefault: boolean | null;
}
