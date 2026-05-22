const SecurityAudit = require('../models/SecurityAudit');
const History = require('../models/History');
const AppSetting = require('../models/AppSetting');
const { SupportTicket } = require('../models/SupportTicket');
const { summarize } = require('./perfMonitorService');
const { isGeminiConfigured, generateGeminiContent } = require('./geminiService');
const { getPythonRuntimeStatus } = require('./aiModelService');

const AI_SETTINGS_DEFAULT = Object.freeze({
  predictionsEnabled: true,
  alertesAuto: true,
  analyseConsommation: true,
});

const CACHE_TTL_MS = 15 * 60 * 1000;

const cache = {
  key: null,
  expires_at: 0,
  value: null,
};

function clampInt(value, { min, max, fallback }) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

async function getSettingValue(key, fallback = null) {
  const item = await AppSetting.findOne({ setting_key: key }).lean();
  return item?.setting_value ?? fallback;
}

async function getAiConfig() {
  const cfg = await getSettingValue('ai_config', AI_SETTINGS_DEFAULT);
  return {
    predictionsEnabled: cfg?.predictionsEnabled !== false,
    alertesAuto: cfg?.alertesAuto !== false,
    analyseConsommation: cfg?.analyseConsommation !== false,
  };
}

function hoursFromMs(ms) {
  const n = Number(ms);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Number((n / (60 * 60 * 1000)).toFixed(1));
}

function buildFallbackReport(payload) {
  const windowDays = payload?.window_days || 7;
  const s = payload?.stats || {};

  const lines = [];
  lines.push(`Rapport hebdomadaire (${windowDays} jour(s))`);
  lines.push('');

  const support = s.support || {};
  const security = s.security || {};
  const perf = s.perf || {};
  const ai = s.ai || {};
  const chatbot = s.chatbot || {};

  lines.push('Points clés :');
  lines.push(
    `- Support : ${support.created ?? 0} ticket(s) créé(s), ${support.resolved ?? 0} résolu(s), ${support.urgent_created ?? 0} urgent(s). Ouverts actuellement : ${support.open_now ?? 0}.`
  );
  lines.push(
    `- Sécurité : ${security.total_events ?? 0} événement(s), ${security.failed_logins ?? 0} échec(s) de connexion.`
  );
  if (Array.isArray(security.top_event_types) && security.top_event_types.length) {
    const top = security.top_event_types
      .slice(0, 3)
      .map((x) => `${x.type} (${x.count})`)
      .join(', ');
    lines.push(`- Types dominants : ${top}.`);
  }
  lines.push(
    `- Performance : ${perf.total_events ?? 0} événement(s) observé(s) (fenêtre en mémoire), ${perf.error_routes ?? 0} route(s) en erreur.`
  );

  const slow = Array.isArray(perf.top_slow) ? perf.top_slow[0] : null;
  if (slow?.key && Number.isFinite(Number(slow.p95_ms))) {
    lines.push(`- Route la plus lente : ${slow.key} (p95 ${slow.p95_ms}ms).`);
  }

  lines.push(
    `- IA : ${ai.admin_actions ?? 0} action(s) admin IA, ${ai.admin_errors ?? 0} erreur(s) IA.`
  );

  const readiness = chatbot.ready ? 'OK' : 'À vérifier';
  const pyState = chatbot.python?.state ? `, Python: ${chatbot.python.state}` : '';
  lines.push(`- Chatbot : ${readiness}${pyState}.`);
  lines.push('');

  const conclusion = chatbot.ready && (support.open_now || 0) === 0 && (security.failed_logins || 0) === 0
    ? 'Conclusion : Système stable sur la période.'
    : 'Conclusion : Surveillez les points signalés ci-dessus et corrigez en priorité les erreurs/alertes.';
  lines.push(conclusion);

  return {
    title: 'Résumé IA',
    text: lines.join('\n').trim(),
    source: 'fallback',
  };
}

function buildPromptFromStats(windowDays, stats) {
  const data = {
    window_days: windowDays,
    stats: stats || {},
  };
  return JSON.stringify(data, null, 2).slice(0, 8000);
}

async function tryGenerateGeminiReport(windowDays, stats) {
  if (!isGeminiConfigured()) return null;

  const systemInstruction =
    "Tu es un analyste IT. Génère un court rapport hebdomadaire en français basé UNIQUEMENT sur les chiffres et catégories fournis. " +
    "Ne mentionne jamais de données personnelles (email, IP, user-agent). " +
    "Format attendu : 1) Synthèse (2 phrases max) 2) Points clés (3 à 6 puces) 3) Conclusion + recommandation (1 phrase). " +
    "Longueur max : 1200 caractères. Ton professionnel et clair.";

  const prompt = `Données (JSON) :\n${buildPromptFromStats(windowDays, stats)}\n\nRédige le rapport.`;

  const result = await generateGeminiContent({
    prompt,
    system_instruction: systemInstruction,
    temperature: 0.35,
    max_output_tokens: 700,
  });

  const text = String(result?.text || '').trim();
  if (!text) return null;
  return {
    title: 'Résumé IA',
    text,
    source: 'gemini',
    model: result?.model || null,
    usage: result?.usage || null,
    finish_reason: result?.finish_reason || null,
  };
}

