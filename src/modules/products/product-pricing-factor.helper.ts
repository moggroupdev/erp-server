import { PERMISSIONS } from 'src/utils/constants';
import type { UserWithRoleWithPermissions } from 'src/utils/types';

type PricingFactorViewer = Pick<UserWithRoleWithPermissions, 'isAdmin' | 'role'>;

export function canViewProductPricingFactor(user: PricingFactorViewer): boolean {
  if (user.isAdmin) return true;
  const permissions = user.role?.permissions ?? [];
  return (
    permissions.includes(PERMISSIONS.READ_PRODUCT_PRICING_FACTOR) ||
    permissions.includes(PERMISSIONS.SET_PRODUCT_PRICING_FACTOR)
  );
}

export function omitPricingFactorIfUnauthorized<T extends { pricingFactor?: unknown }>(
  product: T,
  user: PricingFactorViewer,
): T | Omit<T, 'pricingFactor'> {
  if (canViewProductPricingFactor(user)) return product;
  const { pricingFactor: _pricingFactor, ...rest } = product;
  return rest;
}
