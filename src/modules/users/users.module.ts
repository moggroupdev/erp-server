import { Module } from '@nestjs/common';
import { DatabaseModule } from 'src/database/database.module';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { QueryBuilderService } from 'src/utils/services/query-builder.service';

@Module({
  imports: [DatabaseModule],
  controllers: [UsersController],
  providers: [UsersService, QueryBuilderService],
})
export class UsersModule {}
