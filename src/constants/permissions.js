import { ROLES } from './roles';

export const PERMISSIONS = Object.freeze({
  PRODUCT_READ: 'product.read',
  PRODUCT_CREATE: 'product.create',
  PRODUCT_UPDATE: 'product.update',
  PRODUCT_VALIDATE: 'product.validate',
  STOCK_ENTRY_CREATE: 'stock.entry.create',
  STOCK_EXIT_CREATE: 'stock.exit.create',
  REQUEST_CREATE: 'request.create',
  HISTORY_READ: 'history.read',
});

const ROLE_PERMISSIONS = Object.freeze({
  [ROLES.DEMANDEUR]: new Set([
    PERMISSIONS.PRODUCT_READ,
    PERMISSIONS.REQUEST_CREATE,
    PERMISSIONS.HISTORY_READ,
  ]),
  [ROLES.MAGASINIER]: new Set([
    PERMISSIONS.PRODUCT_READ,
    PERMISSIONS.PRODUCT_CREATE,
    PERMISSIONS.PRODUCT_UPDATE,
    PERMISSIONS.STOCK_ENTRY_CREATE,
    PERMISSIONS.STOCK_EXIT_CREATE,
    PERMISSIONS.HISTORY_READ,
  ]),
  [ROLES.RESPONSABLE]: new Set([
    PERMISSIONS.PRODUCT_READ,
    PERMISSIONS.PRODUCT_CREATE,
    PERMISSIONS.PRODUCT_UPDATE,
    PERMISSIONS.PRODUCT_VALIDATE,
    PERMISSIONS.STOCK_ENTRY_CREATE,
    PERMISSIONS.STOCK_EXIT_CREATE,
    PERMISSIONS.HISTORY_READ,
  ]),
});

export function can(role, permission) {
  const set = ROLE_PERMISSIONS[role];
  return Boolean(set && set.has(permission));
}
