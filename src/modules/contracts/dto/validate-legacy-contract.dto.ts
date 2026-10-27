import { IsDateString, IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { IsUuidString, Trim } from 'src/utils/decorators';

/** Step 1: contract header fields (customer, numbers, dates). */
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
}
