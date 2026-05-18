import { AlertTriangle, Check, X } from 'lucide-react';

export default function ApplyGlobalThresholdModal({
  open,
  onClose,
  onConfirm,
  missingCount = 0,
  globalThreshold = 0,
  saving = false,
}) {
  if (!open) return null;

  return (
    <div className="sr-modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="sr-modal" onClick={(e) => e.stopPropagation()} style={{ width: 'min(720px, 96vw)' }}>
        <div className="sr-modal-head">
          <div>
            <strong>Appliquer le seuil global</strong>
            <div className="sr-subtitle" style={{ marginTop: 4 }}>
              Application uniquement aux produits avec <span className="sr-mono">seuil_minimum = 0</span> ou <span className="sr-mono">null</span>.
            </div>
          </div>
          <button className="btn-refresh" type="button" onClick={onClose} disabled={saving} title="Fermer">
            <X size={16} />
          </button>
        </div>
        <div className="sr-modal-body">
          <div className="sr-badges">
            <span className={`sr-badge ${missingCount > 0 ? 'warn' : 'ok'}`}>
              <AlertTriangle size={14} />
              Produits sans seuil: {Number(missingCount || 0)}
            </span>
            <span className="sr-badge ok">
              <Check size={14} />
              Seuil global: {Number(globalThreshold || 0)}
            </span>
          </div>
          <div className="sr-help">
            Les seuils personnalisés existants ne seront jamais écrasés.
          </div>
        </div>
        <div className="sr-modal-footer">
          <button className="btn-secondary" type="button" onClick={onClose} disabled={saving}>
            Annuler
          </button>
          <button className="btn-save resp" type="button" onClick={onConfirm} disabled={saving}>
            <Check size={16} /> Confirmer l’application
          </button>
        </div>
      </div>
    </div>
  );
}

