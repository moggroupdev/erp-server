import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, ValidateNested } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { CreateLegacyContractItemDto } from './create-legacy-contract-item.dto';

/** Step 3: units / serial numbers against existing product units. */
export class ValidateLegacyContractUnitsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateLegacyContractItemDto)
  @ApiProperty({ type: [CreateLegacyContractItemDto] })
  items: CreateLegacyContractItemDto[];
}
