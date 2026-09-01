import { IsNotEmpty, IsNumber, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SetMaterialMarketPriceDto {
  @IsNumber()
  @Min(0)
  @IsNotEmpty()
  @ApiProperty()
  marketUnitPrice: number;
}
