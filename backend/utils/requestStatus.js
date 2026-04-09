const LEGACY_REQUEST_STATUS_MAP = Object.freeze({
  accepted: 'validated',
  refused: 'rejected',
});

const CANONICAL_REQUEST_STATUSES = Object.freeze([
  'pending',
  'validated',
  'preparing',
  'served',
  'received',
  'rejected',
  'cancelled',
]);

function normalizeRequestStatus(status) {
  const key = String(status || '').trim().toLowerCase();
  if (!key) return 'pending';
  return LEGACY_REQUEST_STATUS_MAP[key] || key;
}

function dbStatusesForCanonical(status) {
  const canon = normalizeRequestStatus(status);
  if (canon === 'validated') return ['validated', 'accepted'];
  if (canon === 'rejected') return ['rejected', 'refused'];
  return [canon];
}

function dbStatusFilter(rawStatus) {
  const canon = normalizeRequestStatus(rawStatus);
  const values = dbStatusesForCanonical(canon);
  if (values.length === 1) return { status: values[0] };
  return { status: { $in: values } };
}

function isTerminalRequestStatus(status) {
  const canon = normalizeRequestStatus(status);
  return ['served', 'received', 'rejected', 'cancelled'].includes(canon);
}

module.exports = {
  LEGACY_REQUEST_STATUS_MAP,
  CANONICAL_REQUEST_STATUSES,
  normalizeRequestStatus,
  dbStatusesForCanonical,
  dbStatusFilter,
  isTerminalRequestStatus,
};

