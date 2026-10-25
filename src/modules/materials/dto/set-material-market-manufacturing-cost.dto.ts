import { IsNotEmpty, IsNumber, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SetMaterialMarketManufacturingCostDto {
  @IsNumber()
  @Min(0)
  @IsNotEmpty()
  @ApiProperty()
  marketManufacturingCost: number;
}
