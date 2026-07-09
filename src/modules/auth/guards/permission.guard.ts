import { Injectable, ExecutionContext, ForbiddenException, InternalServerErrorException } from '@nestjs/common';
import { Request } from 'express';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Permission } from 'src/utils/types';
import { REQUEST_USER_KEY, ALLOWED_PERMISSION_KEY } from 'src/utils/constants';
import { translate } from 'src/utils/i18n/translate';
import { AccessTokenGuard } from './access-token.guard';
import { AuthService } from '../auth.service';

/**
 * Permission Guard - Handles permission-based authorization
 *
 * This guard checks if the user has the required permission to access a resource.
 *
 * Authorization logic:
 * - Admin users (`isAdmin = true`) automatically have access to all resources
 * - Non-admin users must have a role, and that role must include the required permission in its `role_permissions` entries
 *
 */
@Injectable()
export class PermissionGuard extends AccessTokenGuard {
  constructor(
    config: ConfigService,
    jwtService: JwtService,
    authService: AuthService,
    private readonly reflector: Reflector,
  ) {
    super(config, jwtService, authService);
  }

  async canActivate(context: ExecutionContext) {
    const requiredPermission = this.reflector.get<Permission>(ALLOWED_PERMISSION_KEY, context.getHandler());

    if (!requiredPermission)
      throw new InternalServerErrorException(
        translate('No permission specified for permission guard.', 'لم يتم تحديد صلاحية لحارس الصلاحيات.'),
      );

    // Get request object and verify token using parent class method
    const request: Request = context.switchToHttp().getRequest();
    const token = this.extractAccessToken(request);
    const payload = await this.verifyAccessToken(token);

    // Fetch user with role and role permissions from database
    const user = await this.authService.getSanitizedUserWithRoleWithPermissions(payload.id);

    // Admin has full access to everything
    if (user.isAdmin) {
      request[REQUEST_USER_KEY] = user;
      return true;
    }

    // Non-admin users must have a role with the required permission
    if (!user.role)
      throw new ForbiddenException(
        translate('Access denied: Insufficient permissions.', 'تم رفض الوصول: صلاحيات غير كافية.'),
      );

    const hasPermission = user.role.permissions.includes(requiredPermission);
    if (!hasPermission)
      throw new ForbiddenException(
        translate('Access denied: Insufficient permissions.', 'تم رفض الوصول: صلاحيات غير كافية.'),
      );

    // Attach user to request
    request[REQUEST_USER_KEY] = user;
    return true;
  }
}
