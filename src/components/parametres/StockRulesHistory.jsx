// BLOC 1 - Role du fichier.
// Ce fichier fournit un composant React specialise pour StockRulesHistory.
// Point de vigilance: garder les props, appels API et classes CSS synchronises avec les ecrans existants.

import { History as HistoryIcon } from 'lucide-react';

function formatFrDateTime(value) {
  if (!value) return '-';
  try {
    return new Date(value).toLocaleString('fr-FR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch {
    return String(value);
  }
}

function humanAction(action) {
  if (action === 'stock_rules_update') return 'Mise à jour';
  if (action === 'stock_rules_apply') return 'Application seuil';
  if (action === 'stock_rules_reset') return 'Valeurs par défaut';
  return action || '-';
}

export default function StockRulesHistory({ items = [], loading = false }) {
  return (
    <div className="sr-card">
      <div className="sr-card-head">
        <div className="left">
          <HistoryIcon size={18} />
          <h3>Historique des modifications</h3>
        </div>
        <div className="sr-badges">
          <span className="sr-badge">{Array.isArray(items) ? items.length : 0} entrées</span>
        </div>
      </div>
      <div className="sr-card-body">
        {loading ? (
          <div className="sr-help">Chargement de l’historique…</div>
        ) : !items?.length ? (
          <div className="sr-help">Aucune modification journalisée pour le moment.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="sr-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Utilisateur</th>
                  <th>Action</th>
                  <th>Règle modifiée</th>
                  <th>Ancienne valeur</th>
                  <th>Nouvelle valeur</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => {
                  const changes = Array.isArray(row?.context?.changes) ? row.context.changes : [];
                  const first = changes[0] || null;
                  return (
                    <tr key={row._id || `${row.date}-${row.action}`}>
                      <td className="sr-mono">{formatFrDateTime(row?.date)}</td>
                      <td>{row?.user?.username || '-'}</td>
                      <td>{humanAction(row?.action)}</td>
                      <td className="sr-mono">{first?.key || '-'}</td>
                      <td className="sr-mono">{first?.before !== undefined ? String(first.before) : '-'}</td>
                      <td className="sr-mono">{first?.after !== undefined ? String(first.after) : '-'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="sr-help" style={{ marginTop: 8 }}>
              Astuce: seules les premières différences sont affichées par ligne (détails complets conservés côté audit).
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

