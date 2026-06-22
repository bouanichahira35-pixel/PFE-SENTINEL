// BLOC 1 - Role du fichier.
// Ce fichier fournit un composant React specialise pour FournisseurDocumentsPanel.
// Point de vigilance: garder les props, appels API et classes CSS synchronises avec les ecrans existants.

import { FileText, Plus } from 'lucide-react';
import './fournisseurs.css';

const FournisseurDocumentsPanel = ({ documents, onAdd }) => {
  const items = Array.isArray(documents) ? documents : [];
  return (
    <div className="resp-card">
      <div className="f360-toolbar">
        <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
          <FileText size={18} />
          Documents administratifs
        </h3>
        <button className="f360-btn primary" type="button" onClick={onAdd}><Plus size={16} />Ajouter</button>
      </div>

      {!items.length ? (
        <div className="resp-empty">Aucun document enregistré.</div>
      ) : (
        <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
          {items.slice(0, 6).map((d) => (
            <div key={String(d?.id)} className="resp-mini">
              <div style={{ fontWeight: 950, color: '#0f172a' }}>{d?.kind || 'Document'}</div>
              <div className="f360-muted" style={{ marginTop: 6 }}>
                Statut: {d?.status || 'Manquant'}{d?.expiresAt ? ` • Exp: ${new Date(d.expiresAt).toLocaleDateString('fr-FR')}` : ''}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default FournisseurDocumentsPanel;

