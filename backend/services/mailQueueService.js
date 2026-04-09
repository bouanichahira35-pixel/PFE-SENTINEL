const { Queue, Worker } = require('bullmq');
const IORedis = require('ioredis');
const { sendMailOrThrow, isMailConfigured } = require('./mailerService');
const { logSecurityEvent } = require('./securityAuditService');
const User = require('../models/User');
const Notification = require('../models/Notification');

const MAIL_QUEUE_NAME = process.env.MAIL_QUEUE_NAME || 'mail_notifications';
const MAIL_QUEUE_ENABLED = String(process.env.MAIL_QUEUE_ENABLED || 'true') === 'true';
const MAIL_QUEUE_ATTEMPTS = Number(process.env.MAIL_QUEUE_ATTEMPTS || 5);
const MAIL_QUEUE_BACKOFF_MS = Number(process.env.MAIL_QUEUE_BACKOFF_MS || 10000);

let redisConnection = null;
let queue = null;
let worker = null;
let queueReady = false;
let queueError = null;

function getRedisConnection() {
  if (redisConnection) return redisConnection;
  if (!process.env.REDIS_URL) return null;
  redisConnection = new IORedis(process.env.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
  });
  redisConnection.on('error', (err) => {
    queueError = err?.message || 'redis_error';
  });
  return redisConnection;
}

async function initMailQueue() {
  if (!MAIL_QUEUE_ENABLED || !isMailConfigured()) {
    queueReady = false;
    return { enabled: false, reason: !isMailConfigured() ? 'mail_not_configured' : 'queue_disabled' };
  }

  const connection = getRedisConnection();
  if (!connection) {
    queueReady = false;
    queueError = 'redis_url_missing';
    return { enabled: false, reason: queueError };
  }

  queue = new Queue(MAIL_QUEUE_NAME, { connection });
  worker = new Worker(
    MAIL_QUEUE_NAME,
    async (job) => {
      const payload = job.data || {};
      await sendMailOrThrow({
        to: payload.to,
        subject: payload.subject,
        text: payload.text,
        html: payload.html,
      });
      await logSecurityEvent({
        event_type: 'email_sent',
        email: payload.to,
        role: payload.role,
        success: true,
        details: `Queued mail sent (${payload.kind || 'generic'})`,
        after: {
          queue_job_id: job.id,
          subject: payload.subject,
          kind: payload.kind || 'generic',
        },
      });
    },
    { connection }
  );

  worker.on('failed', async (job, err) => {
    await logSecurityEvent({
      event_type: 'email_failed',
      email: job?.data?.to,
      role: job?.data?.role,
      success: false,
      details: `Queued mail failed (${job?.data?.kind || 'generic'}): ${err?.message || 'failed'}`,
      after: {
        queue_job_id: job?.id || null,
        subject: job?.data?.subject || null,
      },
    });

    // Notify admins in-app (best-effort): helps the IT admin react quickly to mail outages.
    try {
      const admins = await User.find({ role: 'admin', status: 'active' })
        .select('_id')
        .limit(20)
        .lean();
      if (admins.length) {
        await Notification.insertMany(admins.map((a) => ({
          user: a._id,
          title: 'Incident email (queue)',
          message: [
            `Echec envoi email: ${job?.data?.to || '-'}`,
            `Type: ${job?.data?.kind || 'generic'}`,
            `Raison: ${err?.message || 'failed'}`,
          ].join('\n'),
          type: 'warning',
          is_read: false,
        })));
      }
    } catch {
      // ignore notify errors
    }
  });

  queueReady = true;
  queueError = null;
  return { enabled: true };
}

async function enqueueMail(payload) {
  if (!queueReady || !queue) {
    await sendMailOrThrow({
      to: payload.to,
      subject: payload.subject,
      text: payload.text,
      html: payload.html,
    });
    return { queued: false, fallback: true };
  }

  await queue.add('send_mail', payload, {
    attempts: MAIL_QUEUE_ATTEMPTS,
    backoff: { type: 'exponential', delay: MAIL_QUEUE_BACKOFF_MS },
    removeOnComplete: 200,
    removeOnFail: 200,
    jobId: payload.job_id || undefined,
  });
  return { queued: true, fallback: false };
}

async function getMailQueueHealth() {
  if (!queueReady || !queue) {
    return {
      enabled: MAIL_QUEUE_ENABLED,
      ready: false,
      reason: queueError || 'queue_not_ready',
    };
  }
  const counts = await queue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed');
  return {
    enabled: true,
    ready: true,
    counts,
  };
}

module.exports = {
  initMailQueue,
  enqueueMail,
  getMailQueueHealth,
};
