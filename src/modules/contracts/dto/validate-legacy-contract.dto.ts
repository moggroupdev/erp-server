import { IsDateString, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsUuidString, Trim, TrimToNull } from 'src/utils/decorators';

/** Step 1: contract header fields (customer, numbers, dates, delivery). */
export class ValidateLegacyContractDto {
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
}
