import { Controller, Post, Body, Get, UseGuards, HttpCode, Res, ServiceUnavailableException } from '@nestjs/common';
import { ApiBearerAuth, ApiCookieAuth } from '@nestjs/swagger';
import { type Response } from 'express';
import { type User } from 'src/utils/types';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { AccessTokenGuard } from './guards/access-token.guard';
import { RefreshTokenGuard } from './guards/refresh-token.guard';
import { RequestUser } from './decorators/request-user.decorator';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('register')
  public register(@Body() dto: RegisterDto, @Res({ passthrough: true }) res: Response) {
    throw new ServiceUnavailableException('Registration is disabled.');
    // return this.authService.register(dto, res);
  }

  @Post('login')
  @HttpCode(200)
  public login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    return this.authService.login(dto, res);
  }

  @Post('refresh-access-token')
  @UseGuards(RefreshTokenGuard)
  @ApiCookieAuth()
  public refreshAccessToken(@RequestUser() user: User) {
    return this.authService.refreshAccessToken(user.id);
  }

  @Post('logout')
  @HttpCode(200)
  public logout(@Res({ passthrough: true }) res: Response) {
    return this.authService.logout(res);
  }

  @Get('profile')
  @UseGuards(AccessTokenGuard)
  @ApiBearerAuth()
  public getProfile(@RequestUser() user: User) {
    return this.authService.sanitizeUser(user);
  }
}
