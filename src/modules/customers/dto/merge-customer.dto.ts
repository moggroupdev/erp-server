import { IsNotEmpty, IsString, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class MergeCustomerDto {
  @IsUUID()
  @ApiProperty({ description: 'Customer id to merge into the kept customer (then hard-delete)' })
  removeId: string;

  @IsString()
  @IsNotEmpty()
  @ApiProperty({ description: 'Must match the removed customer code exactly' })
  confirmationCode: string;
}
