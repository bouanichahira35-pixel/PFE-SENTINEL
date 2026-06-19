import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, RefreshCw, Search, XCircle, X } from 'lucide-react';
import SidebarResp from '../../components/responsable/SidebarResp';
import HeaderPage from '../../components/shared/HeaderPage';
import ProtectedPage from '../../components/shared/ProtectedPage';
import LoadingSpinner from '../../components/shared/LoadingSpinner';
import { useToast } from '../../components/shared/Toast';
import { get, post } from '../../services/api';
import './DemandesAValider.css';

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   UTILITAIRES DE FORMATAGE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

function formatDt(value) {
  if (!value) return '-';
  try {
    return new Date(value).toLocaleString('fr-FR', { 
      day: '2-digit', 
      month: '2-digit', 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  } catch {
    return '-';
  }
}

// 🔹 Nettoie les énumérations avec underscores → format lisible
function formatEnumValue(value) {
  if (!value) return '-';
  return String(value)
    .replace(/_/g, ' ')
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

// 🔹 Urgence basée sur le temps écoulé depuis création
function calculateUrgency(createdAt) {
  const now = new Date();
  const created = new Date(createdAt);
  const hours = (now - created) / (1000 * 60 * 60);
  
  if (hours > 24) return 'CRITIQUE';
  if (hours > 12) return 'ÉLEVÉ';
  if (hours > 4) return 'NORMAL';
  return 'FAIBLE';
}

// 🔹 Statut "En retard" basé sur le nombre de jours d'attente
function getDelayStatus(createdAt) {
  const now = new Date();
  const created = new Date(createdAt);
  const days = (now - created) / (1000 * 60 * 60 * 24);
  
  if (days > 7) return { label: 'En retard', color: 'danger' };
  if (days > 4) return { label: 'À traiter rapidement', color: 'warn' };
  if (days > 1) return { label: 'En attente', color: 'gray' };
  return { label: 'Nouveau', color: 'blue' };
}

// 🔹 Gravité stock : détecte si stock insuffisant
function getStockGravity(stock, requested) {
  const current = Number(stock || 0);
  const req = Number(requested || 0);
  const diff = current - req;
  
  if (diff < 0) return 'CRITIQUE';  // Stock négatif après demande
  if (diff < req * 0.2) return 'ÉLEVÉ';  // Stock faible après demande
  return 'OK';
}

// 🔹 Vérifie si la demande peut être approuvée (stock disponible)
function canApproveDemand(stock, requested) {
  return Number(stock || 0) >= Number(requested || 0);
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   MODAL REJET PERSONNALISÉ
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

function RejectModal({ reference, onConfirm, onCancel }) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = () => {
    if (!reason.trim()) {
      setError('Le motif est obligatoire');
      return;
    }
    onConfirm(reason);
  };

  return (
    <div className="dav-modal-backdrop">
      <div className="dav-modal">
        <div className="dav-modal-header">
          <h3>Rejeter la demande {reference}</h3>
          <button className="dav-modal-close" onClick={onCancel}>
            <X size={18} />
          </button>
        </div>
        
        <div className="dav-modal-body">
          <label htmlFor="reject-reason">Motif du rejet <span className="required">*</span></label>
          <textarea
            id="reject-reason"
            className="dav-modal-textarea"
            placeholder="Veuillez saisir le motif du rejet..."
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              setError('');
            }}
            rows={5}
          />
          {error && <div className="dav-modal-error">{error}</div>}
        </div>

        <div className="dav-modal-footer">
          <button className="btn secondary" onClick={onCancel}>
            Annuler
          </button>
          <button className="btn danger" onClick={handleSubmit}>
            Confirmer le rejet
          </button>
        </div>
      </div>
    </div>
  );
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   COMPOSANT PRINCIPAL
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const DemandesAValider = ({ userName, onLogout }) => {
  const toast = useToast();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [actionBusyId, setActionBusyId] = useState('');
  const [demandes, setDemandes] = useState([]);
  const [query, setQuery] = useState('');
  const [urgencyFilter, setUrgencyFilter] = useState('all');
  const [stockFilter, setStockFilter] = useState('all');
  const [rejectingDemandId, setRejectingDemandId] = useState(null);
  const [rejectingReference, setRejectingReference] = useState('');

  // Chargement des demandes
  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data } = await get('/demandes/a-valider');
      setDemandes(Array.isArray(data) ? data : []);
    } catch (err) {
      toast.error(err.message || 'Erreur chargement demandes');
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  // Filtrage et tri
  const filtered = useMemo(() => {
    let result = demandes;

    // Filtre urgence
    if (urgencyFilter !== 'all') {
      result = result.filter(d => calculateUrgency(d.createdAt) === urgencyFilter);
    }

    // Filtre stock
    if (stockFilter !== 'all') {
      result = result.filter(d => getStockGravity(d.product_id?.quantity_current, d.quantity_requested) === stockFilter);
    }

    // Recherche textuelle
    const q = String(query || '').trim().toLowerCase();
    if (q) {
      result = result.filter(d => {
        const haystack = [
          d.reference, 
          d.product_id?.name, 
          d.demandeur_id?.username
        ].join(' ').toLowerCase();
        return haystack.includes(q);
      });
    }

    // Tri : urgence d'abord, puis statut retard
    result.sort((a, b) => {
      const urgA = calculateUrgency(a.createdAt);
      const urgB = calculateUrgency(b.createdAt);
      const urgOrder = { 'CRITIQUE': 0, 'ÉLEVÉ': 1, 'NORMAL': 2, 'FAIBLE': 3 };
      return (urgOrder[urgA] || 4) - (urgOrder[urgB] || 4);
    });

    return result;
  }, [demandes, query, urgencyFilter, stockFilter]);

  // Statistiques
  const stats = useMemo(() => ({
    total: demandes.length,
    critiques: demandes.filter(d => calculateUrgency(d.createdAt) === 'CRITIQUE').length,
    stockCritique: demandes.filter(d => getStockGravity(d.product_id?.quantity_current, d.quantity_requested) === 'CRITIQUE').length,
    enRetard: demandes.filter(d => getDelayStatus(d.createdAt).color === 'danger').length,
  }), [demandes]);

  // Approuver une demande
  const approveDemand = async (id, reference, stock, requested) => {
    // Vérification métier : stock insuffisant
    if (!canApproveDemand(stock, requested)) {
      toast.error(`Stock insuffisant pour approuver ${reference}. Vous devez rejeter ou créer une commande fournisseur.`);
      return;
    }

    const ok = window.confirm(`Approuver demande ${reference} ?`);
    if (!ok) return;

    setActionBusyId(id);
    try {
      await post(`/demandes/${id}/approve`, {});
      setDemandes(demandes.filter(d => d._id !== id));
      toast.success('Demande approuvée');
      await load();
    } catch (err) {
      toast.error(err.message || 'Erreur approbation');
    } finally {
      setActionBusyId('');
    }
  };

  // Initier rejet (ouvre modal)
  const initiateRejectDemand = (id, reference) => {
    setRejectingDemandId(id);
    setRejectingReference(reference);
  };

  // Confirmer rejet (depuis modal)
  const confirmRejectDemand = async (reason) => {
    if (!rejectingDemandId) return;

    setActionBusyId(rejectingDemandId);
    try {
      await post(`/demandes/${rejectingDemandId}/reject`, { reason });
      setDemandes(demandes.filter(d => d._id !== rejectingDemandId));
      toast.success('Demande rejetée avec motif enregistré');
      await load();
    } catch (err) {
      toast.error(err.message || 'Erreur rejet');
    } finally {
      setActionBusyId('');
      setRejectingDemandId(null);
      setRejectingReference('');
    }
  };

  // Annuler rejet (ferme modal)
  const cancelRejectDemand = () => {
    setRejectingDemandId(null);
    setRejectingReference('');
  };

  return (
    <ProtectedPage requiredRole="responsable" userName={userName}>
      <div className="app-layout">
        <div className={`sidebar-backdrop ${sidebarCollapsed ? 'hidden' : ''}`} onClick={() => setSidebarCollapsed(true)} />
        <SidebarResp 
          collapsed={sidebarCollapsed} 
          onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} 
          onLogout={onLogout} 
          userName={userName} 
        />

        <div className="main-container">
          <HeaderPage 
            userName={userName} 
            title="Demandes à valider" 
            showSearch={false} 
            onMenuClick={() => setSidebarCollapsed(p => !p)} 
          />
          <main className="main-content">
            {isLoading && <LoadingSpinner overlay text="Chargement..." />}

            {/* Toolbar recherche et filtres */}
            <div className="dav-toolbar">
              <div className="dav-search">
                <Search size={16} />
                <input 
                  value={query} 
                  onChange={(e) => setQuery(e.target.value)} 
                  placeholder="Rechercher demande..." 
                />
              </div>
              <select value={urgencyFilter} onChange={(e) => setUrgencyFilter(e.target.value)}>
                <option value="all">Toutes urgences</option>
                <option value="CRITIQUE">🔴 Critique (> 24h)</option>
                <option value="ÉLEVÉ">🟠 Élevé (12-24h)</option>
                <option value="NORMAL">🟡 Normal (4-12h)</option>
                <option value="FAIBLE">🟢 Faible (&lt; 4h)</option>
              </select>
              <select value={stockFilter} onChange={(e) => setStockFilter(e.target.value)}>
                <option value="all">Tout stock</option>
                <option value="CRITIQUE">Stock insuffisant</option>
                <option value="ÉLEVÉ">Stock faible</option>
                <option value="OK">Stock ok</option>
              </select>
              <button className="btn" onClick={load} disabled={isLoading}>
                <RefreshCw size={16} /> Actualiser
              </button>
            </div>

            {/* KPIs */}
            <div className="dav-kpis">
              <div className="kpi-box">
                <div className="kpi-label">À valider</div>
                <div className="kpi-value">{stats.total}</div>
              </div>
              <div className="kpi-box critical">
                <div className="kpi-label">Critiques (> 24h)</div>
                <div className="kpi-value">{stats.critiques}</div>
              </div>
              <div className="kpi-box warning">
                <div className="kpi-label">Stock critique</div>
                <div className="kpi-value">{stats.stockCritique}</div>
              </div>
              <div className="kpi-box danger">
                <div className="kpi-label">En retard (> 7j)</div>
                <div className="kpi-value">{stats.enRetard}</div>
              </div>
            </div>

            {/* Liste demandes */}
            <div className="dav-list">
              {filtered.length === 0 ? (
                <div className="dav-empty">Aucune demande à valider.</div>
              ) : (
                filtered.map((dem) => {
                  const urgency = calculateUrgency(dem.createdAt);
                  const delayStatus = getDelayStatus(dem.createdAt);
                  const stockGrav = getStockGravity(dem.product_id?.quantity_current, dem.quantity_requested);
                  const canApprove = canApproveDemand(dem.product_id?.quantity_current, dem.quantity_requested);
                  const busy = String(actionBusyId) === String(dem._id);

                  return (
                    <div key={dem._id} className={`dav-item ${urgency.toLowerCase()}`}>
                      {/* En-tête : référence et badges */}
                      <div className="dav-item-head">
                        <div>
                          <div className="dav-ref">{dem.reference}</div>
                          <div className="dav-product">{dem.product_id?.name || 'Produit'}</div>
                          <div className="dav-demandeur">Demandeur : {dem.demandeur_id?.username || 'N/A'}</div>
                        </div>
                        <div className="dav-badges">
                          <span className={`badge urgency ${urgency.toLowerCase()}`}>{urgency}</span>
                          <span className={`badge delay ${delayStatus.color}`}>{delayStatus.label}</span>
                          <span className={`badge stock ${stockGrav.toLowerCase()}`}>Stock: {stockGrav}</span>
                        </div>
                      </div>

                      {/* Détails stock et dates */}
                      <div className="dav-details">
                        <span>Quantité demandée : <strong>{dem.quantity_requested}</strong> {dem.product_id?.unit || 'u'}</span>
                        <span>Stock système : <strong>{dem.product_id?.quantity_current || 0}</strong> {dem.product_id?.unit || 'u'}</span>
                        <span>Stock après commande : <strong className={canApprove ? 'positive' : 'negative'}>
                          {Math.max(0, Number(dem.product_id?.quantity_current || 0) - Number(dem.quantity_requested || 0))}
                        </strong></span>
                        <span>Soumise le : <strong>{formatDt(dem.createdAt)}</strong></span>
                      </div>

                      {/* Actions : Approuver / Rejeter */}
                      <div className="dav-actions">
                        {canApprove ? (
                          <button 
                            className="btn success" 
                            onClick={() => approveDemand(dem._id, dem.reference, dem.product_id?.quantity_current, dem.quantity_requested)}
                            disabled={busy}
                          >
                            <CheckCircle2 size={16} /> Approuver
                          </button>
                        ) : (
                          <button className="btn disabled" disabled title="Stock insuffisant">
                            <CheckCircle2 size={16} /> Stock insuffisant
                          </button>
                        )}
                        <button 
                          className="btn danger" 
                          onClick={() => initiateRejectDemand(dem._id, dem.reference)}
                          disabled={busy}
                        >
                          <XCircle size={16} /> Rejeter
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </main>
        </div>
      </div>

      {/* Modal rejet avec motif obligatoire */}
      {rejectingDemandId && (
        <RejectModal 
          reference={rejectingReference}
          onConfirm={confirmRejectDemand}
          onCancel={cancelRejectDemand}
        />
      )}
    </ProtectedPage>
  );
};

export default DemandesAValider;
