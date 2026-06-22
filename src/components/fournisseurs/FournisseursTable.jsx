// BLOC 1 - Role du fichier.
// Ce fichier fournit un composant React specialise pour FournisseursTable.
// Point de vigilance: garder les props, appels API et classes CSS synchronises avec les ecrans existants.

import { Eye, Mail, Pencil, Phone, PlusCircle, Power, Send } from 'lucide-react';
import { Link } from 'react-router-dom';
import './fournisseurs.css';

function formatDate(value) {
  if (!value) return '-';
  try {
    return new Date(value).toLocaleDateString('fr-FR');
  } catch {
    return '-';
  }
}

function statusBadge(status) {
  const s = String(status || '').toUpperCase();
  if (s === 'ACTIF') return { text: 'Actif', className: 'f360-badge success' };
  if (s === 'INACTIF') return { text: 'Inactif', className: 'f360-badge' };
  if (s === 'SUSPENDU') return { text: 'Suspendu', className: 'f360-badge danger' };
  if (s === 'A_VERIFIER') return { text: 'À vérifier', className: 'f360-badge warn' };
  return { text: status || '-', className: 'f360-badge' };
}

function reliabilityBadge(level, score) {
  const s = String(level || '').toUpperCase();
  if (s === 'FIABLE') return { text: `Fiable${typeof score === 'number' ? ` (${score.toFixed(0)})` : ''}`, className: 'f360-badge success' };
  if (s === 'A_SURVEILLER') return { text: `À surveiller${typeof score === 'number' ? ` (${score.toFixed(0)})` : ''}`, className: 'f360-badge warn' };
  if (s === 'MOYEN') return { text: `Moyen${typeof score === 'number' ? ` (${score.toFixed(0)})` : ''}`, className: 'f360-badge warn' };
  if (s === 'NON_EVALUE') return { text: 'Non évalué', className: 'f360-badge' };
  return { text: level || '-', className: 'f360-badge' };
}

const FournisseursTable = ({
  fournisseurs,
  productsCountById,
  openOrdersCountById,
  openAlertsCountById,
  scoreById,
  onNotify,
  onToggleStatus,
}) => {
  return (
    <div className="resp-card" style={{ padding: 0, overflow: 'hidden' }}>
      <table className="f360-table">
        <thead>
          <tr>
            <th>Fournisseur</th>
            <th>Domaine</th>
            <th>Contact</th>
            <th>Statut</th>
            <th>Fiabilité</th>
            <th>Produits associés</th>
            <th>Commandes ouvertes</th>
            <th>Dernière vérification</th>
            <th>Alertes</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {Array.isArray(fournisseurs) && fournisseurs.length ? (
            fournisseurs.map((s) => {
              const id = String(s?._id || s?.id || '');
              const st = statusBadge(s?.status);
              const score = typeof scoreById?.[id] === 'number' ? scoreById[id] : null;
              const rel = reliabilityBadge(s?.reliability_level, score);
              const productsCount = Number(productsCountById?.[id] || 0);
              const openOrders = Number(openOrdersCountById?.[id] || 0);
              const openAlerts = Number(openAlertsCountById?.[id] || 0);
              const isSuspended = String(s?.status || '').toUpperCase() === 'SUSPENDU';
              const nextStatus = isSuspended ? 'ACTIF' : 'SUSPENDU';
              return (
                <tr key={id}>
                  <td>
                    <div style={{ fontWeight: 950, color: '#0f172a' }}>{s?.name || '—'}</div>
                    <div className="f360-muted">{s?.main_contact ? `Contact: ${s.main_contact}` : ''}</div>
                  </td>
                  <td>{s?.domain || '—'}</td>
                  <td>
                    <div className="f360-muted" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Mail size={14} />{s?.email || '—'}</div>
                    <div className="f360-muted" style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}><Phone size={14} />{s?.phone || '—'}</div>
                  </td>
                  <td><span className={st.className}>{st.text}</span></td>
                  <td><span className={rel.className}>{rel.text}</span></td>
                  <td>{productsCount}</td>
                  <td>{openOrders}</td>
                  <td>{formatDate(s?.last_verification_date)}</td>
                  <td>
                    {openAlerts > 0 ? (
                      <Link to={`/responsable/fournisseurs/${id}/incidents`} className="resp-link">{openAlerts}</Link>
                    ) : (
                      0
                    )}
                  </td>
                  <td>
                    <div className="f360-actions">
                      <Link className="f360-btn" to={`/responsable/fournisseurs/${id}`} title="Voir fiche"><Eye size={16} />Fiche</Link>
                      <Link className="f360-btn" to={`/responsable/fournisseurs/${id}/modifier`} title="Modifier"><Pencil size={16} />Modifier</Link>
                      <Link className="f360-btn" to={`/responsable/commandes/nouvelle?fournisseurId=${encodeURIComponent(id)}`} title="Créer commande"><PlusCircle size={16} />Commande</Link>
                      <button className="f360-btn" type="button" onClick={() => onNotify?.(s)} title="Envoyer notification"><Send size={16} />Message</button>
                      <button
                        className={`f360-btn ${isSuspended ? 'success' : 'danger'}`}
                        type="button"
                        onClick={() => onToggleStatus?.(s, nextStatus)}
                        title={isSuspended ? 'Réactiver' : 'Suspendre'}
                      >
                        <Power size={16} />
                        {isSuspended ? 'Réactiver' : 'Suspendre'}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })
          ) : (
            <tr>
              <td colSpan={10}>
                <div className="resp-empty">Aucun fournisseur.</div>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
};

export default FournisseursTable;
