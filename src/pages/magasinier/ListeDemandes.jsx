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
  ClipboardList,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import SidebarMag from '../../components/magasinier/SidebarMag';
import HeaderPage from '../../components/shared/HeaderPage';
import LoadingSpinner from '../../components/shared/LoadingSpinner';
import { useToast } from '../../components/shared/Toast';
import { get } from '../../services/api';
import { useUiLanguage } from '../../utils/uiLanguage';
import { normalizeRequestStatus } from '../../utils/requestStatus';
import useIsMobile from '../../hooks/useIsMobile';
import './ListeDemandes.css';

const ListeDemandes = ({ userName, onLogout }) => {
  const lang = useUiLanguage();
  const navigate = useNavigate();
  const toast = useToast();
  const isMobile = useIsMobile(640);

  const i18n = {
    fr: {
      title: 'Suivi des demandes',
      tableTitle: 'Demandes produits',
      loading: 'Chargement des demandes...',
      pending: 'En attente',
      validated: 'Validee',
      preparing: 'En preparation',
      served: 'Servie',
      rejected: 'Rejetee',
      cancelled: 'Annulee',
      allStatus: 'Tous statuts',
      stockLow: 'Stock insuffisant pour cette demande',
      failLoad: 'Impossible de charger les demandes',
      ref: 'Reference',
      product: 'Produit',
      qty: 'Quantite',
      requester: 'Demandeur',
      date: 'Date',
      status: 'Statut',
      actions: 'Actions',
      openInbox: "Ouvrir centre d'actions",
      noResults: 'Aucune demande trouvee',
      lines: 'ligne(s)',
      waitingCount: 'demande(s) en attente de preparation',
      waitingResponsible: 'En attente preparation magasinier',
      prepare: 'Preparer',
      serve: 'Servir',
      preparedOk: 'Demande mise en preparation',
      prepareFail: 'Impossible de preparer la demande',
    },
    en: {
      title: 'Product Requests',
      tableTitle: 'Product requests',
      loading: 'Loading requests...',
      pending: 'Pending',
      validated: 'Validated',
      preparing: 'Preparing',
      served: 'Served',
      rejected: 'Rejected',
      cancelled: 'Cancelled',
      allStatus: 'All statuses',
      stockLow: 'Insufficient stock for this request',
      failLoad: 'Failed to load requests',
      ref: 'Reference',
      product: 'Product',
      qty: 'Quantity',
      requester: 'Requester',
      date: 'Date',
      status: 'Status',
      actions: 'Actions',
      noResults: 'No request found',
      lines: 'line(s)',
      waitingCount: 'request(s) awaiting preparation',
      waitingResponsible: 'Waiting storekeeper preparation',
      prepare: 'Prepare',
      serve: 'Serve',
      preparedOk: 'Request moved to preparing',
      prepareFail: 'Failed to prepare request',
    },
    ar: {
      title: 'Product Requests',
      tableTitle: 'Product requests',
      loading: 'Loading requests...',
      pending: 'Pending',
      validated: 'Validated',
      preparing: 'Preparing',
      served: 'Served',
      rejected: 'Rejected',
      cancelled: 'Cancelled',
      allStatus: 'All statuses',
      stockLow: 'Insufficient stock for this request',
      failLoad: 'Failed to load requests',
      ref: 'Reference',
      product: 'Product',
      qty: 'Quantity',
      requester: 'Requester',
      date: 'Date',
      status: 'Status',
      actions: 'Actions',
      noResults: 'No request found',
      lines: 'line(s)',
      waitingCount: 'request(s) awaiting preparation',
      waitingResponsible: 'Waiting storekeeper preparation',
      prepare: 'Prepare',
      serve: 'Serve',
      preparedOk: 'Request moved to preparing',
      prepareFail: 'Failed to prepare request',
    },
  }[lang];

  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => (typeof window !== 'undefined' ? window.innerWidth <= 768 : false));
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [demandes, setDemandes] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  const openInbox = useCallback(() => navigate('/magasinier/inbox'), [navigate]);

  const getStatutInfo = useCallback((statut) => {
    switch (statut) {
      case 'pending':
        return { label: i18n.pending, className: 'pending', icon: Clock };
      case 'validated':
        return { label: i18n.validated, className: 'accepted', icon: CheckCircle };
      case 'preparing':
        return { label: i18n.preparing, className: 'accepted', icon: History };
      case 'served':
        return { label: i18n.served, className: 'served', icon: Truck };
      case 'received':
        return { label: 'Cloturee', className: 'served', icon: CheckCircle };
      case 'rejected':
        return { label: i18n.rejected, className: 'refused', icon: XCircle };
      case 'cancelled':
        return { label: i18n.cancelled, className: 'refused', icon: XCircle };
      default:
        return { label: statut || 'Unknown', className: 'pending', icon: Clock };
    }
  }, [i18n.pending, i18n.validated, i18n.preparing, i18n.served, i18n.rejected, i18n.cancelled]);

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
        statut: normalizeRequestStatus(r.status),
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
    () => filteredDemandes.filter((d) => d.statut === 'validated').length,
    [filteredDemandes]
  );

  return (
    <div className="app-layout">
      <div
        className={`sidebar-backdrop ${sidebarCollapsed ? 'hidden' : ''}`}
        onClick={() => setSidebarCollapsed(true)}
      />
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
          onMenuClick={() => setSidebarCollapsed((prev) => !prev)}
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
                  <option value="validated">{i18n.validated}</option>
                  <option value="preparing">{i18n.preparing}</option>
                  <option value="served">{i18n.served}</option>
                  <option value="rejected">{i18n.rejected}</option>
                  <option value="cancelled">{i18n.cancelled}</option>
                </select>
              </div>
              <div className="dm-waiting-chip">{pendingCount} {i18n.waitingCount}</div>
            </div>

            <div className="dm-card">
              <div className="dm-card-head">
                <h3><History size={18} /> {i18n.tableTitle}</h3>
                <span>{filteredDemandes.length} {i18n.lines}</span>
              </div>

              {isMobile ? (
                <>
                  {!filteredDemandes.length ? (
                    <div className="dm-empty" style={{ padding: '1rem' }}>{i18n.noResults}</div>
                  ) : (
                    <div className="mobile-card-list">
                      {filteredDemandes.map((demande) => {
                        const statutInfo = getStatutInfo(demande.statut);
                        const StatutIcon = statutInfo.icon;
                        const insufficientStock = ['validated', 'preparing'].includes(demande.statut)
                          && demande.stockDisponible < demande.quantite;

                        return (
                          <div key={demande.id} className="mobile-card">
                            <div className="mobile-card-header">
                              <div>
                                <h3 className="mobile-card-title">{demande.produit}</h3>
                                <div className="mobile-card-subtitle">{demande.reference} • {demande.codeProduit}</div>
                              </div>
                              <span className={`dm-status-pill ${statutInfo.className}`}>
                                <StatutIcon size={13} />
                                {statutInfo.label}
                              </span>
                            </div>

                            <div className="mobile-card-grid">
                              <div className="mobile-kv">
                                <div className="mobile-kv-label">{i18n.qty}</div>
                                <div className="mobile-kv-value">
                                  <span className="dm-qty">
                                    {demande.quantite}
                                    {insufficientStock && (
                                      <span className="dm-stock-warning" title={i18n.stockLow} style={{ marginLeft: 6 }}>
                                        <AlertTriangle size={14} />
                                      </span>
                                    )}
                                  </span>
                                </div>
                              </div>
                              <div className="mobile-kv">
                                <div className="mobile-kv-label">{i18n.requester}</div>
                                <div className="mobile-kv-value">{demande.demandeur}</div>
                              </div>
                              <div className="mobile-kv">
                                <div className="mobile-kv-label">{i18n.date}</div>
                                <div className="mobile-kv-value">{new Date(demande.dateRaw || 0).toLocaleString('fr-FR')}</div>
                              </div>
                              <div className="mobile-kv">
                                <div className="mobile-kv-label">Stock</div>
                                <div className="mobile-kv-value">{demande.stockDisponible}</div>
                              </div>
                            </div>

                            {['validated', 'preparing'].includes(demande.statut) ? (
                              <div className="mobile-card-actions">
                                <button
                                  type="button"
                                  className="mobile-action-btn info"
                                  onClick={openInbox}
                                  title={i18n.openInbox}
                                >
                                  <ClipboardList size={16} /> {i18n.openInbox}
                                </button>
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              ) : (
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
                        const insufficientStock = ['validated', 'preparing'].includes(demande.statut)
                          && demande.stockDisponible < demande.quantite;

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
                              {['validated', 'preparing'].includes(demande.statut) ? (
                                <button
                                  type="button"
                                  className="dm-open-inbox"
                                  onClick={openInbox}
                                  title={i18n.openInbox}
                                >
                                  <ClipboardList size={15} /> {i18n.openInbox}
                                </button>
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
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default ListeDemandes;
