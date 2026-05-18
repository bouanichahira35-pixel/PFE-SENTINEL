import { Mail, Pencil, Phone, Power, Send, ShoppingCart, Truck } from 'lucide-react';
import './fournisseurs.css';

function formatDate(value) {
  if (!value) return '-';
  try {
    return new Date(value).toLocaleDateString('fr-FR');
  } catch {
    return '-';
  }
}

function statusTone(status) {
  const s = String(status || '').toUpperCase();
  if (s === 'ACTIF') return { text: 'Actif', cls: 'success' };
  if (s === 'SUSPENDU') return { text: 'Suspendu', cls: 'danger' };
  if (s === 'A_VERIFIER') return { text: 'À vérifier', cls: 'warn' };
  if (s === 'INACTIF') return { text: 'Inactif', cls: '' };
  return { text: status || '-', cls: '' };
}

function reliabilityTone(level) {
  const s = String(level || '').toUpperCase();
  if (s === 'FIABLE') return { text: 'Fiable', cls: 'success' };
  if (s === 'A_SURVEILLER') return { text: 'À surveiller', cls: 'warn' };
  if (s === 'MOYEN') return { text: 'Moyen', cls: 'warn' };
  if (s === 'CRITIQUE') return { text: 'Critique', cls: 'danger' };
  if (s === 'NON_EVALUE') return { text: 'Non évalué', cls: '' };
  return { text: level || '-', cls: '' };
}

const FournisseurDetailsHeader = ({
  fournisseur,
  score,
  onEdit,
  onCreateOrder,
  onNotify,
  onToggleStatus,
}) => {
  if (!fournisseur) return null;
  const st = statusTone(fournisseur.status);
  const rel = reliabilityTone(fournisseur.reliability_level);
  const isSuspended = String(fournisseur.status || '').toUpperCase() === 'SUSPENDU';
  return (
    <div className="resp-card">
      <div className="f360-toolbar">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ fontWeight: 1000, fontSize: 18, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 10 }}>
              <Truck size={20} />
              {fournisseur.name || 'Fournisseur'}
            </div>
            <span className={`f360-badge ${st.cls}`}>{st.text}</span>
            <span className={`f360-badge ${rel.cls}`}>{rel.text}{typeof score === 'number' ? ` • ${score.toFixed(0)}/100` : ''}</span>
          </div>
          <div className="f360-muted" style={{ marginTop: 8 }}>
            Dernière vérification: {formatDate(fournisseur.last_verification_date)} • Domaine: {fournisseur.domain || '—'}
          </div>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 10 }}>
            <span className="f360-muted" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Mail size={14} />{fournisseur.email || '—'}</span>
            <span className="f360-muted" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Phone size={14} />{fournisseur.phone || '—'}</span>
          </div>
        </div>

        <div className="f360-actions">
          <button className="f360-btn" type="button" onClick={onEdit}><Pencil size={16} />Modifier</button>
          <button className="f360-btn" type="button" onClick={onCreateOrder}><ShoppingCart size={16} />Créer commande</button>
          <button className="f360-btn" type="button" onClick={onNotify}><Send size={16} />Notification</button>
          <button className={`f360-btn ${isSuspended ? 'success' : 'danger'}`} type="button" onClick={onToggleStatus}>
            <Power size={16} />{isSuspended ? 'Réactiver' : 'Suspendre'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default FournisseurDetailsHeader;

