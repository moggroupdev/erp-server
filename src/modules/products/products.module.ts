import { Module } from '@nestjs/common';
import { DatabaseModule } from 'src/database/database.module';
import { ProductsService } from './products.service';
import { ProductsController } from './products.controller';
import { ProductsRenderer } from './products.renderer';
import { QueryBuilderService } from 'src/utils/services/query-builder.service';

@Module({
  imports: [DatabaseModule],
  controllers: [ProductsController],
  providers: [ProductsService, ProductsRenderer, QueryBuilderService],
})
export class ProductsModule {}
