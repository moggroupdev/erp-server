import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { JwtPayload } from 'src/utils/types';
import { REQUEST_USER_KEY, REFRESH_TOKEN_COOKIE } from 'src/utils/constants';
import { translate } from 'src/utils/i18n/translate';
import { AuthService } from '../auth.service';

@Injectable()
export class RefreshTokenGuard implements CanActivate {
  constructor(
    private readonly config: ConfigService,
    private readonly jwtService: JwtService,
    private readonly authService: AuthService,
  ) {}

  private extractRefreshToken(request: Request): string {
    // Extract refresh token from HttpOnly cookie
    const token = request.cookies?.[REFRESH_TOKEN_COOKIE] as string;
    if (!token)
      throw new UnauthorizedException(
        translate('Access denied: No refresh token provided.', 'تم رفض الوصول: لم يتم توفير رمز التحديث.'),
      );
    return token;
  }

  private async verifyRefreshToken(token: string): Promise<JwtPayload> {
    try {
      const secret = this.config.get<string>('RT_SECRET_KEY');
      const payload = await this.jwtService.verifyAsync<JwtPayload>(token, { secret });
      // Ensure this is a refresh token, not an access token
      if (payload.type !== 'refresh')
        throw new UnauthorizedException(
          translate('Access denied: Invalid refresh token.', 'تم رفض الوصول: رمز التحديث غير صالح.'),
        );
      return payload;
    } catch {
      throw new UnauthorizedException(
        translate('Access denied: Invalid refresh token.', 'تم رفض الوصول: رمز التحديث غير صالح.'),
      );
    }
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request: Request = context.switchToHttp().getRequest();

    // Extract and verify refresh token from cookie
    const token = this.extractRefreshToken(request);
    const payload = await this.verifyRefreshToken(token);

    // Fetch user from database to ensure they still exist
    const user = await this.authService.getUser(payload.id);

    // Attach user to request for use in controller
    request[REQUEST_USER_KEY] = user;
    return true;
  }
}
