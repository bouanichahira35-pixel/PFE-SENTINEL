const AppSetting = require('../models/AppSetting');
const SecurityAudit = require('../models/SecurityAudit');
const User = require('../models/User');
const { enqueueMail } = require('./mailQueueService');
const { getUserPreferences } = require('./userPreferencesService');

const DIGEST_KEY = 'admin_email_failure_digest_state';

async function getState() {
  const item = await AppSetting.findOne({ setting_key: DIGEST_KEY }).lean();
  return item?.setting_value || {};
}

async function setState(value) {
  await AppSetting.findOneAndUpdate(
    { setting_key: DIGEST_KEY },
    { $set: { setting_value: value } },
    { upsert: true, new: true }
  );
}

async function sendAdminCriticalFailureDigestIfDue() {
  const intervalMinutes = Number(process.env.ADMIN_DIGEST_MINUTES || 30);
  const now = new Date();
  const state = await getState();
  const lastSentAt = state?.last_sent_at ? new Date(state.last_sent_at) : null;
  if (lastSentAt && (now.getTime() - lastSentAt.getTime()) < intervalMinutes * 60 * 1000) {
    return { sent: false, reason: 'cooldown' };
  }

  const since = lastSentAt || new Date(now.getTime() - intervalMinutes * 60 * 1000);
  const failures = await SecurityAudit.find({
    event_type: 'email_failed',
    createdAt: { $gte: since },
  })
    .sort({ createdAt: -1 })
    .limit(30)
    .lean();

  if (!failures.length) {
    return { sent: false, reason: 'no_failure' };
  }

  const responsables = await User.find({ role: 'responsable', status: 'active' })
    .select('_id email username role')
    .lean();

  let sentCount = 0;
  for (const r of responsables) {
    if (!r.email) continue;
    const prefs = await getUserPreferences(r._id);
    if (!prefs?.notifications?.email) continue;

    const subject = `[CRITIQUE] Echecs email detectes (${failures.length})`;
    const summary = failures.slice(0, 10).map((f) => {
      const when = new Date(f.createdAt || f.date_event || now).toLocaleString('fr-FR');
      return `- ${when} | ${f.details || 'email_failed'} | role=${f.role || '-'} | email=${f.email || '-'}`;
    }).join('\n');
    const text = [
      `Bonjour ${r.username || 'Responsable'},`,
      '',
      `Le systeme a detecte ${failures.length} echec(s) d'envoi email.`,
      '',
      summary,
    ].join('\n');

    await enqueueMail({
      kind: 'admin_critical_digest',
      role: r.role,
      to: r.email,
      subject,
      text,
      html: `<pre style="font-family:monospace;white-space:pre-wrap;">${text}</pre>`,
      job_id: `admin_critical_digest_${r._id}_${Date.now()}`,
    });
    sentCount += 1;
  }

  await setState({
    last_sent_at: now.toISOString(),
    last_failures_count: failures.length,
    last_sent_recipients: sentCount,
  });
  return { sent: sentCount > 0, recipients: sentCount, failures: failures.length };
}

module.exports = {
  sendAdminCriticalFailureDigestIfDue,
};

