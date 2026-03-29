const https = require('https');

function isTwilioConfigured() {
  return Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN);
}

function isTwilioSmsConfigured() {
  return Boolean(isTwilioConfigured() && process.env.TWILIO_FROM_SMS);
}

function isTwilioWhatsappConfigured() {
  return Boolean(isTwilioConfigured() && process.env.TWILIO_FROM_WHATSAPP);
}

function toUrlEncodedBody(payload) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(payload || {})) {
    if (value === undefined || value === null) continue;
    params.set(key, String(value));
  }
  return params.toString();
}

function postFormOrThrow(url, { accountSid, authToken, body }) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const authHeader = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
    const data = String(body || '');

    const req = https.request(
      {
        method: 'POST',
        hostname: parsed.hostname,
        port: parsed.port || 443,
        path: `${parsed.pathname}${parsed.search || ''}`,
        headers: {
          Authorization: `Basic ${authHeader}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(data),
        },
      },
      (res) => {
        let raw = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          raw += chunk;
        });
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ ok: true, status: res.statusCode, body: raw });
            return;
          }
          const err = new Error(`twilio_http_${res.statusCode || 0}`);
          err.status = res.statusCode;
          err.body = raw;
          reject(err);
        });
      }
    );

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function sendSmsOrThrow({ to, body }) {
  if (!isTwilioSmsConfigured()) {
    throw new Error('twilio_sms_not_configured');
  }

  const accountSid = String(process.env.TWILIO_ACCOUNT_SID || '').trim();
  const authToken = String(process.env.TWILIO_AUTH_TOKEN || '').trim();
  const from = String(process.env.TWILIO_FROM_SMS || '').trim();

  const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`;
  const formBody = toUrlEncodedBody({ From: from, To: to, Body: body });
  await postFormOrThrow(url, { accountSid, authToken, body: formBody });
}

async function sendWhatsappOrThrow({ to, body }) {
  if (!isTwilioWhatsappConfigured()) {
    throw new Error('twilio_whatsapp_not_configured');
  }

  const accountSid = String(process.env.TWILIO_ACCOUNT_SID || '').trim();
  const authToken = String(process.env.TWILIO_AUTH_TOKEN || '').trim();
  const from = String(process.env.TWILIO_FROM_WHATSAPP || '').trim();

  const toAddr = String(to || '').trim().toLowerCase().startsWith('whatsapp:')
    ? String(to || '').trim()
    : `whatsapp:${String(to || '').trim()}`;

  const fromAddr = String(from || '').trim().toLowerCase().startsWith('whatsapp:')
    ? String(from || '').trim()
    : `whatsapp:${String(from || '').trim()}`;

  const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`;
  const formBody = toUrlEncodedBody({ From: fromAddr, To: toAddr, Body: body });
  await postFormOrThrow(url, { accountSid, authToken, body: formBody });
}

module.exports = {
  isTwilioSmsConfigured,
  isTwilioWhatsappConfigured,
  sendSmsOrThrow,
  sendWhatsappOrThrow,
};

