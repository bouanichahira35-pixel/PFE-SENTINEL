const AppSetting = require('../models/AppSetting');
const User = require('../models/User');
const Notification = require('../models/Notification');
const { enqueueMail } = require('./mailQueueService');
const { getUserPreferences, canSendNotificationEmail } = require('./userPreferencesService');

const INCIDENT_WINDOW_MS = Number(process.env.ADMIN_INCIDENT_WINDOW_MS || 10 * 60 * 1000);
const INCIDENT_COOLDOWN_MS = Number(process.env.ADMIN_INCIDENT_COOLDOWN_MS || 15 * 60 * 1000);
const ERROR_THRESHOLD = Number(process.env.ADMIN_INCIDENT_ERROR_THRESHOLD || 5);
const SLOW_THRESHOLD_MS = Number(process.env.ADMIN_INCIDENT_SLOW_MS || 2000);
const SLOW_COUNT_THRESHOLD = Number(process.env.ADMIN_INCIDENT_SLOW_COUNT || 10);

const STATE_KEY = 'admin_incident_state';
const memoryState = {
  events: [],
  lastSentAt: null,
};

function nowMs() {
  return Date.now();
}

async function getState() {
  const item = await AppSetting.findOne({ setting_key: STATE_KEY }).lean();
  return item?.setting_value || {};
}

async function setState(value) {
  await AppSetting.findOneAndUpdate(
    { setting_key: STATE_KEY },
    { $set: { setting_value: value } },
    { upsert: true, returnDocument: 'after' }
  );
}

function pruneEvents(cutoff) {
  memoryState.events = memoryState.events.filter((e) => e.ts >= cutoff);
}

function summarizeWindow(since) {
  const rows = memoryState.events.filter((e) => e.ts >= since);
  const errors = rows.filter((e) => e.status >= 500);
  const slow = rows.filter((e) => e.duration_ms >= SLOW_THRESHOLD_MS);
  return {
    total: rows.length,
    errors_count: errors.length,
    slow_count: slow.length,
    sample_errors: errors.slice(0, 6),
    sample_slow: slow.slice(0, 6),
  };
}

async function notifyAdmins(summary) {
  const admins = await User.find({ role: 'admin', status: 'active' })
    .select('_id email username role')
    .limit(40)
    .lean();
  if (!admins.length) return { ok: false, reason: 'no_admin' };

  const title = 'Incident systeme detecte';
  const message = [
    `Erreurs 5xx: ${summary.errors_count}`,
    `Routes lentes: ${summary.slow_count} (>${SLOW_THRESHOLD_MS}ms)`,
    `Fenetre: ${Math.round(INCIDENT_WINDOW_MS / 60000)} min`,
  ].join('\n');

  await Notification.insertMany(
    admins.map((a) => ({
      user: a._id,
      title,
      message,
      type: 'warning',
      is_read: false,
    }))
  );

  for (const a of admins) {
    if (!a.email) continue;
    const prefs = await getUserPreferences(a._id);
    if (!canSendNotificationEmail(prefs, 'generic')) continue;
    const subject = `[ALERTE] Incident systeme (${summary.errors_count} erreurs / ${summary.slow_count} lentes)`;
    const text = [
      `Bonjour ${a.username || 'Admin'},`,
      '',
      `Le systeme detecte des anomalies techniques.`,
      `Erreurs 5xx: ${summary.errors_count}`,
      `Routes lentes: ${summary.slow_count} (>${SLOW_THRESHOLD_MS}ms)`,
      `Fenetre: ${Math.round(INCIDENT_WINDOW_MS / 60000)} min`,
      '',
      'Consultez le centre d’incidents dans la console admin.',
    ].join('\n');
    await enqueueMail({
      kind: 'admin_incident_alert',
      role: a.role,
      to: a.email,
      subject,
      text,
      html: `<pre style="font-family:monospace;white-space:pre-wrap;">${text}</pre>`,
      job_id: `admin_incident_${a._id}_${Date.now()}`,
    });
  }
  return { ok: true, recipients: admins.length };
}

async function onIncident({ method, path, status, duration_ms }) {
  const ts = nowMs();
  memoryState.events.push({
    ts,
    method: String(method || 'GET').slice(0, 8),
    path: String(path || '/').slice(0, 140),
    status: Number(status || 0),
    duration_ms: Number(duration_ms || 0),
  });
  const cutoff = ts - INCIDENT_WINDOW_MS;
  pruneEvents(cutoff);

  const lastSentAtMem = memoryState.lastSentAt ? Number(memoryState.lastSentAt) : null;
  const state = await getState().catch(() => ({}));
  const lastSentAt = state?.last_sent_at ? new Date(state.last_sent_at).getTime() : lastSentAtMem;
  if (lastSentAt && (ts - lastSentAt) < INCIDENT_COOLDOWN_MS) return { ok: false, reason: 'cooldown' };

  const summary = summarizeWindow(cutoff);
  const shouldTrigger =
    summary.errors_count >= ERROR_THRESHOLD ||
    summary.slow_count >= SLOW_COUNT_THRESHOLD;
  if (!shouldTrigger) return { ok: false, reason: 'below_threshold' };

  await notifyAdmins(summary);
  memoryState.lastSentAt = ts;
  await setState({
    last_sent_at: new Date(ts).toISOString(),
    last_errors: summary.errors_count,
    last_slow: summary.slow_count,
  }).catch(() => {});
  return { ok: true, summary };
}

module.exports = {
  onIncident,
};

