import { Module } from '@nestjs/common';
import { DatabaseModule } from 'src/database/database.module';
import { ProfileService } from './profile.service';
import { ProfileController } from './profile.controller';

@Module({
  imports: [DatabaseModule],
  controllers: [ProfileController],
  providers: [ProfileService],
})
export class ProfileModule {}
