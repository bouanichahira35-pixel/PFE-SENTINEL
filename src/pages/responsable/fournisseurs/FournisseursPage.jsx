import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, RefreshCw, Truck } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import SidebarResp from '../../../components/responsable/SidebarResp';
import HeaderPage from '../../../components/shared/HeaderPage';
import LoadingSpinner from '../../../components/shared/LoadingSpinner';
import { useToast } from '../../../components/shared/Toast';

import FournisseurStatsCards from '../../../components/fournisseurs/FournisseurStatsCards';
import FournisseurFilters from '../../../components/fournisseurs/FournisseurFilters';
import FournisseurAlertCenter from '../../../components/fournisseurs/FournisseurAlertCenter';
import FournisseurRecommendationPanel from '../../../components/fournisseurs/FournisseurRecommendationPanel';
import FournisseursTable from '../../../components/fournisseurs/FournisseursTable';
import FournisseurNotificationModal from '../../../components/fournisseurs/FournisseurNotificationModal';

import {
  getFournisseurProducts,
  getFournisseursRanking,
  getFournisseursStats,
  listFournisseurs,
  listPurchaseOrders,
  updateFournisseurStatus,
} from '../../../services/fournisseurService';
import { ALERT_STATUS, listFournisseurAlerts, updateFournisseurAlertStatus } from '../../../services/fournisseurAlertService';
import { createCommandeFromRecommendation } from '../../../services/fournisseurRecommendationService';
import { get } from '../../../services/api';

import '../FournisseursResp.css';

function normalizeSupplierId(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  return String(value?._id || value?.id || value || '').trim();
}

