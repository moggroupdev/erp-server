import { Module } from '@nestjs/common';
import { DatabaseModule } from 'src/database/database.module';
import { BomsService } from './boms.service';
import { BomsController } from './boms.controller';

@Module({
  imports: [DatabaseModule],
  controllers: [BomsController],
  providers: [BomsService],
})
export class BomsModule {}
