import { Module } from '@nestjs/common';
import { DatabaseModule } from 'src/database/database.module';
import { MmBomsService } from './mm-boms.service';
import { MmBomsController } from './mm-boms.controller';
import { MaterialUnitConversionService } from 'src/utils/services/material-unit-conversion.service';

// mm = manufactured material; manages manufactured_material_boms
@Module({
  imports: [DatabaseModule],
  controllers: [MmBomsController],
  providers: [MmBomsService, MaterialUnitConversionService],
})
export class MmBomsModule {}
