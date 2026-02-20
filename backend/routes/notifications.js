const router = require('express').Router();
const Notification = require('../models/Notification');
const User = require('../models/User');
const SecurityAudit = require('../models/SecurityAudit');
const requireAuth = require('../middlewares/requireAuth');
const { verifyMailer, isMailConfigured } = require('../services/mailerService');
const { enqueueMail, getMailQueueHealth } = require('../services/mailQueueService');
const { getUserPreferences } = require('../services/userPreferencesService');
const { sendAdminCriticalFailureDigestIfDue } = require('../services/adminMailDigestService');
const { digestTemplate } = require('../services/mailTemplates');

router.get('/', requireAuth, async (req, res) => {
  try {
    const items = await Notification.find({ user: req.user.id })
      .sort({ createdAt: -1 })
      .limit(200);
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

router.get('/summary', requireAuth, async (req, res) => {
  try {
    const [total, unread] = await Promise.all([
      Notification.countDocuments({ user: req.user.id }),
      Notification.countDocuments({ user: req.user.id, is_read: false }),
    ]);
    return res.json({ total, unread });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch notifications summary' });
  }
});

router.patch('/:id/read', requireAuth, async (req, res) => {
  try {
    const item = await Notification.findOneAndUpdate(
      { _id: req.params.id, user: req.user.id },
      { $set: { is_read: true } },
      { new: true }
    );
    if (!item) return res.status(404).json({ error: 'Notification not found' });
    res.json(item);
  } catch (err) {
    res.status(400).json({ error: 'Failed to update notification' });
  }
});

router.patch('/read-all', requireAuth, async (req, res) => {
  try {
    const result = await Notification.updateMany(
      { user: req.user.id, is_read: false },
      { $set: { is_read: true } }
    );
    return res.json({ updated: Number(result.modifiedCount || 0) });
  } catch (err) {
    return res.status(400).json({ error: 'Failed to mark notifications as read' });
  }
});

router.get('/mail/status', requireAuth, async (req, res) => {
  try {
    // keep endpoint available for both magasinier and responsable dashboards
    const verify = await verifyMailer();
    const queue = await getMailQueueHealth();
    const failed = await SecurityAudit.find({ event_type: 'email_failed' }).sort({ createdAt: -1 }).limit(1).lean();
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [sent24h, failed24h] = await Promise.all([
      SecurityAudit.countDocuments({ event_type: 'email_sent', createdAt: { $gte: since } }),
      SecurityAudit.countDocuments({ event_type: 'email_failed', createdAt: { $gte: since } }),
    ]);
    return res.json({
      configured: isMailConfigured(),
      smtp_ok: verify.ok,
      reason: verify.reason || null,
      queue,
      sent_24h: sent24h,
      failed_24h: failed24h,
      last_failure: failed[0] || null,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to check mail status' });
  }
});

router.post('/mail/test', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('username email role').lean();
    if (!user?.email) return res.status(400).json({ error: 'Email utilisateur introuvable' });

    await enqueueMail({
      kind: 'test_mail',
      role: user.role,
      to: user.email,
      subject: 'Test notification email - ETAP',
      text: `Bonjour ${user.username || ''}, ce message confirme que le service email fonctionne.`,
      html: `<p>Bonjour <b>${user.username || ''}</b>,</p><p>ce message confirme que le service email fonctionne.</p>`,
      job_id: `test_mail_${user._id}_${Date.now()}`,
    });
    return res.json({ message: 'Email test envoye', to: user.email });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to send test mail' });
  }
});

router.post('/mail/digest', requireAuth, async (req, res) => {
  try {
    const minutesRaw = Number(req.body?.minutes || 30);
    const minutes = Number.isFinite(minutesRaw) ? Math.max(5, Math.min(240, minutesRaw)) : 30;
    const since = new Date(Date.now() - minutes * 60 * 1000);
    const user = await User.findById(req.user.id).select('username email role').lean();
    if (!user?.email) return res.status(400).json({ error: 'Email utilisateur introuvable' });

    const prefs = await getUserPreferences(req.user.id);
    if (!prefs?.notifications?.email) {
      return res.status(400).json({ error: 'Notifications email desactivees pour cet utilisateur' });
    }

    const items = await Notification.find({
      user: req.user.id,
      createdAt: { $gte: since },
    })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    const subject = `Digest notifications (${items.length})`;
    const text = `Bonjour ${user.username || ''}, vous avez ${items.length} notification(s) sur les ${minutes} dernieres minutes.`;
    const appUrl = process.env.APP_BASE_URL || process.env.FRONTEND_URL || '';
    const html = digestTemplate({
      username: user.username,
      minutes,
      items: items.map((n) => ({ title: n.title || 'Notification', message: n.message || '' })),
      appUrl: appUrl ? `${appUrl}/${user.role}` : '',
    });

    await enqueueMail({
      kind: 'digest',
      role: user.role,
      to: user.email,
      subject,
      text,
      html,
      job_id: `digest_${user._id}_${minutes}_${Date.now()}`,
    });

    return res.json({ message: 'Digest programme', notifications_count: items.length, minutes });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to enqueue digest email' });
  }
});

router.post('/mail/admin-critical-digest', requireAuth, async (req, res) => {
  try {
    if (req.user.role !== 'responsable') return res.status(403).json({ error: 'Acces refuse' });
    const result = await sendAdminCriticalFailureDigestIfDue();
    return res.json({ ok: true, result });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to trigger admin critical digest' });
  }
});

module.exports = router;
