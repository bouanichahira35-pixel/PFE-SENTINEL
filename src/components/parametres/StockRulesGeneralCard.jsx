// BLOC 1 - Role du fichier.
// Ce fichier fournit un composant React specialise pour StockRulesGeneralCard.
// Point de vigilance: garder les props, appels API et classes CSS synchronises avec les ecrans existants.

import { AlertTriangle, Boxes, ShieldCheck } from 'lucide-react';

function ToggleRow({ label, desc, checked, onChange, disabled }) {
  return (
    <div className="toggle-item" style={disabled ? { opacity: 0.7 } : undefined}>
      <div>
        <span className="toggle-label">{label}</span>
        {desc ? <span className="toggle-desc">{desc}</span> : null}
      </div>
      <label className="toggle-switch">
        <input type="checkbox" checked={Boolean(checked)} onChange={(e) => onChange(e.target.checked)} disabled={disabled} />
        <span className="toggle-slider"></span>
      </label>
    </div>
  );
}

export default function StockRulesGeneralCard({ config, onChange, disabled = false }) {
  const seuil = Number(config?.seuilAlerte ?? 0);
  const jours = Number(config?.joursInactivite ?? 0);

  const badges = [
    { cls: config?.activerAlertesAutomatiques ? 'ok' : 'warn', text: config?.activerAlertesAutomatiques ? 'Alertes actives' : 'Alertes désactivées', icon: AlertTriangle },
    { cls: config?.bloquerSortiesStockInsuffisant ? 'ok' : 'warn', text: config?.bloquerSortiesStockInsuffisant ? 'Sorties protégées' : 'Sorties non bloquées', icon: ShieldCheck },
    { cls: config?.autoriserProduitsSansSeuil ? 'ok' : 'danger', text: config?.autoriserProduitsSansSeuil ? 'Seuil global appliqué si seuil=0/null' : 'Produits sans seuil tolérés (pas d’alerte)', icon: Boxes },
  ];

  return (
    <div className="sr-card">
      <div className="sr-card-head">
        <div className="left">
          <Boxes size={18} />
          <h3>Règles générales</h3>
        </div>
        <div className="sr-badges">
          {badges.map((b) => {
            const Icon = b.icon;
            return (
              <span key={b.text} className={`sr-badge ${b.cls}`}>
                <Icon size={14} />
                {b.text}
              </span>
            );
          })}
        </div>
      </div>

      <div className="sr-card-body">
        <div className="sr-grid">
          <div className="sr-field">
            <label>Seuil d’alerte global par défaut</label>
            <input
              type="number"
              min="0"
              max="1000000000"
              step="1"
              value={Number.isFinite(seuil) ? seuil : 0}
              disabled={disabled}
              onChange={(e) => onChange({ ...config, seuilAlerte: e.target.value })}
            />
          </div>
          <div className="sr-field">
            <label>Jours d’inactivité avant alerte</label>
            <input
              type="number"
              min="1"
              max="3650"
              step="1"
              value={Number.isFinite(jours) ? jours : 30}
              disabled={disabled}
              onChange={(e) => onChange({ ...config, joursInactivite: e.target.value })}
            />
          </div>
        </div>

        <div className="toggle-list">
          <ToggleRow
            label="Autoriser les produits sans seuil"
            desc="Si activé: seuil_minimum=0/null utilisera le seuil global. Sinon: pas d’alerte de seuil."
            checked={config?.autoriserProduitsSansSeuil}
            disabled={disabled}
            onChange={(v) => onChange({ ...config, autoriserProduitsSansSeuil: v })}
          />
          <ToggleRow
            label="Bloquer les sorties si stock insuffisant"
            desc="Si activé: impossible de sortir plus que le stock courant."
            checked={config?.bloquerSortiesStockInsuffisant}
            disabled={disabled}
            onChange={(v) => onChange({ ...config, bloquerSortiesStockInsuffisant: v })}
          />
          <ToggleRow
            label="Activer les alertes automatiques"
            desc="Active/désactive la génération automatique des alertes (seuil, rupture, inactivité...)."
            checked={config?.activerAlertesAutomatiques}
            disabled={disabled}
            onChange={(v) => onChange({ ...config, activerAlertesAutomatiques: v })}
          />
        </div>
      </div>
    </div>
  );
}

