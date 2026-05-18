import { Mail, Phone, Truck } from 'lucide-react';
import './fournisseurs.css';

const FournisseurCard = ({ fournisseur, onView }) => {
  if (!fournisseur) return null;
  return (
    <div className="resp-mini">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div className="resp-mini-name" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Truck size={18} />
          {fournisseur.name || 'Fournisseur'}
        </div>
        <button className="f360-btn" type="button" onClick={onView}>Voir fiche</button>
      </div>
      <div className="f360-muted" style={{ marginTop: 6 }}>{fournisseur.domain || 'Domaine: -'}</div>
      <div style={{ marginTop: 10, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <span className="f360-muted" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Mail size={14} />{fournisseur.email || '-'}</span>
        <span className="f360-muted" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Phone size={14} />{fournisseur.phone || '-'}</span>
      </div>
    </div>
  );
};

export default FournisseurCard;

