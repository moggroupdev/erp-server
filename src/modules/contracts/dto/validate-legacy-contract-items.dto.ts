import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsNotEmpty, ValidateNested } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { IsUuidString } from 'src/utils/decorators';

export class ValidateLegacyContractItemDto {
  @IsUuidString()
  @IsNotEmpty()
  @ApiProperty()
  productDimensionId: string;
}

/** Step 2: line items (product dimensions / products still active). */
export class ValidateLegacyContractItemsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ValidateLegacyContractItemDto)
  @ApiProperty({ type: [ValidateLegacyContractItemDto] })
  items: ValidateLegacyContractItemDto[];
}
