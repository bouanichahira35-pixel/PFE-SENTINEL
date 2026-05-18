import { AlertTriangle, BellRing } from 'lucide-react';

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

export default function StockAlertRulesCard({ config, onChange, disabled = false }) {
  const alertsEnabled = Boolean(config?.activerAlertesAutomatiques);
  const rowsDisabled = disabled || !alertsEnabled;

  return (
    <div className="sr-card">
      <div className="sr-card-head">
        <div className="left">
          <BellRing size={18} />
          <h3>Alertes automatiques</h3>
        </div>
        <div className="sr-badges">
          <span className={`sr-badge ${alertsEnabled ? 'ok' : 'warn'}`}>
            <AlertTriangle size={14} />
            {alertsEnabled ? 'Actif' : 'Désactivé'}
          </span>
        </div>
      </div>
      <div className="sr-card-body">
        {!alertsEnabled ? (
          <div className="sr-help">
            Les alertes automatiques sont désactivées dans les règles générales. Les réglages ci-dessous sont conservés mais non appliqués.
          </div>
        ) : null}

        <div className="toggle-list">
          <ToggleRow
            label="Alerte stock sous seuil"
            desc="Produit sous seuil si quantité_stock <= seuil_effectif."
            checked={config?.alerteStockSousSeuil}
            disabled={rowsDisabled}
            onChange={(v) => onChange({ ...config, alerteStockSousSeuil: v })}
          />
          <ToggleRow
            label="Alerte rupture stock"
            desc="Produit en rupture si quantité_stock = 0."
            checked={config?.alerteRuptureStock}
            disabled={rowsDisabled}
            onChange={(v) => onChange({ ...config, alerteRuptureStock: v })}
          />
          <ToggleRow
            label="Alerte produit inactif"
            desc="Produit inactif si aucun mouvement depuis N jours (approximation backend)."
            checked={config?.alerteProduitInactif}
            disabled={rowsDisabled}
            onChange={(v) => onChange({ ...config, alerteProduitInactif: v })}
          />
          <ToggleRow
            label="Alerte produit sans fournisseur"
            desc="Produit sans fournisseur principal/liaison fournisseur."
            checked={config?.alerteProduitSansFournisseur}
            disabled={rowsDisabled}
            onChange={(v) => onChange({ ...config, alerteProduitSansFournisseur: v })}
          />
          <ToggleRow
            label="Alerte produit sans unité ou catégorie"
            desc="Marque les produits incomplets comme à vérifier."
            checked={config?.alerteProduitSansUniteOuCategorie}
            disabled={rowsDisabled}
            onChange={(v) => onChange({ ...config, alerteProduitSansUniteOuCategorie: v })}
          />
        </div>
      </div>
    </div>
  );
}