const FournisseursPage = ({ userName, onLogout }) => {
  const toast = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => (typeof window !== 'undefined' ? window.innerWidth <= 768 : false));
  const [loading, setLoading] = useState(false);

  const [stats, setStats] = useState(null);
  const [fournisseurs, setFournisseurs] = useState([]);
  const [total, setTotal] = useState(0);

  const [alerts, setAlerts] = useState([]);
  const [products, setProducts] = useState([]);

  const [productsCountById, setProductsCountById] = useState(() => ({}));
  const [openOrdersCountById, setOpenOrdersCountById] = useState(() => ({}));
  const [openAlertsCountById, setOpenAlertsCountById] = useState(() => ({}));
  const [scoreById, setScoreById] = useState(() => ({}));

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [reliabilityFilter, setReliabilityFilter] = useState('all');
  const [profileStateFilter, setProfileStateFilter] = useState('all');
  const [domainFilter, setDomainFilter] = useState('all');

  const [notifyOpen, setNotifyOpen] = useState(false);
  const [notifySupplier, setNotifySupplier] = useState(null);

  useEffect(() => {
    const wanted = String(searchParams.get('filtre') || '').trim().toLowerCase();
    if (wanted === 'alertes') {
      setProfileStateFilter('all');
      setStatusFilter('all');
    }
  }, [searchParams]);

  const domainFiltered = useMemo(() => {
    if (domainFilter === 'all') return fournisseurs;
    return (Array.isArray(fournisseurs) ? fournisseurs : []).filter((s) => String(s?.domain || '') === String(domainFilter));
  }, [domainFilter, fournisseurs]);

  const pageCount = useMemo(() => Math.max(1, Math.ceil((total || 0) / (limit || 20))), [total, limit]);

  const loadProducts = useCallback(async () => {
    try {
      const list = await get('/products');
      setProducts(Array.isArray(list) ? list : (Array.isArray(list?.items) ? list.items : []));
    } catch {
      setProducts([]);
    }
  }, []);

  const computeMaps = useCallback(async ({ suppliersItems, alertsItems, purchaseOrdersItems, rankingItems }) => {
    const openAlerts = {};
    (alertsItems || []).forEach((a) => {
      const sid = normalizeSupplierId(a?.supplier);
      if (!sid) return;
      openAlerts[sid] = Number(openAlerts[sid] || 0) + 1;
    });

    const openOrders = {};
    (purchaseOrdersItems || []).forEach((po) => {
      const sid = normalizeSupplierId(po?.supplier);
      if (!sid) return;
      const st = String(po?.status || '');
      if (st === 'delivered' || st === 'cancelled') return;
      openOrders[sid] = Number(openOrders[sid] || 0) + 1;
    });

    const scores = {};
    (rankingItems || []).forEach((r) => {
      const sid = String(r?.supplier_id || '').trim();
      if (!sid) return;
      const sc = Number(r?.score);
      if (Number.isFinite(sc)) scores[sid] = sc;
    });

    const productCounts = {};
    await Promise.all(
      (suppliersItems || []).slice(0, 50).map(async (s) => {
        const sid = normalizeSupplierId(s?._id || s?.id);
        if (!sid) return;
        try {
          const res = await getFournisseurProducts(sid);
          productCounts[sid] = Array.isArray(res?.links) ? res.links.length : 0;
        } catch {
          productCounts[sid] = 0;
        }
      })
    );

    setOpenAlertsCountById(openAlerts);
    setOpenOrdersCountById(openOrders);
    setScoreById(scores);
    setProductsCountById(productCounts);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [statsRes, suppliersRes, alertsRes, rankingRes, orderedPoRes] = await Promise.all([
        getFournisseursStats().catch(() => ({ stats: null })),
        listFournisseurs({
          page,
          limit,
          q: search.trim(),
          status: statusFilter,
          reliability: reliabilityFilter,
          profile_state: profileStateFilter,
        }).catch(() => ({ items: [], total: 0 })),
        listFournisseurAlerts({ status: ALERT_STATUS.NON_TRAITEE, limit: 200, page: 1 }).catch(() => ({ items: [] })),
        getFournisseursRanking({ max: 200 }).catch(() => ({ ranking: [] })),
        listPurchaseOrders({ status: 'ordered', limit: 200 }).catch(() => ({ purchase_orders: [] })),
      ]);

      setStats(statsRes?.stats || null);

      const items = Array.isArray(suppliersRes?.items) ? suppliersRes.items : [];
      setFournisseurs(items);
      setTotal(Number(suppliersRes?.total || items.length || 0));

      const alertItems = Array.isArray(alertsRes?.items) ? alertsRes.items : [];
      setAlerts(alertItems.slice(0, 12));

      const rankingItems = Array.isArray(rankingRes?.ranking) ? rankingRes.ranking : [];

      const pos = Array.isArray(orderedPoRes?.purchase_orders) ? orderedPoRes.purchase_orders : [];
      await computeMaps({ suppliersItems: items, alertsItems: alertItems, purchaseOrdersItems: pos, rankingItems });
    } catch (err) {
      toast.error(err.message || 'Chargement fournisseurs échoué');
    } finally {
      setLoading(false);
    }
  }, [computeMaps, limit, page, profileStateFilter, reliabilityFilter, search, statusFilter, toast]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, reliabilityFilter, profileStateFilter, domainFilter]);

  const refreshAll = async () => {
    await load();
    toast.success('Données fournisseurs actualisées.');
  };

  const handleTreatAlert = async (alert, nextStatus) => {
    const id = String(alert?._id || alert?.id || '').trim();
    if (!id) return;
    try {
      await updateFournisseurAlertStatus(id, nextStatus);
      toast.success("Alerte mise à jour.");
      await load();
    } catch (e) {
      toast.error(e.message || 'Traitement alerte échoué');
    }
  };

  const handleViewRoute = (route) => {
    if (!route) return;
    navigate(route);
  };

  const openNotify = (supplier) => {
    setNotifySupplier(supplier || null);
    setNotifyOpen(true);
  };

  const toggleSupplierStatus = async (supplier, nextStatus) => {
    const s = supplier || null;
    const sid = String(s?._id || s?.id || '').trim();
    if (!sid) return;
    const current = String(s?.status || '').toUpperCase();
    const ns = String(nextStatus || '').toUpperCase();
    if (current !== ns) {
      // eslint-disable-next-line no-alert
      const ok = window.confirm(ns === 'SUSPENDU' ? 'Suspendre ce fournisseur ? Il ne pourra plus être utilisé pour une nouvelle commande.' : 'Réactiver ce fournisseur ?');
      if (!ok) return;
    }
    try {
      await updateFournisseurStatus(sid, ns);
      toast.success('Statut fournisseur mis à jour.');
      await load();
    } catch (e) {
      toast.error(e.message || 'Changement statut échoué');
    }
  };

  const onCreateCommandeFromPanel = async ({ supplierId, productId, quantity, source }) => {
    try {
      const created = await createCommandeFromRecommendation({ supplierId, productId, quantity, source });
      toast.success('Commande fournisseur créée.');
      if (created?._id) navigate(`/responsable/commandes/${created._id}`);
    } catch (e) {
      toast.error(e.message || 'Création commande échouée');
    }
  };

  return (
    <div className="resp-suppliers">
      <SidebarResp collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed((p) => !p)} onLogout={onLogout} userName={userName} />

      <div className={`resp-suppliers-main ${sidebarCollapsed ? 'collapsed' : ''}`}>
        <HeaderPage
          userName={userName}
          title="Gestion des fournisseurs"
          subtitle="Centralisation, contrôle et suivi du référentiel fournisseurs"
          icon={<Truck size={22} />}
          showSearch={false}
          onRefresh={refreshAll}
          onMenuClick={() => setSidebarCollapsed((p) => !p)}
        />

        <div className="resp-suppliers-page">
          <div className="f360-toolbar" style={{ marginBottom: 12 }}>
            <div className="f360-muted">Tableau de bord Fournisseurs 360°</div>
            <div className="f360-actions">
              <button className="f360-btn" type="button" onClick={refreshAll} disabled={loading}><RefreshCw size={16} />Actualiser</button>
              <button className="f360-btn primary" type="button" onClick={() => navigate('/responsable/fournisseurs/nouveau')} disabled={loading}>
                <Plus size={16} />
                Nouveau fournisseur
              </button>
            </div>
          </div>

          {loading && <LoadingSpinner overlay text="Chargement fournisseurs..." />}

          <FournisseurFilters
            search={search}
            onSearchChange={setSearch}
            status={statusFilter}
            onStatusChange={setStatusFilter}
            reliability={reliabilityFilter}
            onReliabilityChange={setReliabilityFilter}
            profileState={profileStateFilter}
            onProfileStateChange={setProfileStateFilter}
            domain={domainFilter}
            onDomainChange={setDomainFilter}
            perPage={limit}
            onPerPageChange={setLimit}
          />

          <FournisseurStatsCards stats={stats} />

          <div className="resp-suppliers-grid" style={{ gridTemplateColumns: '1fr 1fr', marginBottom: 14 }}>
            <FournisseurAlertCenter
              alerts={alerts}
              onTreat={handleTreatAlert}
              onView={handleViewRoute}
            />
            <FournisseurRecommendationPanel products={products} onCreateCommande={onCreateCommandeFromPanel} />
          </div>

          <div className="resp-section-head">
            <div>
              <div style={{ fontWeight: 1000, color: '#0f172a' }}>Liste fournisseurs</div>
              <div className="f360-muted">Total: {total} • Page {page}/{pageCount}</div>
            </div>
            <div className="f360-actions">
              <button className="f360-btn" type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1 || loading}>Précédent</button>
              <button className="f360-btn" type="button" onClick={() => setPage((p) => Math.min(pageCount, p + 1))} disabled={page >= pageCount || loading}>Suivant</button>
            </div>
          </div>

          <FournisseursTable
            fournisseurs={domainFiltered}
            productsCountById={productsCountById}
            openOrdersCountById={openOrdersCountById}
            openAlertsCountById={openAlertsCountById}
            scoreById={scoreById}
            onNotify={openNotify}
            onToggleStatus={toggleSupplierStatus}
          />
        </div>
      </div>

      <FournisseurNotificationModal
        open={notifyOpen}
        fournisseur={notifySupplier}
        onClose={() => setNotifyOpen(false)}
        onSent={() => toast.success('Notification envoyée au fournisseur.')}
      />
    </div>
  );
};

export default FournisseursPage;
