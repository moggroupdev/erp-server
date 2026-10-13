import { Module } from '@nestjs/common';
import { DatabaseModule } from 'src/database/database.module';
import { MaterialUnitValidationService } from 'src/utils/services/material-unit-validation.service';
import { QueryBuilderService } from 'src/utils/services/query-builder.service';
import { RequestForQuotationsController } from './request-for-quotations.controller';
import { RequestForQuotationsService } from './request-for-quotations.service';

@Module({
  imports: [DatabaseModule],
  controllers: [RequestForQuotationsController],
  providers: [RequestForQuotationsService, MaterialUnitValidationService, QueryBuilderService],
})
export class RequestForQuotationsModule {}
