function layout({ title, preheader, bodyHtml }) {
  return `
<!doctype html>
<html lang="fr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title}</title>
  </head>
  <body style="margin:0;padding:0;background:#f3f6fb;font-family:Arial,sans-serif;color:#0f172a;">
    <div style="display:none;opacity:0;overflow:hidden;max-height:0;max-width:0;">${preheader || ''}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="640" cellspacing="0" cellpadding="0" style="max-width:640px;width:100%;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #dbe4f0;">
            <tr>
              <td style="background:#005bbb;padding:20px 24px;color:#ffffff;">
                <div style="font-size:12px;letter-spacing:.08em;opacity:.9;">ETAP</div>
                <div style="font-size:22px;font-weight:700;">Gestion de Stock</div>
              </td>
            </tr>
            <tr>
              <td style="padding:24px;">
                ${bodyHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:16px 24px;background:#f8fbff;color:#475569;font-size:12px;">
                Notification automatique - Merci de ne pas repondre a cet email.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
`;
}

function requestStatusTemplate({
  statusLabel,
  productName,
  quantity,
  actor,
  dateLabel,
  note,
  appUrl,
}) {
  const bodyHtml = `
    <h2 style="margin:0 0 12px;">Mise a jour de votre demande</h2>
    <p style="margin:0 0 16px;">Votre demande a ete <b>${statusLabel.toLowerCase()}</b>.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 14px;">
      <tr><td style="padding:8px 0;color:#475569;">Produit</td><td style="padding:8px 0;"><b>${productName}</b></td></tr>
      <tr><td style="padding:8px 0;color:#475569;">Quantite</td><td style="padding:8px 0;"><b>${quantity}</b></td></tr>
      <tr><td style="padding:8px 0;color:#475569;">Traitee par</td><td style="padding:8px 0;"><b>${actor}</b></td></tr>
      <tr><td style="padding:8px 0;color:#475569;">Date</td><td style="padding:8px 0;"><b>${dateLabel}</b></td></tr>
      ${note ? `<tr><td style="padding:8px 0;color:#475569;">Commentaire</td><td style="padding:8px 0;">${note}</td></tr>` : ''}
    </table>
    ${appUrl ? `<a href="${appUrl}" style="display:inline-block;padding:10px 14px;background:#005bbb;color:#fff;text-decoration:none;border-radius:8px;">Voir mes demandes</a>` : ''}
  `;
  return layout({
    title: `Demande ${statusLabel}`,
    preheader: `Votre demande est ${statusLabel.toLowerCase()}.`,
    bodyHtml,
  });
}

function newRequestTemplate({
  productName,
  quantity,
  demandeur,
  appUrl,
}) {
  const bodyHtml = `
    <h2 style="margin:0 0 12px;">Nouvelle demande produit</h2>
    <p style="margin:0 0 16px;">Une nouvelle demande a ete enregistree.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 14px;">
      <tr><td style="padding:8px 0;color:#475569;">Produit</td><td style="padding:8px 0;"><b>${productName}</b></td></tr>
      <tr><td style="padding:8px 0;color:#475569;">Quantite</td><td style="padding:8px 0;"><b>${quantity}</b></td></tr>
      <tr><td style="padding:8px 0;color:#475569;">Demandeur</td><td style="padding:8px 0;"><b>${demandeur}</b></td></tr>
    </table>
    ${appUrl ? `<a href="${appUrl}" style="display:inline-block;padding:10px 14px;background:#005bbb;color:#fff;text-decoration:none;border-radius:8px;">Ouvrir le dashboard</a>` : ''}
  `;
  return layout({
    title: 'Nouvelle demande produit',
    preheader: `Nouvelle demande ${productName}`,
    bodyHtml,
  });
}

function digestTemplate({ username, minutes, items, appUrl }) {
  const rows = items.map((it) => `<li style="margin:0 0 8px;">${it.title}: ${it.message}</li>`).join('');
  const bodyHtml = `
    <h2 style="margin:0 0 12px;">Digest notifications</h2>
    <p style="margin:0 0 16px;">Bonjour <b>${username || ''}</b>, voici vos notifications des ${minutes} dernieres minutes.</p>
    <ul style="padding-left:18px;margin:0 0 14px;">${rows || '<li>Aucune notification.</li>'}</ul>
    ${appUrl ? `<a href="${appUrl}" style="display:inline-block;padding:10px 14px;background:#005bbb;color:#fff;text-decoration:none;border-radius:8px;">Voir les notifications</a>` : ''}
  `;
  return layout({
    title: 'Digest notifications',
    preheader: `Resume des notifications (${items.length})`,
    bodyHtml,
  });
}

module.exports = {
  requestStatusTemplate,
  newRequestTemplate,
  digestTemplate,
};

