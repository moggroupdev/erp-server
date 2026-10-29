import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsOptional, ValidateNested } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsUuidString } from 'src/utils/decorators';
import { CreateLegacyContractItemDto } from './create-legacy-contract-item.dto';
import { UpdateLegacyContractItemDto } from './update-legacy-contract-item.dto';

/** Step 3: units / serial numbers against existing product units. */
export class ValidateLegacyContractUnitsDto {
  @IsUuidString()
  @IsOptional()
  @ApiPropertyOptional()
  contractId?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateLegacyContractItemDto)
  @ApiProperty({ type: [CreateLegacyContractItemDto] })
  items: CreateLegacyContractItemDto[];
}

export class ValidateUpdateLegacyContractUnitsDto {
  @IsUuidString()
  @IsOptional()
  @ApiPropertyOptional()
  contractId?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => UpdateLegacyContractItemDto)
  @ApiProperty({ type: [UpdateLegacyContractItemDto] })
  items: UpdateLegacyContractItemDto[];
}
