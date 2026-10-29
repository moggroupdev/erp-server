import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsOptional, ValidateNested } from 'class-validator';
import { ApiProperty, ApiPropertyOptional, OmitType } from '@nestjs/swagger';
import { IsUuidString } from 'src/utils/decorators';
import { CreateLegacyContractItemDto } from './create-legacy-contract-item.dto';
import { UpdateLegacyContractUnitDto } from './update-legacy-contract-unit.dto';

export class UpdateLegacyContractItemDto extends OmitType(CreateLegacyContractItemDto, ['units'] as const) {
  @IsUuidString()
  @IsOptional()
  @ApiPropertyOptional()
  id?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => UpdateLegacyContractUnitDto)
  @ApiProperty({ type: [UpdateLegacyContractUnitDto] })
  units: UpdateLegacyContractUnitDto[];
}
