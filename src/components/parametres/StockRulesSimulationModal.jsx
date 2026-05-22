import { Save, X } from 'lucide-react';

function safeNum(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

export default function StockRulesSimulationModal({
  open,
  onClose,
  impact,
  onConfirmSave,
  saving = false,
}) {
  if (!open) return null;

  const counts = impact?.counts || {};
  const alerts = impact?.alerts || {};

  return (
    <div className="sr-modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="sr-modal" onClick={(e) => e.stopPropagation()}>
        <div className="sr-modal-head">
          <div>
            <strong>Simulation d’impact</strong>
            <div className="sr-subtitle" style={{ marginTop: 4 }}>
              Aucune donnée n’a été enregistrée. Vérifiez l’effet attendu avant confirmation.
            </div>
          </div>
          <button className="btn-refresh" type="button" onClick={onClose} disabled={saving} title="Fermer">
            <X size={16} />
          </button>
        </div>

        <div className="sr-modal-body">
          <div className="sr-impact-diff">
            {[
              ['Produits sans seuil', safeNum(counts.products_without_threshold)],
              ['Sous seuil', safeNum(counts.products_under_threshold)],
              ['En rupture', safeNum(counts.products_in_rupture)],
              ['Inactifs', safeNum(counts.products_inactive)],
              ['À vérifier', safeNum(counts.products_to_verify)],
              ['Alertes qui seront générées', safeNum(alerts.total)],
            ].map(([label, value]) => (
              <div key={label} className="sr-impact-line">
                <div style={{ fontWeight: 950 }}>{label}</div>
                <div className="sr-mono" style={{ fontWeight: 950 }}>{value}</div>
              </div>
            ))}
          </div>
          {impact?.note ? <div className="sr-help">{impact.note}</div> : null}
        </div>

        <div className="sr-modal-footer">
          <button className="btn-secondary" type="button" onClick={onClose} disabled={saving}>
            Annuler
          </button>
          <button className="btn-save resp" type="button" onClick={onConfirmSave} disabled={saving}>
            <Save size={16} /> Enregistrer ces règles
          </button>
        </div>
      </div>
    </div>
  );
}
