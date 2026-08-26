import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Trim } from 'src/utils/decorators';

export class RejectMaterialPurchaseRequisitionDto {
  @Trim()
  @IsString()
  @IsNotEmpty()
  @ApiProperty()
  rejectionReason: string;
}
