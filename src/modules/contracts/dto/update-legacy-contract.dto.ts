import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, ValidateNested } from 'class-validator';
import { ApiProperty, OmitType } from '@nestjs/swagger';
import { CreateLegacyContractDto } from './create-legacy-contract.dto';
import { UpdateLegacyContractItemDto } from './update-legacy-contract-item.dto';

export class UpdateLegacyContractDto extends OmitType(CreateLegacyContractDto, ['items'] as const) {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => UpdateLegacyContractItemDto)
  @ApiProperty({ type: [UpdateLegacyContractItemDto] })
  items: UpdateLegacyContractItemDto[];
}
