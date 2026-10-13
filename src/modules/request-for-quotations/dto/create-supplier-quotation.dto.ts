import { IsNotEmpty, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateSupplierQuotationDto {
  @IsUUID()
  @IsNotEmpty()
  @ApiProperty()
  supplierId: string;
}
