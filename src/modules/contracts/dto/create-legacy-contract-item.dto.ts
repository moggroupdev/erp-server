import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsUuidString, TrimToNull } from 'src/utils/decorators';
import { CreateLegacyContractUnitDto } from './create-legacy-contract-unit.dto';

export class CreateLegacyContractItemDto {
  @IsUuidString()
  @IsNotEmpty()
  @ApiProperty()
  productDimensionId: string;

  @TrimToNull()
  @IsString()
  @IsOptional()
  @ApiPropertyOptional({ nullable: true })
  title: string | null;

  @IsNumber()
  @IsPositive()
  @IsOptional()
  @ApiPropertyOptional({ nullable: true })
  unitPrice: number | null;

  @IsInt()
  @IsPositive()
  @ApiProperty()
  quantity: number;

  @TrimToNull()
  @IsString()
  @IsOptional()
  @ApiPropertyOptional({ nullable: true })
  notes: string | null;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateLegacyContractUnitDto)
  @ApiProperty({ type: [CreateLegacyContractUnitDto] })
  units: CreateLegacyContractUnitDto[];
}
