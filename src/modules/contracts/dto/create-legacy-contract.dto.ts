import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsDateString, IsNotEmpty, IsOptional, IsString, ValidateNested } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsUuidString, Trim, TrimToNull } from 'src/utils/decorators';
import { CreateLegacyContractItemDto } from './create-legacy-contract-item.dto';

export class CreateLegacyContractDto {
  @IsUuidString()
  @IsNotEmpty()
  @ApiProperty()
  customerId: string;

  @Trim()
  @IsString()
  @IsNotEmpty()
  @ApiProperty()
  legacyNumber: string;

  @Trim()
  @IsString()
  @IsNotEmpty()
  @ApiProperty()
  legacyWorkOrderNumber: string;

  @IsDateString()
  @ApiProperty()
  createdAt: string;

  @IsDateString()
  @ApiProperty()
  startedAt: string;

  @IsDateString()
  @ApiProperty()
  deliveryTime: string;

  @TrimToNull()
  @IsUuidString()
  @IsOptional()
  @ApiPropertyOptional({ nullable: true })
  deliveryAddressId: string | null;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateLegacyContractItemDto)
  @ApiProperty({ type: [CreateLegacyContractItemDto] })
  items: CreateLegacyContractItemDto[];
}
