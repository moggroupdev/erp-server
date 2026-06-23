import { Module, Global } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { DatabaseModule } from 'src/database/database.module';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';

@Global() // Make AuthModule global so guards can access JwtService and AuthService
@Module({
  imports: [DatabaseModule, JwtModule.register({ global: true })],
  controllers: [AuthController],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule {}