async function collectWeeklyStats(windowDays, limit) {
  const now = new Date();
  const since = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000);

  const perf = summarize({ window_ms: windowDays * 24 * 60 * 60 * 1000, limit });

  const [
    secAgg,
    failedLogins,
    supportCreated,
    supportResolved,
    urgentCreated,
    openNow,
    supportResolutionAgg,
    aiActions,
    aiErrors,
    aiConfig,
  ] = await Promise.all([
    SecurityAudit.aggregate([
      { $match: { date_event: { $gte: since } } },
      { $group: { _id: { type: '$event_type', success: '$success' }, count: { $sum: 1 } } },
    ]),
    SecurityAudit.countDocuments({ event_type: 'login_failed', date_event: { $gte: since } }),
    SupportTicket.countDocuments({ createdAt: { $gte: since } }),
    SupportTicket.countDocuments({ resolvedAt: { $gte: since } }),
    SupportTicket.countDocuments({ createdAt: { $gte: since }, priority: 'URGENT' }),
    SupportTicket.countDocuments({ status: { $in: ['NEW', 'IN_PROGRESS', 'WAITING_USER'] } }),
    SupportTicket.aggregate([
      { $match: { createdAt: { $exists: true }, resolvedAt: { $exists: true, $gte: since } } },
      { $project: { ms: { $subtract: ['$resolvedAt', '$createdAt'] } } },
      { $group: { _id: null, avg_ms: { $avg: '$ms' } } },
    ]),
    History.countDocuments({ action_type: 'ai_admin', date_action: { $gte: since } }),
    History.countDocuments({
      action_type: 'ai_admin',
      date_action: { $gte: since },
      'context.result': 'error',
    }),
    getAiConfig(),
  ]);

  const byType = {};
  for (const row of secAgg || []) {
    const type = String(row?._id?.type || 'unknown');
    const success = Boolean(row?._id?.success);
    if (!byType[type]) byType[type] = { success: 0, failed: 0, total: 0 };
    const count = Number(row?.count || 0);
    byType[type].total += count;
    if (success) byType[type].success += count;
    else byType[type].failed += count;
  }

  const topEventTypes = Object.entries(byType)
    .map(([type, v]) => ({ type, count: Number(v?.total || 0) }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const avgResolutionMs = Array.isArray(supportResolutionAgg) ? supportResolutionAgg?.[0]?.avg_ms : null;

  const pythonStatus = getPythonRuntimeStatus();
  const geminiConfigured = isGeminiConfigured();
  const chatbotReady = Boolean(aiConfig?.predictionsEnabled) && Boolean(geminiConfigured) && Boolean(pythonStatus?.ok);

  return {
    ok: true,
    window_days: windowDays,
    since: since.toISOString(),
    to: now.toISOString(),
    generated_at: now.toISOString(),
    stats: {
      support: {
        created: Number(supportCreated || 0),
        resolved: Number(supportResolved || 0),
        urgent_created: Number(urgentCreated || 0),
        open_now: Number(openNow || 0),
        avg_resolution_hours: hoursFromMs(avgResolutionMs),
      },
      security: {
        total_events: Number((secAgg || []).reduce((sum, r) => sum + Number(r?.count || 0), 0)),
        failed_logins: Number(failedLogins || 0),
        top_event_types: topEventTypes,
      },
      perf: {
        window_ms: perf?.window_ms || null,
        total_events: Number(perf?.total_events || 0),
        error_routes: Array.isArray(perf?.top_errors) ? perf.top_errors.filter((x) => Number(x?.error_count || 0) > 0).length : 0,
        top_errors: Array.isArray(perf?.top_errors) ? perf.top_errors.slice(0, 4).map((x) => ({
          key: x.key,
          error_count: Number(x.error_count || 0),
          p95_ms: x.p95_ms ?? null,
        })) : [],
        top_slow: Array.isArray(perf?.top_slow) ? perf.top_slow.slice(0, 3).map((x) => ({
          key: x.key,
          p95_ms: x.p95_ms ?? null,
          count: Number(x.count || 0),
        })) : [],
      },
      ai: {
        admin_actions: Number(aiActions || 0),
        admin_errors: Number(aiErrors || 0),
        config: aiConfig,
      },
      chatbot: {
        ready: chatbotReady,
        gemini_configured: geminiConfigured,
        python: pythonStatus ? { ok: Boolean(pythonStatus.ok), state: pythonStatus.state || null } : null,
      },
    },
  };
}

async function getAdminWeeklyAiSummary(options = {}) {
  const windowDays = clampInt(options.window_days, { min: 1, max: 30, fallback: 7 });
  const limit = clampInt(options.limit, { min: 3, max: 20, fallback: 6 });

  const cacheKey = `v1:${windowDays}:${limit}`;
  const now = Date.now();
  if (cache.key === cacheKey && cache.expires_at > now && cache.value) {
    return { ...cache.value, cached: true };
  }

  const base = await collectWeeklyStats(windowDays, limit);
  const report =
    (await tryGenerateGeminiReport(windowDays, base.stats).catch(() => null))
    || buildFallbackReport(base);

  const value = {
    ok: true,
    window_days: base.window_days,
    since: base.since,
    to: base.to,
    generated_at: base.generated_at,
    cached: false,
    stats: base.stats,
    report,
  };

  cache.key = cacheKey;
  cache.expires_at = now + CACHE_TTL_MS;
  cache.value = value;

  return value;
}

module.exports = {
  getAdminWeeklyAiSummary,
};
