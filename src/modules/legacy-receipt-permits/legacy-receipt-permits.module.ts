import { Module } from '@nestjs/common';
import { DatabaseModule } from 'src/database/database.module';
import { MaterialUnitValidationService } from 'src/utils/services/material-unit-validation.service';
import { UploaderService } from 'src/utils/services/uploader.service';
import { LegacyReceiptPermitsController } from './legacy-receipt-permits.controller';
import { LegacyReceiptPermitsService } from './legacy-receipt-permits.service';

@Module({
  imports: [DatabaseModule],
  controllers: [LegacyReceiptPermitsController],
  providers: [LegacyReceiptPermitsService, MaterialUnitValidationService, UploaderService],
})
export class LegacyReceiptPermitsModule {}
