const AppSetting = require('../models/AppSetting');
const { PERMISSIONS, ROLE_PERMISSIONS } = require('../constants/permissions');

const RBAC_POLICY_KEY = 'rbac_policy_v1';

const CACHE_TTL_MS = Math.max(10 * 1000, Number(process.env.RBAC_POLICY_CACHE_TTL_MS || 30 * 1000));
let cached = null;
let cachedAt = 0;

function allPermissions() {
  return new Set(Object.values(PERMISSIONS || {}));
}

const TECHNICAL_ONLY_FOR_ADMIN = new Set([
  PERMISSIONS.SECURITY_AUDIT_READ,
  PERMISSIONS.USER_MANAGE,
  PERMISSIONS.SESSION_MONITOR,
  PERMISSIONS.SESSION_REVOKE,
]);

function toArray(setOrArray) {
  if (Array.isArray(setOrArray)) return setOrArray.slice();
  if (setOrArray && typeof setOrArray.values === 'function') return Array.from(setOrArray.values());
  return [];
}

function getDefaultPolicy() {
  const role_permissions = {};
  for (const [role, perms] of Object.entries(ROLE_PERMISSIONS || {})) {
    role_permissions[role] = toArray(perms).sort();
  }
  return { role_permissions };
}

function normalizePolicy(raw) {
  const allowedPerms = allPermissions();
  const defaultPolicy = getDefaultPolicy();
  const role_permissions = {};

  const input = raw && typeof raw === 'object' ? raw : {};
  const mapping = input.role_permissions && typeof input.role_permissions === 'object'
    ? input.role_permissions
    : defaultPolicy.role_permissions;

  for (const role of Object.keys(defaultPolicy.role_permissions)) {
    const list = Array.isArray(mapping?.[role]) ? mapping[role] : defaultPolicy.role_permissions[role];
    const dedup = new Set();
    for (const p of list) {
      const key = String(p || '').trim();
      if (!key) continue;
      if (!allowedPerms.has(key)) continue;
      dedup.add(key);
    }
    // Hard guard: keep admin technical-only even if someone tries to extend via DB.
    if (role === 'admin') {
      role_permissions[role] = Array.from(dedup).filter((p) => TECHNICAL_ONLY_FOR_ADMIN.has(p)).sort();
    } else {
      role_permissions[role] = Array.from(dedup).sort();
    }
  }

  return { role_permissions };
}

async function getRbacPolicy() {
  const now = Date.now();
  if (cached && (now - cachedAt) < CACHE_TTL_MS) return cached;
  const item = await AppSetting.findOne({ setting_key: RBAC_POLICY_KEY }).lean();
  const next = normalizePolicy(item?.setting_value || null);
  cached = next;
  cachedAt = now;
  return next;
}

async function setRbacPolicy(nextValue, userId = null) {
  const normalized = normalizePolicy(nextValue);
  await AppSetting.findOneAndUpdate(
    { setting_key: RBAC_POLICY_KEY },
    { $set: { setting_value: normalized, updated_by: userId || undefined } },
    { upsert: true, returnDocument: 'after' }
  );
  cached = normalized;
  cachedAt = Date.now();
  return normalized;
}

async function getRolePermissions(role) {
  const key = String(role || '').trim().toLowerCase();
  const policy = await getRbacPolicy();
  const list = Array.isArray(policy?.role_permissions?.[key]) ? policy.role_permissions[key] : null;
  if (list) return new Set(list);
  const fallback = ROLE_PERMISSIONS?.[key];
  return fallback instanceof Set ? fallback : new Set();
}

async function hasPermission(role, permission) {
  const perms = await getRolePermissions(role);
  return Boolean(perms && perms.has(permission));
}

module.exports = {
  RBAC_POLICY_KEY,
  TECHNICAL_ONLY_FOR_ADMIN,
  getDefaultPolicy,
  getRbacPolicy,
  setRbacPolicy,
  getRolePermissions,
  hasPermission,
};

