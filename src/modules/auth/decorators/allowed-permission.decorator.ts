import { SetMetadata } from '@nestjs/common';
import { Permission } from 'src/utils/types';
import { ALLOWED_PERMISSION_KEY } from 'src/utils/constants';

/**
 * A custom **method decorator** used to set allowed permission metadata for route handlers.
 *
 * This decorator is used in conjunction with the `PermissionGuard` to restrict access to routes
 * based on the user's role permissions (e.g. `'add_user'`, `'list_roles'`).
 *
 * Admin users (`isAdmin = true`) automatically bypass this check.
 *
 * @param permission - The required permission string (e.g. `'add_user'`, `'list_roles'`)
 * @returns A metadata decorator that stores the required permission
 *
 */
export const AllowedPermission = (permission: Permission) => SetMetadata(ALLOWED_PERMISSION_KEY, permission);
