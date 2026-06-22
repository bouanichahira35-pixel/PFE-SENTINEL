// BLOC 1 - Role du fichier.
// Ce fichier fournit un composant React specialise pour StockRulesImpactPreview.
// Point de vigilance: garder les props, appels API et classes CSS synchronises avec les ecrans existants.

import { BarChart3, TriangleAlert } from 'lucide-react';

function kpiValue(impact, key, fallback = 0) {
  const n = Number(impact?.counts?.[key] ?? fallback);
  return Number.isFinite(n) ? n : fallback;
}

export default function StockRulesImpactPreview({ impact, loading = false, onApplyGlobalThreshold }) {
  const alertsTotal = Number(impact?.alerts?.total || 0);
  const missing = kpiValue(impact, 'products_without_threshold');

  return (
    <div className="sr-card">
      <div className="sr-card-head">
        <div className="left">
          <BarChart3 size={18} />
          <h3>Simulation d’impact</h3>
        </div>
        <div className="sr-badges">
          <span className={`sr-badge ${alertsTotal >= 50 ? 'danger' : alertsTotal >= 15 ? 'warn' : 'ok'}`}>
            <TriangleAlert size={14} />
            Alertes prévues: {Number.isFinite(alertsTotal) ? alertsTotal : 0}
          </span>
        </div>
      </div>
      <div className="sr-card-body">
        {loading ? (
          <div className="sr-help">Chargement de l’impact…</div>
        ) : !impact?.counts ? (
          <div className="sr-help">Impact indisponible. Verifiez que le service est disponible.</div>
        ) : (
          <>
            <div className="sr-kpis">
              <div className="sr-kpi">
                <div className="label">Produits approuvés</div>
                <div className="value">{kpiValue(impact, 'total_approved_products')}</div>
              </div>
              <div className="sr-kpi">
                <div className="label">Produits sans seuil (0/null)</div>
                <div className="value">{missing}</div>
              </div>
              <div className="sr-kpi">
                <div className="label">Sous seuil</div>
                <div className="value">{kpiValue(impact, 'products_under_threshold')}</div>
              </div>
              <div className="sr-kpi">
                <div className="label">En rupture</div>
                <div className="value">{kpiValue(impact, 'products_in_rupture')}</div>
              </div>
              <div className="sr-kpi">
                <div className="label">Inactifs</div>
                <div className="value">{kpiValue(impact, 'products_inactive')}</div>
              </div>
              <div className="sr-kpi">
                <div className="label">À vérifier</div>
                <div className="value">{kpiValue(impact, 'products_to_verify')}</div>
              </div>
            </div>
            {impact?.note ? <div className="sr-help">{impact.note}</div> : null}
            {typeof onApplyGlobalThreshold === 'function' ? (
              <div className="sr-actions-bottom" style={{ justifyContent: 'flex-start' }}>
                <button className="btn-secondary" type="button" onClick={onApplyGlobalThreshold}>
                  Appliquer le seuil global aux produits sans seuil
                </button>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
