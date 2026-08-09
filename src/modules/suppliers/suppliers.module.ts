import { Module } from '@nestjs/common';
import { DatabaseModule } from 'src/database/database.module';
import { SuppliersService } from './suppliers.service';
import { SuppliersController } from './suppliers.controller';
import { QueryBuilderService } from 'src/utils/services/query-builder.service';

@Module({
  imports: [DatabaseModule],
  controllers: [SuppliersController],
  providers: [SuppliersService, QueryBuilderService],
})
export class SuppliersModule {}
