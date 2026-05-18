import { History } from 'lucide-react';
import './fournisseurs.css';

function formatDateTime(value) {
  if (!value) return '-';
  try {
    return new Date(value).toLocaleString('fr-FR');
  } catch {
    return '-';
  }
}

function actionLabel(action) {
  const a = String(action || '').toUpperCase();
  if (a === 'CREATION') return 'Création fournisseur';
  if (a === 'MODIFICATION') return 'Modification';
  if (a === 'SUSPENSION') return 'Suspension';
  if (a === 'REACTIVATION') return 'Réactivation';
  if (a === 'CHANGEMENT_STATUT') return 'Changement statut';
  if (a === 'CHANGEMENT_FIABILITE') return 'Changement fiabilité';
  if (a === 'TRAITEMENT_ALERTE') return 'Traitement alerte';
  return action || 'Action';
}

const FournisseurTimeline = ({ items }) => {
  const list = Array.isArray(items) ? items : [];
  return (
    <div className="resp-card" id="historique">
      <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
        <History size={18} />
        Historique
      </h3>
      {!list.length ? (
        <div className="resp-empty">Aucune action journalisée.</div>
      ) : (
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {list.slice(0, 30).map((h) => (
            <div key={String(h?._id || h?.id || `${h?.createdAt}-${h?.action}`)} className="incident-item">
              <div className="incident-top">
                <div style={{ fontWeight: 950, color: '#0f172a' }}>{actionLabel(h?.action)}</div>
                <div className="f360-muted">{formatDateTime(h?.createdAt)}</div>
              </div>
              {h?.comment ? <div className="incident-msg">{h.comment}</div> : null}
              {h?.new_value || h?.old_value ? (
                <div className="f360-muted" style={{ marginTop: 8 }}>
                  {h?.old_value ? 'Avant: ' : ''}{h?.old_value ? JSON.stringify(h.old_value) : ''}
                  {h?.new_value ? ' • Après: ' : ''}{h?.new_value ? JSON.stringify(h.new_value) : ''}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default FournisseurTimeline;

