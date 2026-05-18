import { ShieldAlert } from 'lucide-react';
import { ALERT_STATUS, alertActionRoute, alertPill } from '../../services/fournisseurAlertService';
import './fournisseurs.css';

const FournisseurAlertCenter = ({ alerts, onTreat, onView }) => {
  const items = Array.isArray(alerts) ? alerts : [];
  return (
    <div className="resp-card">
      <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
        <ShieldAlert size={18} />
        Centre d’alertes fournisseurs
      </h3>
      {!items.length ? (
        <div className="resp-empty">Aucune alerte prioritaire.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
          {items.slice(0, 8).map((a) => {
            const pill = alertPill(a?.priority);
            const supplierName = a?.supplier?.name || 'Fournisseur';
            return (
              <div key={String(a?._id || a?.id)} className="risk-item" style={{ alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <span className={pill.className}>{pill.text}</span>
                    <div style={{ fontWeight: 950, color: '#0f172a' }}>{supplierName}</div>
                    <div className="f360-muted">{a?.type || ''}</div>
                  </div>
                  <div className="risk-meta">{a?.message || ''}</div>
                </div>
                <div className="f360-actions">
                  <button className="f360-btn" type="button" onClick={() => onView?.(alertActionRoute(a))}>Voir fiche</button>
                  <button className="f360-btn success" type="button" onClick={() => onTreat?.(a, ALERT_STATUS.TRAITEE)}>Traiter</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default FournisseurAlertCenter;

