import { IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class MergeCustomerPreviewQueryDto {
  @IsUUID()
  @ApiProperty({ description: 'Customer id to merge into the kept customer (then hard-delete)' })
  removeId: string;
}
