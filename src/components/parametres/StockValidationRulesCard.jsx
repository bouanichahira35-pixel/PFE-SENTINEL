import { CheckCircle2, ShieldAlert } from 'lucide-react';

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

export default function StockValidationRulesCard({ config, onChange, disabled = false }) {
  return (
    <div className="sr-card">
      <div className="sr-card-head">
        <div className="left">
          <CheckCircle2 size={18} />
          <h3>Contrôles du catalogue</h3>
        </div>
        <div className="sr-badges">
          <span className="sr-badge ok">
            <ShieldAlert size={14} />
            Ajout direct
          </span>
        </div>
      </div>

      <div className="sr-card-body">
        <div className="sr-help">
          Impact: les nouveaux produits ajoutés par le magasinier sont directement utilisables dans le catalogue actif.
        </div>

        <div className="toggle-list">
          <ToggleRow
            label="Validation obligatoire après modification du seuil"
            desc="Si activé: changement du seuil_minimum par non-responsable → repasse en attente."
            checked={config?.validationApresModificationSeuil}
            disabled={disabled}
            onChange={(v) => onChange({ ...config, validationApresModificationSeuil: v })}
          />
          <ToggleRow
            label="Validation obligatoire après changement de catégorie"
            desc="Si activé: changement de catégorie par non-responsable → repasse en attente."
            checked={config?.validationApresChangementCategorie}
            disabled={disabled}
            onChange={(v) => onChange({ ...config, validationApresChangementCategorie: v })}
          />
          <ToggleRow
            label='Produits incomplets envoyés automatiquement en état "À vérifier"'
            desc="Si activé: un produit sans unité ou catégorie sera compté comme « À vérifier »."
            checked={config?.produitsIncompletsEnAverifier}
            disabled={disabled}
            onChange={(v) => onChange({ ...config, produitsIncompletsEnAverifier: v })}
          />
        </div>
      </div>
    </div>
  );
}
