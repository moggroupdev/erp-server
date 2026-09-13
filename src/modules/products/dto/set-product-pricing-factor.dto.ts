import { IsNumber, IsPositive } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SetProductPricingFactorDto {
  @IsNumber()
  @IsPositive()
  @ApiProperty()
  pricingFactor: number;
}
