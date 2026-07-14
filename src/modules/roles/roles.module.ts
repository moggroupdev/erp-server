import { Module } from '@nestjs/common';
import { DatabaseModule } from 'src/database/database.module';
import { RolesService } from './roles.service';
import { RolesController } from './roles.controller';
import { QueryBuilderService } from 'src/utils/services/query-builder.service';

@Module({
  imports: [DatabaseModule],
  controllers: [RolesController],
  providers: [RolesService, QueryBuilderService],
})
export class RolesModule {}
