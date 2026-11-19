import { Module } from '@nestjs/common';
import { DatabaseModule } from 'src/database/database.module';
import { MaterialsService } from './materials.service';
import { MaterialMergeService } from './material-merge.service';
import { MaterialsController } from './materials.controller';
import { QueryBuilderService } from 'src/utils/services/query-builder.service';

@Module({
  imports: [DatabaseModule],
  controllers: [MaterialsController],
  providers: [MaterialsService, MaterialMergeService, QueryBuilderService],
})
export class MaterialsModule {}
