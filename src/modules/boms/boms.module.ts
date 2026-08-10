import { Module } from '@nestjs/common';
import { DatabaseModule } from 'src/database/database.module';
import { BomsService } from './boms.service';
import { BomsController } from './boms.controller';
import { MaterialUnitConversionService } from 'src/utils/services/material-unit-conversion.service';

@Module({
  imports: [DatabaseModule],
  controllers: [BomsController],
  providers: [BomsService, MaterialUnitConversionService],
})
export class BomsModule {}
