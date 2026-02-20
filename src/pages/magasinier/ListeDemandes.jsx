import { useState, useMemo, useCallback, useEffect } from 'react';
import {
  Package,
  CheckCircle,
  XCircle,
  Clock,
  User,
  Calendar,
  AlertTriangle,
  Truck,
  Filter,
  History,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import SidebarMag from '../../components/magasinier/SidebarMag';
import HeaderPage from '../../components/shared/HeaderPage';
import LoadingSpinner from '../../components/shared/LoadingSpinner';
import { useToast } from '../../components/shared/Toast';
import { get, patch } from '../../services/api';
import { useUiLanguage } from '../../utils/uiLanguage';
import './ListeDemandes.css';

const ListeDemandes = ({ userName, onLogout }) => {
  const lang = useUiLanguage();
  const navigate = useNavigate();
  const toast = useToast();

  const i18n = {
    fr: {
      title: 'Demandes de Produits',
      tableTitle: 'Demandes produits',
      loading: 'Chargement des demandes...',
      pending: 'En attente',
      accepted: 'Acceptee',
      served: 'Servie',
      refused: 'Rejetee',
      allStatus: 'Tous statuts',
      stockLow: 'Stock insuffisant pour cette demande',
      acceptedMsg: 'Demande acceptee. Continuez avec la sortie de stock.',
      refusedMsg: 'Demande rejetee',
      failLoad: 'Impossible de charger les demandes',
      failAccept: 'Echec acceptation demande',
      failReject: 'Echec rejet demande',
      ref: 'Reference',
      product: 'Produit',
      qty: 'Quantite',
      requester: 'Demandeur',
      date: 'Date',
      status: 'Statut',
      actions: 'Actions',
      noResults: 'Aucune demande trouvee',
      lines: 'ligne(s)',
      waitingCount: 'demande(s) en attente',
      reject: 'Rejeter la demande',
    },
    en: {
      title: 'Product Requests',
      tableTitle: 'Product requests',
      loading: 'Loading requests...',
      pending: 'Pending',
      accepted: 'Accepted',
      served: 'Served',
      refused: 'Rejected',
      allStatus: 'All statuses',
      stockLow: 'Insufficient stock for this request',
      acceptedMsg: 'Request accepted. Continue with stock exit.',
      refusedMsg: 'Request rejected',
      failLoad: 'Failed to load requests',
      failAccept: 'Failed to accept request',
      failReject: 'Failed to reject request',
      ref: 'Reference',
      product: 'Product',
      qty: 'Quantity',
      requester: 'Requester',
      date: 'Date',
      status: 'Status',
      actions: 'Actions',
      noResults: 'No request found',
      lines: 'line(s)',
      waitingCount: 'pending request(s)',
      reject: 'Reject request',
    },
    ar: {
      title: 'Product Requests',
      tableTitle: 'Product requests',
      loading: 'Loading requests...',
      pending: 'Pending',
      accepted: 'Accepted',
      served: 'Served',
      refused: 'Rejected',
      allStatus: 'All statuses',
      stockLow: 'Insufficient stock for this request',
      acceptedMsg: 'Request accepted. Continue with stock exit.',
      refusedMsg: 'Request rejected',
      failLoad: 'Failed to load requests',
      failAccept: 'Failed to accept request',
      failReject: 'Failed to reject request',
      ref: 'Reference',
      product: 'Product',
      qty: 'Quantity',
      requester: 'Requester',
      date: 'Date',
      status: 'Status',
      actions: 'Actions',
      noResults: 'No request found',
      lines: 'line(s)',
      waitingCount: 'pending request(s)',
      reject: 'Reject request',
    },
  }[lang];

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [demandes, setDemandes] = useState([]);
  const [processingId, setProcessingId] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  const getStatutInfo = useCallback((statut) => {
    switch (statut) {
      case 'pending':
        return { label: i18n.pending, className: 'pending', icon: Clock };
      case 'accepted':
        return { label: i18n.accepted, className: 'accepted', icon: CheckCircle };
      case 'served':
        return { label: i18n.served, className: 'served', icon: Truck };
      case 'refused':
        return { label: i18n.refused, className: 'refused', icon: XCircle };
      default:
        return { label: statut || 'Unknown', className: 'pending', icon: Clock };
    }
  }, [i18n.pending, i18n.accepted, i18n.served, i18n.refused]);

  const loadDemandes = useCallback(async () => {
    setIsLoading(true);
    try {
      const items = await get('/requests');
      const mapped = (Array.isArray(items) ? items : []).map((r) => ({
        id: r._id,
        reference: `DEM-${String(r._id || '').slice(-6).toUpperCase()}`,
        produit: r.product?.name || 'Produit',
        codeProduit: r.product?.code_product || '-',
        productId: r.product?._id,
        quantite: Number(r.quantity_requested || 0),
        directionLaboratoire: r.direction_laboratory || '',
        beneficiaire: r.beneficiary || r.demandeur?.username || 'Demandeur',
        demandeur: r.demandeur?.username || 'Demandeur',
        demandeurId: r.demandeur?._id,
        dateRaw: r.date_request || r.createdAt,
        statut: r.status,
        stockDisponible: Number(r.product?.quantity_current || 0),
      }));

      mapped.sort((a, b) => new Date(b.dateRaw || 0) - new Date(a.dateRaw || 0));
      setDemandes(mapped);
    } catch (err) {
      toast.error(err.message || i18n.failLoad);
    } finally {
      setIsLoading(false);
    }
  }, [toast, i18n.failLoad]);

  useEffect(() => {
    loadDemandes();
  }, [loadDemandes]);

  const goToSortieStock = useCallback((demande) => {
    navigate('/magasinier/sortie-stock', {
      state: {
        product: {
          id: demande.productId,
          code: demande.codeProduit,
          nom: demande.produit,
          quantite: demande.stockDisponible,
          categorie: '-',
          unite: 'Unite',
        },
        demandeInfo: {
          id: demande.id,
          reference: demande.reference,
          quantite: demande.quantite,
          demandeur: demande.demandeur,
          demandeurId: demande.demandeurId,
          direction: demande.directionLaboratoire,
          beneficiaire: demande.beneficiaire,
          statut: demande.statut,
        },
      },
    });
  }, [navigate]);

  const handleAccepter = useCallback(async (demande) => {
    if (demande.stockDisponible < demande.quantite) {
      toast.error(i18n.stockLow);
      return;
    }

    setProcessingId(demande.id);
    try {
      await patch(`/requests/${demande.id}/process`, { status: 'accepted' });
      setDemandes((prev) => prev.map((d) => (d.id === demande.id ? { ...d, statut: 'accepted' } : d)));
      toast.success(i18n.acceptedMsg);
      goToSortieStock({ ...demande, statut: 'accepted' });
    } catch (err) {
      toast.error(err.message || i18n.failAccept);
    } finally {
      setProcessingId(null);
    }
  }, [goToSortieStock, toast, i18n.stockLow, i18n.acceptedMsg, i18n.failAccept]);

  const handleRejeter = useCallback(async (demandeId) => {
    setProcessingId(demandeId);
    try {
      await patch(`/requests/${demandeId}/process`, { status: 'refused' });
      setDemandes((prev) => prev.map((d) => (d.id === demandeId ? { ...d, statut: 'refused' } : d)));
      toast.warning(i18n.refusedMsg);
    } catch (err) {
      toast.error(err.message || i18n.failReject);
    } finally {
      setProcessingId(null);
    }
  }, [toast, i18n.refusedMsg, i18n.failReject]);

  const filteredDemandes = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return demandes.filter((demande) => {
      const matchSearch = !q
        || demande.produit.toLowerCase().includes(q)
        || demande.demandeur.toLowerCase().includes(q)
        || demande.reference.toLowerCase().includes(q)
        || demande.codeProduit.toLowerCase().includes(q);
      const matchStatus = statusFilter === 'all' || demande.statut === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [demandes, searchQuery, statusFilter]);

  const pendingCount = useMemo(
    () => filteredDemandes.filter((d) => d.statut === 'pending').length,
    [filteredDemandes]
  );

  return (
    <div className="app-layout">
      <SidebarMag
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        onLogout={onLogout}
        userName={userName}
      />

      <div className="main-container">
        <HeaderPage
          userName={userName}
          title={i18n.title}
          searchValue={searchQuery}
          onSearchChange={setSearchQuery}
          onRefresh={loadDemandes}
        />

        <main className="main-content">
          {isLoading && <LoadingSpinner overlay text={i18n.loading} />}

          <div className="dm-page">
            <div className="dm-toolbar">
              <div className="dm-filter">
                <Filter size={16} />
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                  <option value="all">{i18n.allStatus}</option>
                  <option value="pending">{i18n.pending}</option>
                  <option value="accepted">{i18n.accepted}</option>
                  <option value="served">{i18n.served}</option>
                  <option value="refused">{i18n.refused}</option>
                </select>
              </div>
              <div className="dm-waiting-chip">{pendingCount} {i18n.waitingCount}</div>
            </div>

            <div className="dm-card">
              <div className="dm-card-head">
                <h3><History size={18} /> {i18n.tableTitle}</h3>
                <span>{filteredDemandes.length} {i18n.lines}</span>
              </div>

              <div className="dm-table-wrap">
                <table className="dm-table">
                  <thead>
                    <tr>
                      <th>{i18n.ref}</th>
                      <th>{i18n.product}</th>
                      <th>{i18n.qty}</th>
                      <th>{i18n.requester}</th>
                      <th>{i18n.date}</th>
                      <th>{i18n.status}</th>
                      <th>{i18n.actions}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDemandes.map((demande) => {
                      const statutInfo = getStatutInfo(demande.statut);
                      const StatutIcon = statutInfo.icon;
                      const canAccept = demande.statut === 'pending' && demande.stockDisponible >= demande.quantite;
                      const canServe = demande.statut === 'accepted' && demande.stockDisponible >= demande.quantite;
                      const insufficientStock = ['pending', 'accepted'].includes(demande.statut)
                        && demande.stockDisponible < demande.quantite;
                      const isProcessing = processingId === demande.id;

                      return (
                        <tr key={demande.id}>
                          <td className="dm-ref">{demande.reference}</td>
                          <td>
                            <div className="dm-product-cell">
                              <Package size={14} />
                              <div>
                                <strong>{demande.produit}</strong>
                                <small>{demande.codeProduit}</small>
                              </div>
                            </div>
                          </td>
                          <td>
                            <span className="dm-qty">
                              {demande.quantite}
                              {insufficientStock && (
                                <span className="dm-stock-warning" title={i18n.stockLow}>
                                  <AlertTriangle size={14} />
                                </span>
                              )}
                            </span>
                          </td>
                          <td>
                            <span className="dm-meta-inline"><User size={13} /> {demande.demandeur}</span>
                          </td>
                          <td>
                            <span className="dm-meta-inline"><Calendar size={13} /> {new Date(demande.dateRaw || 0).toLocaleString('fr-FR')}</span>
                          </td>
                          <td>
                            <span className={`dm-status-pill ${statutInfo.className}`}>
                              <StatutIcon size={13} />
                              {statutInfo.label}
                            </span>
                          </td>
                          <td>
                            {(demande.statut === 'pending' || demande.statut === 'accepted') ? (
                              <div className="dm-actions">
                                {isProcessing ? (
                                  <LoadingSpinner size="small" />
                                ) : (
                                  <>
                                    {demande.statut === 'pending' ? (
                                      <>
                                        <button
                                          className={`dm-action-btn accept ${!canAccept ? 'disabled' : ''}`}
                                          onClick={() => handleAccepter(demande)}
                                          disabled={!canAccept}
                                          title={insufficientStock ? i18n.stockLow : i18n.accepted}
                                          aria-label={`Accepter ${demande.reference}`}
                                        >
                                          <CheckCircle size={15} />
                                        </button>
                                        <button
                                          className="dm-action-btn reject"
                                          onClick={() => handleRejeter(demande.id)}
                                          title={i18n.reject}
                                          aria-label={`${i18n.reject} ${demande.reference}`}
                                        >
                                          <XCircle size={15} />
                                        </button>
                                      </>
                                    ) : (
                                      <button
                                        className={`dm-action-btn serve ${!canServe ? 'disabled' : ''}`}
                                        onClick={() => goToSortieStock(demande)}
                                        disabled={!canServe}
                                        title={insufficientStock ? i18n.stockLow : i18n.served}
                                        aria-label={`Servir ${demande.reference}`}
                                      >
                                        <Truck size={15} />
                                      </button>
                                    )}
                                  </>
                                )}
                              </div>
                            ) : (
                              <span className="dm-no-action">-</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {!filteredDemandes.length && (
                      <tr>
                        <td colSpan={7} className="dm-empty">{i18n.noResults}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default ListeDemandes;
