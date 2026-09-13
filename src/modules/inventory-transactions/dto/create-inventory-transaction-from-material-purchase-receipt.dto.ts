import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Trim } from 'src/utils/decorators';

export class CreateInventoryTransactionFromMaterialPurchaseReceiptDto {
  @Trim()
  @IsString()
  @IsNotEmpty()
  @ApiProperty({ description: 'Legacy / old-system transaction number (رقم الإذن)' })
  legacyNumber: string;
}
