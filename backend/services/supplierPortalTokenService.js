const jwt = require('jsonwebtoken');

function getSecret() {
  const dedicated = String(process.env.SUPPLIER_PORTAL_JWT_SECRET || '').trim();
  if (dedicated) return { secret: dedicated, source: 'SUPPLIER_PORTAL_JWT_SECRET', fallback: false };
  const fallback = String(process.env.JWT_SECRET || '').trim();
  return { secret: fallback, source: 'JWT_SECRET', fallback: true };
}

function signSupplierPortalToken({ supplier_id }) {
  const { secret } = getSecret();
  if (!secret) throw new Error('supplier_portal_secret_missing');
  return jwt.sign(
    { scope: 'supplier_portal', supplier_id: String(supplier_id) },
    secret,
    { expiresIn: process.env.SUPPLIER_PORTAL_TOKEN_EXPIRES_IN || '14d' }
  );
}

function verifySupplierPortalToken(token) {
  const { secret } = getSecret();
  if (!secret) throw new Error('supplier_portal_secret_missing');
  const payload = jwt.verify(String(token || ''), secret);
  if (!payload || payload.scope !== 'supplier_portal') throw new Error('invalid_scope');
  return payload;
}

function getPublicAppUrl() {
  const direct = String(process.env.PUBLIC_APP_URL || '').trim();
  if (direct) return direct;

  const fromFrontendUrl = String(process.env.FRONTEND_URL || '').trim();
  if (fromFrontendUrl) return fromFrontendUrl;

  const firstFromList = String(process.env.FRONTEND_URLS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)[0];
  return firstFromList || 'http://localhost:3000';
}

function buildSupplierPortalUrlForSupplier({ supplier_id }) {
  const base = getPublicAppUrl().replace(/\/+$/, '');
  const token = signSupplierPortalToken({ supplier_id });
  return `${base}/fournisseur?token=${encodeURIComponent(token)}`;
}

module.exports = {
  signSupplierPortalToken,
  verifySupplierPortalToken,
  buildSupplierPortalUrlForSupplier,
  getSupplierPortalSecretStatus: () => getSecret(),
};

