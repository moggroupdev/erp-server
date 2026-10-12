import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsOptional, IsString, ValidateNested } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TrimToNull } from 'src/utils/decorators';
import { CreateRequestForQuotationItemDto } from './create-request-for-quotation-item.dto';

export class CreateRequestForQuotationDto {
  @TrimToNull()
  @IsString()
  @IsOptional()
  @ApiPropertyOptional()
  notes: string | null;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateRequestForQuotationItemDto)
  @ApiProperty({ type: [CreateRequestForQuotationItemDto] })
  items: CreateRequestForQuotationItemDto[];
}
