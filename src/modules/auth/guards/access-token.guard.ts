import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { JwtPayload } from 'src/utils/types';
import { REQUEST_USER_KEY } from 'src/utils/constants';
import { translate } from 'src/utils/i18n/translate';
import { AuthService } from '../auth.service';

// We use `protected` so that subclasses can access these services

@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(
    protected readonly config: ConfigService,
    protected readonly jwtService: JwtService,
    protected readonly authService: AuthService,
  ) {}

  protected extractAccessToken(request: Request): string {
    const [type, token] = request.headers['authorization']?.split(' ') || [];
    if (!token || type !== 'Bearer')
      throw new UnauthorizedException(
        translate('Access denied: No access token provided.', 'تم رفض الوصول: لم يتم توفير رمز الوصول.'),
      );
    return token;
  }

  protected async verifyAccessToken(token: string): Promise<JwtPayload> {
    try {
      const secret = this.config.get<string>('AT_SECRET_KEY');
      const payload = await this.jwtService.verifyAsync<JwtPayload>(token, { secret });
      // Ensure this is an access token, not a refresh token
      if (payload.type !== 'access')
        throw new UnauthorizedException(
          translate('Access denied: Invalid access token.', 'تم رفض الوصول: رمز الوصول غير صالح.'),
        );
      return payload;
    } catch {
      throw new UnauthorizedException(
        translate('Access denied: Invalid access token.', 'تم رفض الوصول: رمز الوصول غير صالح.'),
      );
    }
  }

  async canActivate(context: ExecutionContext) {
    // Get request object and verify token using parent class method
    const request: Request = context.switchToHttp().getRequest();
    const token = this.extractAccessToken(request);
    const payload = await this.verifyAccessToken(token);

    // Fetch user from database. This will throw if user does not exist.
    const user = await this.authService.getUser(payload.id);

    // Attach user to request
    request[REQUEST_USER_KEY] = user;
    return true;
  }
}
