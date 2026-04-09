import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ShieldAlert,
  History,
  LineChart,
  Package,
  CheckCircle,
  XCircle,
  Edit3,
  RefreshCw,
} from 'lucide-react';
import SidebarResp from '../../components/responsable/SidebarResp';
import HeaderPage from '../../components/shared/HeaderPage';
import ProtectedPage from '../../components/shared/ProtectedPage';
import LoadingSpinner from '../../components/shared/LoadingSpinner';
import { useToast } from '../../components/shared/Toast';
import { del, get, patch, post, put } from '../../services/api';
import './PilotageResp.css';

function levelFromStockout(probability, underThreshold) {
  if (underThreshold || Number(probability || 0) >= 70) return 'Critique';
  if (Number(probability || 0) >= 40) return 'Moyen';
  return 'Faible';
}

function levelFromAnomaly(score) {
  const s = Number(score || 0);
  if (s >= 70) return 'Critique';
  if (s >= 50) return 'Moyen';
  return 'Faible';
}

function tabFromQuery(search) {
  const allowed = new Set(['decisions', 'alertes', 'analyse', 'validations']);
  const params = new URLSearchParams(search || '');
  const raw = String(params.get('tab') || '').toLowerCase().trim();
  return allowed.has(raw) ? raw : 'alertes';
}

const PilotageResp = ({ userName, onLogout }) => {
  const toast = useToast();
  const location = useLocation();
  const navigate = useNavigate();

  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => (typeof window !== 'undefined' ? window.innerWidth <= 768 : false));
  const [tab, setTab] = useState(() => tabFromQuery(location.search));

  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);

  const [pendingProducts, setPendingProducts] = useState([]); 
  const [pendingRequests, setPendingRequests] = useState([]); 
  const [categories, setCategories] = useState([]);
  const [categoryDraftByProductId, setCategoryDraftByProductId] = useState(() => ({}));
  const [aiCategoryByProductId, setAiCategoryByProductId] = useState(() => ({}));
  const [aiCategoryLoadingByProductId, setAiCategoryLoadingByProductId] = useState(() => ({}));
  const [aiStockout, setAiStockout] = useState([]); 
  const [aiCopilot, setAiCopilot] = useState(null); 
  const [aiAnomaly, setAiAnomaly] = useState([]); 
  const [, setMetrics] = useState(null); 
  const [simulationFeedback, setSimulationFeedback] = useState('');

  const [decisionInbox, setDecisionInbox] = useState(() => ({ items: [], counts: null, generated_at: null }));
  const [decisionExpandedId, setDecisionExpandedId] = useState('');
  const [decisionHistory, setDecisionHistory] = useState([]);
  const [showDecisionHistory, setShowDecisionHistory] = useState(false);
  const [magasiniers, setMagasiniers] = useState([]);
  const [assigneeByDecision, setAssigneeByDecision] = useState(() => ({}));
  const [supplierRecoByProduct, setSupplierRecoByProduct] = useState(() => ({}));
  const [supplierRecoLoadingByProduct, setSupplierRecoLoadingByProduct] = useState(() => ({}));
  const [orderDraftByDecision, setOrderDraftByDecision] = useState(() => ({}));

  const [editingSeuilId, setEditingSeuilId] = useState(null);
  const [editedSeuil, setEditedSeuil] = useState('');

  const [curveProductId, setCurveProductId] = useState('');
  const [curveMode, setCurveMode] = useState('auto');
  const [simulationProductId, setSimulationProductId] = useState('');
  const [simulationQty, setSimulationQty] = useState('50');

  const [alertKindFilter, setAlertKindFilter] = useState('all'); // all|rupture|anomaly
  const [alertLevelFilter, setAlertLevelFilter] = useState('all'); // all|critique|moyen|faible
  const [alertQuery, setAlertQuery] = useState('');

  const [urgentRequestsOnly, setUrgentRequestsOnly] = useState(false);
  const [urgentRequestsFirst, setUrgentRequestsFirst] = useState(true);

  useEffect(() => {
    const next = tabFromQuery(location.search);
    if (next !== tab) setTab(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);

  const setTabAndUrl = useCallback((nextTab) => {
    const clean = String(nextTab || '').toLowerCase().trim();
    setTab(clean);
    const params = new URLSearchParams(location.search || '');
    params.set('tab', clean);
    navigate({ pathname: '/responsable/pilotage', search: `?${params.toString()}` }, { replace: true });
  }, [location.search, navigate]);

  const loadData = useCallback(async () => { 
    setIsLoading(true); 
    try { 
      const [pendingReqs, categoriesRes, stockoutRes, copilotRes, anomalyRes, metricsRes] = await Promise.all([ 
        get('/requests?status=pending').catch(() => []), 
        get('/categories').catch(() => []),
        post('/ai/predict/stockout', { horizon_days: 7 }).catch(() => ({ predictions: [] })), 
        post('/ai/copilot/recommendations', { horizon_days: 14, top_n: 10, simulations: [] }).catch(() => null), 
        post('/ai/predict/anomaly', {}).catch(() => ({ predictions: [] })), 
        get('/ai/models/metrics').catch(() => ({ metrics: null })), 
      ]); 
      setPendingProducts([]); 
      setPendingRequests(Array.isArray(pendingReqs) ? pendingReqs : []); 
      setCategories(
        (Array.isArray(categoriesRes) ? categoriesRes : [])
          .map((c) => ({ id: c._id, name: c.name || 'Categorie' }))
          .sort((a, b) => String(a.name).localeCompare(String(b.name)))
      );
      setAiStockout(Array.isArray(stockoutRes?.predictions) ? stockoutRes.predictions : []); 
      setAiCopilot(copilotRes || null); 
      setAiAnomaly(Array.isArray(anomalyRes?.predictions) ? anomalyRes.predictions : []); 
      setMetrics(metricsRes?.metrics || null); 
    } catch (err) { 
      toast.error(err.message || 'Erreur chargement pilotage'); 
    } finally { 
      setIsLoading(false); 
    } 
  }, [toast]); 

  useEffect(() => { 
    loadData(); 
  }, [loadData]); 

  useEffect(() => {
    setCategoryDraftByProductId((prev) => {
      const next = { ...prev };
      (pendingProducts || []).forEach((p) => {
        const id = p?._id;
        if (!id) return;
        if (next[id] !== undefined) return;
        next[id] = p?.category?._id || '';
      });
      return next;
    });
  }, [pendingProducts]);

  const loadDecisionInbox = useCallback(async () => {
    try {
      const payload = await get('/ai/decision-inbox');
      const items = Array.isArray(payload?.items) ? payload.items : [];
      setDecisionInbox({ items, counts: payload?.counts || null, generated_at: payload?.generated_at || null });
    } catch (err) {
      toast.error(err.message || 'Impossible de charger les decisions');
      setDecisionInbox({ items: [], counts: null, generated_at: null });
    }
  }, [toast]);

  const loadDecisionHistory = useCallback(async () => {
    try {
      const payload = await get('/ai/decision-history?limit=40');
      const events = Array.isArray(payload?.events) ? payload.events : [];
      setDecisionHistory(events);
    } catch {
      setDecisionHistory([]);
    }
  }, []);

  const loadMagasiniers = useCallback(async () => {
    try {
      const payload = await get('/users?role=magasinier&status=active');
      const users = Array.isArray(payload?.users) ? payload.users : [];
      const mapped = users.map((u) => ({ id: u._id, username: u.username || 'Magasinier' }));
      setMagasiniers(mapped);
    } catch {
      setMagasiniers([]);
    }
  }, []);

  const loadSupplierRecommendation = useCallback(async (productId) => {
    const pid = String(productId || '').trim();
    if (!pid) return;
    if (supplierRecoByProduct[pid]) return;
    if (supplierRecoLoadingByProduct[pid]) return;
    setSupplierRecoLoadingByProduct((prev) => ({ ...prev, [pid]: true }));
    try {
      const payload = await get(`/suppliers/recommendation?product_id=${encodeURIComponent(pid)}`);
      setSupplierRecoByProduct((prev) => ({ ...prev, [pid]: payload }));
    } catch {
      setSupplierRecoByProduct((prev) => ({ ...prev, [pid]: { ok: false, product: { id: pid }, recommended: null, candidates: [] } }));
    } finally {
      setSupplierRecoLoadingByProduct((prev) => ({ ...prev, [pid]: false }));
    }
  }, [supplierRecoByProduct, supplierRecoLoadingByProduct]);

  useEffect(() => {
    if (tab === 'decisions') {
      loadDecisionInbox();
      loadDecisionHistory();
      loadMagasiniers();
    }
  }, [loadDecisionHistory, loadDecisionInbox, loadMagasiniers, tab]);

  const resolveDecision = useCallback(async (decisionIdValue, item) => {
    const did = String(decisionIdValue || '').trim();
    if (!did) return;
    setIsSubmitting(true);
    try {
      await post('/ai/decision-inbox/resolve', {
        decision_id: did,
        kind: item?.kind || '',
        title: item?.title || '',
        product_name: item?.product_name || '',
        level: item?.level || '',
      });
      await loadDecisionInbox();
      await loadDecisionHistory();
      toast.success('Decision marquee traitee');
    } catch (err) {
      toast.error(err.message || 'Echec marquage decision');
    } finally {
      setIsSubmitting(false);
    }
  }, [loadDecisionHistory, loadDecisionInbox, toast]);

  const assignDecision = useCallback(async (item, assigneeUserId) => {
    const did = String(item?.decision_id || '').trim();
    const target = String(assigneeUserId || '').trim();
    if (!did || !target) return;
    setIsSubmitting(true);
    try {
      await post('/ai/decision-inbox/assign', {
        decision_id: did,
        assignee_user_id: target,
        kind: item?.kind || '',
        title: item?.title || '',
        product_name: item?.product_name || '',
        level: item?.level || '',
      });
      await loadDecisionHistory();
      toast.success('Decision assignee au magasinier');
    } catch (err) {
      toast.error(err.message || 'Echec assignation decision');
    } finally {
      setIsSubmitting(false);
    }
  }, [loadDecisionHistory, toast]);

  const createQuickPurchaseOrder = useCallback(async (item, draft) => {
    const pid = String(item?.product_id || '').trim();
    const qty = Number(draft?.quantity || 0);
    if (!pid || !Number.isFinite(qty) || qty <= 0) {
      toast.error('Quantite invalide');
      return;
    }

    setIsSubmitting(true);
    try {
      await post('/purchase-orders/quick', {
        product_id: pid,
        quantity: qty,
        supplier_id: draft?.supplier_id || undefined,
        note: draft?.note || undefined,
        decision_id: String(item?.decision_id || ''),
        decision_title: String(item?.title || ''),
        decision_kind: String(item?.kind || ''),
        decision_level: String(item?.level || ''),
      });
      toast.success('Commande fournisseur creee');
      await loadDecisionInbox();
      await loadDecisionHistory();
    } catch (err) {
      toast.error(err.message || 'Echec creation commande');
    } finally {
      setIsSubmitting(false);
    }
  }, [loadDecisionHistory, loadDecisionInbox, toast]);

  const handleRefresh = useCallback(async () => {
    await loadData();
    if (tab === 'decisions') {
      await loadDecisionInbox();
      await loadDecisionHistory();
      await loadMagasiniers();
    }
  }, [loadData, loadDecisionHistory, loadDecisionInbox, loadMagasiniers, tab]);

  const mappedPendingProducts = useMemo(() => ( 
    pendingProducts.map((p) => ({ 
      id: p._id, 
      code: p.code_product, 
      nom: p.name, 
      categorie: p.category?.name || p.category_proposal || '-', 
      categorieProposee: p.category_proposal || '', 
      unite: p.unite || 'Unite', 
      seuilMinimum: Number(p.seuil_minimum || 0), 
      description: p.description || '', 
      magasinier: p.created_by?.username || '-', 
      dateSoumission: p.createdAt ? new Date(p.createdAt).toLocaleString('fr-FR') : '-', 
    })) 
  ), [pendingProducts]); 

  const mappedPendingRequests = useMemo(() => (
    pendingRequests.map((r) => ({
      id: r._id,
      reference: `DEM-${String(r._id || '').slice(-6).toUpperCase()}`,
      produit: r.product?.name || 'Produit',
      codeProduit: r.product?.code_product || '-',
      quantite: Number(r.quantity_requested || 0),
      demandeur: r.demandeur?.username || r.beneficiary || 'Demandeur',
      direction: r.direction_laboratory || '-',
      dateSoumission: (r.date_request || r.createdAt) ? new Date(r.date_request || r.createdAt).toLocaleString('fr-FR') : '-',
      note: r.note || '',
      priority: String(r.priority || 'normal').toLowerCase(),
      priorityLabel: r.priority_label || (String(r.priority || '').toLowerCase() === 'critical' ? 'TRES URGENT' : String(r.priority || '').toLowerCase() === 'urgent' ? 'URGENT' : 'NORMAL'),
    }))
  ), [pendingRequests]);

  const filteredPendingRequests = useMemo(() => {
    let next = Array.isArray(mappedPendingRequests) ? mappedPendingRequests : [];
    if (urgentRequestsOnly) {
      next = next.filter((r) => r.priority && r.priority !== 'normal');
    }
    if (urgentRequestsFirst) {
      const weight = (p) => (p === 'critical' ? 2 : p === 'urgent' ? 1 : 0);
      next = [...next].sort((a, b) => {
        const d = weight(b.priority) - weight(a.priority);
        if (d !== 0) return d;
        return String(b.dateSoumission || '').localeCompare(String(a.dateSoumission || ''));
      });
    }
    return next;
  }, [mappedPendingRequests, urgentRequestsFirst, urgentRequestsOnly]);

  const startEditSeuil = (id, currentSeuil) => {
    setEditingSeuilId(id);
    setEditedSeuil(String(currentSeuil));
  };

  const cancelEditSeuil = () => {
    setEditingSeuilId(null);
    setEditedSeuil('');
  };

  const saveEditedSeuil = async (id) => { 
    const newSeuil = Number.parseInt(editedSeuil, 10);
    if (!Number.isFinite(newSeuil) || newSeuil < 0) {
      toast.error('Seuil minimum invalide');
      return;
    }
    setIsSubmitting(true);
    try {
      await put(`/products/${id}`, { seuil_minimum: newSeuil });
      await loadData();
      toast.success('Seuil minimum mis a jour');
      cancelEditSeuil();
    } catch (err) {
      toast.error(err.message || 'Echec mise a jour seuil');
    } finally {
      setIsSubmitting(false);
    }
  }; 

  const loadAiCategorySuggestion = async (productId) => {
    if (!productId) return;
    setAiCategoryLoadingByProductId((p) => ({ ...p, [productId]: true }));
    try {
      const payload = await post('/ai/suggest/category', { product_id: productId, top_n: 3 });
      const candidates = Array.isArray(payload?.candidates) ? payload.candidates : [];
      setAiCategoryByProductId((p) => ({ ...p, [productId]: candidates }));
      if (candidates[0]?.id) {
        setCategoryDraftByProductId((p) => ({ ...p, [productId]: p[productId] || candidates[0].id }));
      }
    } catch (err) {
      toast.error(err.message || 'Echec suggestion IA');
    } finally {
      setAiCategoryLoadingByProductId((p) => ({ ...p, [productId]: false }));
    }
  };
 
  const handleValidate = async (id) => { 
    setIsSubmitting(true); 
    try { 
      const pending = mappedPendingProducts.find((p) => p.id === id); 
      const seuilToSave = editingSeuilId === id ? Number.parseInt(editedSeuil, 10) : pending?.seuilMinimum; 
      if (!Number.isFinite(seuilToSave) || seuilToSave < 0) { 
        toast.error('Seuil minimum invalide'); 
        return; 
      } 
      await put(`/products/${id}`, { seuil_minimum: seuilToSave }); 
      await loadData(); 
      toast.success('Produit mis a jour'); 
      cancelEditSeuil(); 
    } catch (err) { 
      toast.error(err.message || 'Echec mise a jour produit'); 
    } finally { 
      setIsSubmitting(false); 
    } 
  }; 

  const handleReject = async (id) => { 
    setIsSubmitting(true); 
    try { 
      toast.warning("Rejet/validation des produits desactivee: un produit cree est utilisable immediatement."); 
      cancelEditSeuil(); 
    } catch (err) { 
      toast.error(err.message || 'Echec rejet produit'); 
    } finally { 
      setIsSubmitting(false); 
    } 
  }; 

  const handleDeleteProduct = async (id) => {
    const target = mappedPendingProducts.find((p) => p.id === id);
    const confirmed = window.confirm(
      `Supprimer definitivement le produit ${target?.nom || ''} ? Cette action est irreversible.`
    );
    if (!confirmed) return;
    setIsSubmitting(true);
    try {
      await del(`/products/${id}`);
      await loadData();
      toast.success('Produit supprime');
    } catch (err) {
      toast.error(err.message || 'Echec suppression produit');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleValidateRequest = async (id, status) => {
    const next = status === 'rejected' ? 'rejected' : 'validated';
    setIsSubmitting(true);
    try {
      await patch(`/requests/${id}/validate`, { status: next });
      await loadData();
      toast.success(next === 'validated' ? 'Demande validee' : 'Demande rejetee');
    } catch (err) {
      toast.error(err.message || 'Echec traitement demande');
    } finally {
      setIsSubmitting(false);
    }
  };

  const topRiskProducts = useMemo(() => {
    const fromCopilot = Array.isArray(aiCopilot?.top_risk_products) ? aiCopilot.top_risk_products : [];
    if (fromCopilot.length) return fromCopilot;
    return Array.isArray(aiStockout) ? aiStockout : [];
  }, [aiCopilot, aiStockout]);

  const riskProducts = useMemo(() => (
    topRiskProducts.map((row) => {
      const stock = Number(row.current_stock || 0);
      const seuil = Number(row.seuil_minimum || 0);
      const underThreshold = stock <= seuil;
      return {
        ...row,
        under_threshold: underThreshold,
        critical_score: Number(row.risk_probability || 0) + (underThreshold ? 25 : 0),
      };
    })
  ), [topRiskProducts]);

  const anomalyRows = useMemo(
    () => (Array.isArray(aiAnomaly) ? aiAnomaly.filter((x) => Number(x?.anomaly_score || 0) >= 45).slice(0, 25) : []),
    [aiAnomaly]
  );

  const unifiedAlerts = useMemo(() => {
    const stockoutItems = riskProducts.slice(0, 20).map((row) => {
      const stock = Number(row.current_stock || 0);
      const seuil = Number(row.seuil_minimum || 0);
      const under = stock <= seuil;
      const suggestedOrder = Number(row.recommended_order_qty || 0);
      const risk = Number(row.risk_probability || 0);
      return {
        id: `s_${row.product_id || row.code_product || row.product_name}`,
        kind: 'rupture',
        product_id: row.product_id || null,
        product: row.product_name || row.code_product || 'Produit',
        score: risk,
        level: levelFromStockout(risk, under),
        action: suggestedOrder > 0 ? `Commander ${suggestedOrder} u.` : 'Surveillance active',
        reason: row.explanation || (Array.isArray(row.factors) ? row.factors.slice(0, 3).join(' + ') : 'Risque detecte'),
      };
    });

    const anomalyItems = anomalyRows.map((x) => {
      const score = Number(x?.anomaly_score || 0);
      return {
        id: `a_${x.product_id || x.product_name || score}`,
        kind: 'anomaly',
        product_id: x.product_id || null,
        product: x.product_name || 'Produit',
        score,
        level: levelFromAnomaly(score),
        action: 'Verifier sorties/mouvements',
        reason: String(x?.reason || 'Comportement anormal detecte'),
      };
    });

    const merged = [...stockoutItems, ...anomalyItems];
    const rank = (lvl) => (lvl === 'Critique' ? 3 : lvl === 'Moyen' ? 2 : 1);
    merged.sort((a, b) => {
      const ra = rank(a.level);
      const rb = rank(b.level);
      if (rb !== ra) return rb - ra;
      return Number(b.score || 0) - Number(a.score || 0);
    });
    return merged.slice(0, 25);
  }, [anomalyRows, riskProducts]);

  const filteredAlerts = useMemo(() => {
    const kind = String(alertKindFilter || 'all').toLowerCase();
    const level = String(alertLevelFilter || 'all').toLowerCase();
    const q = String(alertQuery || '').trim().toLowerCase();

    return unifiedAlerts.filter((row) => {
      if (kind !== 'all' && row.kind !== kind) return false;
      if (level !== 'all' && String(row.level || '').toLowerCase() !== level) return false;
      if (!q) return true;
      return String(row.product || '').toLowerCase().includes(q)
        || String(row.reason || '').toLowerCase().includes(q);
    });
  }, [alertKindFilter, alertLevelFilter, alertQuery, unifiedAlerts]);

  const counts = useMemo(() => {
    const critical = unifiedAlerts.filter((x) => x.level === 'Critique').length;
    const anomalies = unifiedAlerts.filter((x) => x.kind === 'anomaly').length;
    return {
      critical,
      anomalies,
      pending: mappedPendingProducts.length + mappedPendingRequests.length,
    };
  }, [mappedPendingProducts.length, mappedPendingRequests.length, unifiedAlerts]);

  const aiCurves = useMemo(
    () => (Array.isArray(aiCopilot?.dashboard_curves) ? aiCopilot.dashboard_curves : []),
    [aiCopilot]
  );

  const curveIds = useMemo(() => new Set(aiCurves.map((c) => String(c.product_id))), [aiCurves]);

  const criticalCurveCandidate = useMemo(() => {
    const sorted = [...riskProducts].sort((a, b) => Number(b.critical_score || 0) - Number(a.critical_score || 0));
    return sorted.find((x) => curveIds.has(String(x.product_id))) || null;
  }, [riskProducts, curveIds]);

  useEffect(() => {
    if (!aiCurves.length) {
      setCurveProductId('');
      return;
    }
    if (curveMode === 'auto') {
      const next = criticalCurveCandidate?.product_id || aiCurves[0]?.product_id;
      if (String(next || '') && String(next) !== String(curveProductId)) setCurveProductId(String(next));
      return;
    }
    if (curveProductId && !curveIds.has(String(curveProductId))) {
      setCurveProductId(String(criticalCurveCandidate?.product_id || aiCurves[0]?.product_id || ''));
    }
  }, [aiCurves, curveMode, criticalCurveCandidate, curveIds, curveProductId]);

  const selectedCurve = useMemo(
    () => aiCurves.find((c) => String(c.product_id) === String(curveProductId)) || null,
    [aiCurves, curveProductId]
  );

  const selectedHistory = useMemo(() => (
    Array.isArray(selectedCurve?.history_30d?.values) ? selectedCurve.history_30d.values.slice(-20) : []
  ), [selectedCurve]);

  const selectedHistoryLabels = useMemo(() => (
    Array.isArray(selectedCurve?.history_30d?.labels) ? selectedCurve.history_30d.labels.slice(-20) : []
  ), [selectedCurve]);

  const selectedForecast = useMemo(() => (
    Array.isArray(selectedCurve?.forecast_14d?.values) ? selectedCurve.forecast_14d.values.slice(0, 14) : []
  ), [selectedCurve]);

  const selectedForecastLabels = useMemo(() => ( 
    Array.isArray(selectedCurve?.forecast_14d?.labels) ? selectedCurve.forecast_14d.labels.slice(0, 14) : [] 
  ), [selectedCurve]); 

  const curveMax = useMemo( 
    () => Math.max(1, ...selectedHistory, ...selectedForecast), 
    [selectedHistory, selectedForecast] 
  ); 

  const stockoutByProductId = useMemo(() => {
    const map = new Map();
    (aiStockout || []).forEach((row) => {
      if (!row?.product_id) return;
      map.set(String(row.product_id), row);
    });
    return map;
  }, [aiStockout]);

  const anomalyByProductId = useMemo(() => {
    const map = new Map();
    (aiAnomaly || []).forEach((row) => {
      if (!row?.product_id) return;
      map.set(String(row.product_id), row);
    });
    return map;
  }, [aiAnomaly]);

  const actionPlanByProductId = useMemo(() => {
    const map = new Map();
    const plan = Array.isArray(aiCopilot?.action_plan) ? aiCopilot.action_plan : [];
    plan.forEach((row) => {
      if (!row?.product_id) return;
      map.set(String(row.product_id), row);
    });
    return map;
  }, [aiCopilot]);

  const focusStockout = useMemo(() => {
    if (!curveProductId) return null;
    return stockoutByProductId.get(String(curveProductId)) || null;
  }, [curveProductId, stockoutByProductId]);

  const focusAnomaly = useMemo(() => {
    if (!curveProductId) return null;
    return anomalyByProductId.get(String(curveProductId)) || null;
  }, [curveProductId, anomalyByProductId]);

  const focusAction = useMemo(() => {
    if (!curveProductId) return null;
    return actionPlanByProductId.get(String(curveProductId)) || null;
  }, [curveProductId, actionPlanByProductId]);

  const selectedSimulation = useMemo(() => {
    const sims = Array.isArray(aiCopilot?.simulations) ? aiCopilot.simulations : [];
    if (!sims.length || !simulationProductId) return null;
    return sims.find((s) => String(s.product_id) === String(simulationProductId)) || sims[0] || null;
  }, [aiCopilot, simulationProductId]);

  useEffect(() => {
    if (!selectedCurve?.product_id) return;
    setSimulationProductId((prev) => prev || String(selectedCurve.product_id));
  }, [selectedCurve]);

  const runSimulation = async () => { 
    const qty = Number(simulationQty); 
    if (!simulationProductId || !Number.isFinite(qty) || qty < 0) { 
      toast.error('Parametres simulation invalides'); 
      return; 
    } 
    setIsSimulating(true); 
    setSimulationFeedback('');
    try { 
      const result = await post('/ai/copilot/recommendations', { 
        horizon_days: 14, 
        top_n: 10, 
        simulations: [{ product_id: simulationProductId, order_qty: qty }], 
      }); 
      setAiCopilot(result || null); 
      const sims = Array.isArray(result?.simulations) ? result.simulations : [];
      if (!sims.length) {
        setSimulationFeedback(
          "Aucune simulation disponible pour ce produit. Cause possible: pas assez d'historique ou IA desactivee."
        );
        toast.warning('Simulation non disponible');
      } else {
        setSimulationFeedback('Simulation calculee. Vous pouvez justifier la decision.');
        toast.success('Simulation calculee');
      }
    } catch (err) { 
      setSimulationFeedback(err.message || 'Echec simulation');
      toast.error(err.message || 'Echec simulation'); 
    } finally { 
      setIsSimulating(false); 
    } 
  }; 

  return (
    <ProtectedPage userName={userName}>
      <div className="app-layout">
        <div
          className={`sidebar-backdrop ${sidebarCollapsed ? 'hidden' : ''}`}
          onClick={() => setSidebarCollapsed(true)}
        />
        <SidebarResp
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
          onLogout={onLogout}
          userName={userName}
        />

        <div className="main-container">
          <HeaderPage
            userName={userName}
            title="Pilotage"
            showSearch={false}
            onMenuClick={() => setSidebarCollapsed((prev) => !prev)}
          />
          <main className="main-content">
            {(isLoading || isSubmitting || isSimulating) && <LoadingSpinner overlay text="Chargement..." />}

            <div className="pilotage-page">
              <div className="pilotage-top">
                <div className="pilotage-kpis">
                  <div className="pilotage-kpi">
                    <span>Critiques</span>
                    <strong>{counts.critical}</strong>
                  </div>
                  <div className="pilotage-kpi">
                    <span>Anomalies</span>
                    <strong>{counts.anomalies}</strong>
                  </div>
                  <div className="pilotage-kpi">
                    <span>En attente validation</span>
                    <strong>{counts.pending}</strong>
                  </div>
                </div>
                <button type="button" className="pilotage-refresh" onClick={handleRefresh} disabled={isLoading}>
                  <RefreshCw size={16} />
                  <span>Actualiser</span>
                </button>
              </div>

              <div className="pilotage-tabs" role="tablist" aria-label="Pilotage tabs">
                <button
                  type="button"
                  className={`pilotage-tab ${tab === 'decisions' ? 'active' : ''}`}
                  onClick={() => setTabAndUrl('decisions')}
                >
                  <ShieldAlert size={16} />
                  <span>Decisions</span>
                </button>
                <button
                  type="button"
                  className={`pilotage-tab ${tab === 'alertes' ? 'active' : ''}`}
                  onClick={() => setTabAndUrl('alertes')}
                >
                  <ShieldAlert size={16} />
                  <span>Alertes</span>
                </button>
                <button
                  type="button"
                  className={`pilotage-tab ${tab === 'analyse' ? 'active' : ''}`}
                  onClick={() => setTabAndUrl('analyse')}
                >
                  <LineChart size={16} />
                  <span>Analyse</span>
                </button>
                <button
                  type="button"
                  className={`pilotage-tab ${tab === 'validations' ? 'active' : ''}`}
                  onClick={() => setTabAndUrl('validations')}
                >
                  <Package size={16} />
                  <span>Validations</span>
                </button>
              </div>

              {tab === 'decisions' && (
                <section className="pilotage-card">
                  <div className="pilotage-card-head">
                    <h3><ShieldAlert size={18} /> Decision Inbox</h3>
                    <small>Detecter → expliquer → agir (responsable)</small>
                  </div>
                  <div className="pilotage-filters" aria-label="Decision controls">
                    <div className="pilotage-filter" style={{ alignSelf: 'end' }}>
                      <button
                        type="button"
                        className="pilotage-btn"
                        onClick={() => setShowDecisionHistory((v) => !v)}
                        disabled={isSubmitting}
                      >
                        {showDecisionHistory ? 'Masquer historique' : 'Voir historique'}
                      </button>
                    </div>
                  </div>
                  {!decisionInbox.items.length ? (
                    <div className="pilotage-empty-box">Aucune decision prioritaire.</div>
                  ) : (
                    <div className="pilotage-pending-list">
                      {decisionInbox.items.map((item) => {
                        const rawLevel = String(item.level || '').toLowerCase();
                        const levelClass = rawLevel.includes('crit')
                          ? 'critique'
                          : rawLevel.includes('moy')
                            ? 'moyen'
                            : 'faible';
                        const expanded = decisionExpandedId === item.decision_id;
                        const primaryWhy = Array.isArray(item.why) && item.why.length ? item.why[0] : '';
                        const requestIdFromPayload = item?.kind === 'request_validation'
                          ? String(item?.actions?.[0]?.payload?.request_id || item?.actions?.[1]?.payload?.request_id || '')
                          : '';

                        return (
                          <div key={item.decision_id} className="pilotage-pending-item">
                            <div className="pilotage-pending-top">
                              <div className="pilotage-pending-title">
                                <strong>{item.title}</strong>
                                <span>{item.kind}</span>
                              </div>
                              <span className={`pilotage-pill ${levelClass}`}>{item.level}</span>
                            </div>

                            {primaryWhy ? <p className="pilotage-pending-desc">{primaryWhy}</p> : null}

                            <div className="pilotage-pending-actions">
                              <button
                                className="pilotage-btn"
                                onClick={() => {
                                  const next = expanded ? '' : item.decision_id;
                                  setDecisionExpandedId(next);
                                  if (!expanded && item?.product_id && (item.kind === 'stockout' || item.kind === 'copilot')) {
                                    loadSupplierRecommendation(item.product_id);
                                    setOrderDraftByDecision((prev) => {
                                      if (prev[item.decision_id]) return prev;
                                      const defaultQty = Number(item?.evidence?.recommended_order_qty || 0) || 1;
                                      return {
                                        ...prev,
                                        [item.decision_id]: { quantity: defaultQty, supplier_id: '', note: '' },
                                      };
                                    });
                                  }
                                }}
                                disabled={isSubmitting}
                              >
                                Pourquoi ?
                              </button>

                              {item.kind === 'request_validation' ? (
                                <>
                                  <button
                                    className="pilotage-btn ok"
                                    onClick={() => handleValidateRequest(requestIdFromPayload, 'validated')}
                                    disabled={isSubmitting || !requestIdFromPayload}
                                  >
                                    <CheckCircle size={15} /> Valider
                                  </button>
                                  <button
                                    className="pilotage-btn no"
                                    onClick={() => handleValidateRequest(requestIdFromPayload, 'rejected')}
                                    disabled={isSubmitting || !requestIdFromPayload}
                                  >
                                    <XCircle size={15} /> Rejeter
                                  </button>
                                </>
                              ) : (
                                <>
                                  <div className="pilotage-inline-actions">
                                    <select
                                      value={assigneeByDecision[item.decision_id] || ''}
                                      onChange={(e) => setAssigneeByDecision((prev) => ({ ...prev, [item.decision_id]: e.target.value }))}
                                      disabled={isSubmitting || !magasiniers.length}
                                      aria-label="Assigner a un magasinier"
                                    >
                                      <option value="">Assigner a...</option>
                                      {magasiniers.map((m) => (
                                        <option key={m.id} value={m.id}>{m.username}</option>
                                      ))}
                                    </select>
                                    <button
                                      className="pilotage-btn"
                                      onClick={() => assignDecision(item, assigneeByDecision[item.decision_id] || '')}
                                      disabled={isSubmitting || !(assigneeByDecision[item.decision_id] || '')}
                                    >
                                      Assigner
                                    </button>
                                  </div>

                                  <button
                                    className="pilotage-btn primary"
                                    onClick={() => resolveDecision(item.decision_id, item)}
                                    disabled={isSubmitting}
                                  >
                                    Marquer traite
                                  </button>
                                </>
                              )}
                            </div>

                            {expanded && (
                              <div className="pilotage-pending-grid" style={{ marginTop: 10 }}>
                                <div><label>ID</label><span>{item.decision_id}</span></div>
                                <div><label>Produit</label><span>{item.product_name || '-'}</span></div>
                                <div style={{ gridColumn: '1 / -1' }}>
                                  <label>Preuves</label>
                                  <span>
                                    {Array.isArray(item.why) && item.why.length
                                      ? item.why.slice(0, 6).join(' | ')
                                      : '-'}
                                  </span>
                                </div>

                                {(item.kind === 'stockout' || item.kind === 'copilot') && item.product_id && (
                                  <div style={{ gridColumn: '1 / -1' }}>
                                    <label>Commande fournisseur</label>
                                    <div className="pilotage-inline-actions" style={{ flexWrap: 'wrap' }}>
                                      <select
                                        value={orderDraftByDecision[item.decision_id]?.supplier_id || ''}
                                        onChange={(e) => setOrderDraftByDecision((prev) => ({
                                          ...prev,
                                          [item.decision_id]: { ...(prev[item.decision_id] || {}), supplier_id: e.target.value },
                                        }))}
                                        disabled={isSubmitting || Boolean(supplierRecoLoadingByProduct[item.product_id])}
                                      >
                                        <option value="">Fournisseur (auto)</option>
                                        {(supplierRecoByProduct[item.product_id]?.candidates || []).map((c) => (
                                          <option key={c.supplier_id} value={c.supplier_id}>
                                            {c.supplier_name} (score {c.score})
                                          </option>
                                        ))}
                                      </select>
                                      <input
                                        type="number"
                                        min="1"
                                        value={orderDraftByDecision[item.decision_id]?.quantity || 1}
                                        onChange={(e) => setOrderDraftByDecision((prev) => ({
                                          ...prev,
                                          [item.decision_id]: { ...(prev[item.decision_id] || {}), quantity: e.target.value },
                                        }))}
                                        style={{ width: 120 }}
                                      />
                                      <button
                                        className="pilotage-btn ok"
                                        onClick={() => createQuickPurchaseOrder(item, orderDraftByDecision[item.decision_id] || {})}
                                        disabled={isSubmitting}
                                      >
                                        Creer commande
                                      </button>
                                    </div>
                                    {supplierRecoByProduct[item.product_id]?.recommended && (
                                      <div style={{ marginTop: 6, fontSize: 12, opacity: 0.9 }}>
                                        Recommande: <strong>{supplierRecoByProduct[item.product_id].recommended.supplier_name}</strong>
                                        {Array.isArray(supplierRecoByProduct[item.product_id].recommended.reasons)
                                          ? ` — ${supplierRecoByProduct[item.product_id].recommended.reasons.slice(0, 2).join(', ')}`
                                          : ''}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {showDecisionHistory && (
                    <div className="pilotage-card" style={{ marginTop: 14 }}>
                      <div className="pilotage-card-head">
                        <h3><History size={18} /> Historique decisions</h3>
                        <small>Trace des actions (assignations + resolutions)</small>
                      </div>
                      {!decisionHistory.length ? (
                        <div className="pilotage-empty-box">Aucun evenement recent.</div>
                      ) : (
                        <div className="pilotage-pending-list">
                          {decisionHistory.slice(0, 16).map((evt, idx) => {
                            const rawLevel = String(evt.level || '').toLowerCase();
                            const levelClass = rawLevel.includes('crit')
                              ? 'critique'
                              : rawLevel.includes('moy')
                                ? 'moyen'
                                : 'faible';
                            const label = evt.kind === 'assign'
                              ? `Assignee a ${evt.target || '-'}`
                              : evt.kind === 'purchase_order'
                                ? (String(evt.title || '').toLowerCase().includes('recu') ? 'Commande recue' : 'Commande creee')
                                : 'Resolue';
                            return (
                              <div key={`${evt.decision_id}_${idx}`} className="pilotage-pending-item">
                                <div className="pilotage-pending-top">
                                  <div className="pilotage-pending-title">
                                    <strong>{evt.title || 'Decision'}</strong>
                                    <span>{label}</span>
                                  </div>
                                  <span className={`pilotage-pill ${levelClass}`}>{evt.level || '-'}</span>
                                </div>
                                <div className="pilotage-pending-grid">
                                  <div><label>Quand</label><span>{evt.when ? new Date(evt.when).toLocaleString('fr-FR') : '-'}</span></div>
                                  <div><label>Par</label><span>{evt.actor || '-'}</span></div>
                                  {evt.product_name ? (
                                    <div style={{ gridColumn: '1 / -1' }}><label>Produit</label><span>{evt.product_name}</span></div>
                                  ) : null}
                                  {evt.note ? (
                                    <div style={{ gridColumn: '1 / -1' }}><label>Note</label><span>{evt.note}</span></div>
                                  ) : null}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </section>
              )}

              {tab === 'alertes' && (
                <section className="pilotage-card">
                  <div className="pilotage-card-head">
                    <h3><AlertTriangle size={18} /> Liste unique d’alertes</h3>
                    <small>Priorites du jour (a traiter)</small>
                  </div>
                  <div className="pilotage-filters" aria-label="Filtres alertes">
                    <div className="pilotage-filter">
                      <label>Type</label>
                      <select value={alertKindFilter} onChange={(e) => setAlertKindFilter(e.target.value)}>
                        <option value="all">Tous</option>
                        <option value="rupture">Rupture</option>
                        <option value="anomaly">Anomalie</option>
                      </select>
                    </div>
                    <div className="pilotage-filter">
                      <label>Niveau</label>
                      <select value={alertLevelFilter} onChange={(e) => setAlertLevelFilter(e.target.value)}>
                        <option value="all">Tous</option>
                        <option value="critique">Critique</option>
                        <option value="moyen">Moyen</option>
                        <option value="faible">Faible</option>
                      </select>
                    </div>
                    <div className="pilotage-filter grow">
                      <label>Recherche</label>
                      <input
                        type="text"
                        value={alertQuery}
                        onChange={(e) => setAlertQuery(e.target.value)}
                        placeholder="Produit ou raison..."
                      />
                    </div>
                  </div>
                  <div className="pilotage-table-wrap">
                    <table className="pilotage-table">
                      <thead>
                        <tr>
                          <th>Produit</th>
                          <th>Type</th>
                          <th>Niveau</th>
                          <th>Pourquoi</th>
                          <th>Action</th>
                          <th>Score</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredAlerts.map((row) => (
                          <tr key={row.id}>
                            <td><strong>{row.product}</strong></td>
                            <td>{row.kind === 'anomaly' ? 'Anomalie' : 'Rupture'}</td>
                            <td><span className={`pilotage-pill ${String(row.level || '').toLowerCase()}`}>{row.level}</span></td>
                            <td className="pilotage-why">{row.reason}</td>
                            <td>{row.action}</td>
                            <td>{Number(row.score || 0).toFixed(1)}%</td>
                          </tr>
                        ))}
                        {!filteredAlerts.length && (
                          <tr>
                            <td colSpan={6} className="pilotage-empty">Aucune alerte forte actuellement.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}

              {tab === 'analyse' && (
                <section className="pilotage-grid">
                  <div className="pilotage-card">
                    <div className="pilotage-card-head">
                      <h3><LineChart size={18} /> Courbe (historique vs prevision)</h3>
                      <div className="pilotage-inline-actions">
                        <select
                          value={curveProductId}
                          onChange={(e) => {
                            setCurveMode('manual');
                            setCurveProductId(e.target.value);
                          }}
                          disabled={!aiCurves.length}
                        >
                          {!aiCurves.length && <option value="">Aucune courbe disponible</option>}
                          {aiCurves.map((c) => (
                            <option key={c.product_id} value={c.product_id}>{c.product_name}</option>
                          ))}
                        </select>
                        <button
                          className="pilotage-btn ghost"
                          type="button"
                          onClick={() => setCurveMode('auto')}
                          disabled={curveMode === 'auto' || !aiCurves.length}
                        >
                          Auto critique
                        </button>
                      </div>
                    </div>

                    <div className="pilotage-banner"> 
                      Mode: <strong>{curveMode === 'auto' ? 'Auto critique' : 'Manuel'}</strong> 
                      {criticalCurveCandidate && ( 
                        <span className="pilotage-hint"> 
                          Produit critique: <strong>{criticalCurveCandidate.product_name}</strong> 
                        </span> 
                      )} 
                    </div> 

                    <div className="pilotage-banner" style={{ justifyContent: 'space-between' }}>
                      <span>
                        Message systeme:
                        <strong style={{ marginLeft: 8 }}>
                          {focusStockout
                            ? `Risque ${Number(focusStockout.risk_probability || 0).toFixed(1)}% (${levelFromStockout(
                              focusStockout.risk_probability,
                              Number(focusStockout.current_stock || 0) <= Number(focusStockout.seuil_minimum || 0)
                            )})`
                            : "En attente d'analyse"}
                        </strong>
                      </span>
                      {focusAction?.action ? (
                        <span className="pilotage-hint">
                          Action proposee: <strong>{focusAction.action}</strong>
                        </span>
                      ) : null}
                    </div>

                    {(focusStockout || focusAnomaly || focusAction) ? (
                      <div className="pilotage-banner" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
                        {focusStockout ? (
                          <div style={{ width: '100%' }}>
                            <div style={{ fontWeight: 900, color: '#0f172a' }}>Constat</div>
                            <div style={{ marginTop: 4 }}>
                              Stock: <strong>{Math.round(Number(focusStockout.current_stock || 0))}</strong> / Seuil:{' '}
                              <strong>{Math.round(Number(focusStockout.seuil_minimum || 0))}</strong>
                              {focusStockout.days_cover_estimate !== undefined ? (
                                <>
                                  {' '}— Couverture estimee: <strong>{Math.round(Number(focusStockout.days_cover_estimate || 0))} j</strong>
                                </>
                              ) : null}
                            </div>
                          </div>
                        ) : null}
                        {focusAnomaly ? (
                          <div style={{ width: '100%', marginTop: 8 }}>
                            <div style={{ fontWeight: 900, color: '#0f172a' }}>Signal</div>
                            <div style={{ marginTop: 4 }}>
                              Anomalie: <strong>{Math.round(Number(focusAnomaly.anomaly_score || 0))}</strong>
                              {focusAnomaly.reason ? <> — {String(focusAnomaly.reason)}</> : null}
                            </div>
                          </div>
                        ) : null}
                        {focusAction?.why ? (
                          <div style={{ width: '100%', marginTop: 8 }}>
                            <div style={{ fontWeight: 900, color: '#0f172a' }}>Pourquoi</div>
                            <div style={{ marginTop: 4 }}>{String(focusAction.why)}</div>
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <div className="pilotage-empty-box">
                        Pas assez de donnees pour generer un message. Ajoutez des sorties/transactions pour ce produit.
                      </div>
                    )}

                    <div className="pilotage-curve-wrap">
                      <div className="pilotage-curve">
                        {selectedHistory.map((v, i) => (
                          <div className="pilotage-col" key={`h-${i}`}>
                            <div className="pilotage-bar historical" style={{ height: `${Math.max(8, Math.round((Number(v || 0) / curveMax) * 100))}%` }} />
                            <span>{String(selectedHistoryLabels[i] || '').slice(5) || '-'}</span>
                          </div>
                        ))}
                        {selectedForecast.map((v, i) => (
                          <div className="pilotage-col" key={`f-${i}`}>
                            <div className="pilotage-bar forecast" style={{ height: `${Math.max(8, Math.round((Number(v || 0) / curveMax) * 100))}%` }} />
                            <span>{String(selectedForecastLabels[i] || '').slice(5) || '-'}</span>
                          </div>
                        ))}
                        {!selectedCurve && <div className="pilotage-empty-box">Aucune courbe disponible pour le moment.</div>}
                      </div>
                    </div>
                    <div className="pilotage-legend">
                      <span><i className="pilotage-dot historical" />Historique</span>
                      <span><i className="pilotage-dot forecast" />Prevision</span>
                    </div>
                    {/* Metrics techniques volontairement masquees pour un usage non-informaticien. */}
                  </div>

                  <div className="pilotage-card">
                    <div className="pilotage-card-head">
                      <h3><LineChart size={18} /> Simulation commande</h3>
                      <small>Que se passe-t-il si je commande X ?</small>
                    </div>
                    <div className="pilotage-sim-row">
                      <select value={simulationProductId} onChange={(e) => setSimulationProductId(e.target.value)}>
                        <option value="">Choisir un produit</option>
                        {riskProducts.map((p) => (
                          <option key={p.product_id} value={p.product_id}>{p.product_name}</option>
                        ))}
                      </select>
                      <input type="number" min="0" value={simulationQty} onChange={(e) => setSimulationQty(e.target.value)} />
                      <button className="pilotage-btn primary" onClick={runSimulation} disabled={isSimulating}>Simuler</button>
                    </div>
                    {Array.isArray(aiCopilot?.simulations) && aiCopilot.simulations.length > 0 && (
                      <p className="pilotage-sim-result">
                        Risque {selectedSimulation?.risk_before_pct}% → {selectedSimulation?.risk_after_pct}% apres commande.
                        {selectedSimulation?.projected_stock_end_after !== undefined ? (
                          <> Stock fin periode: {Math.round(Number(selectedSimulation.projected_stock_end_before || 0))} → {Math.round(Number(selectedSimulation.projected_stock_end_after || 0))}</>
                        ) : null}
                      </p> 
                    )} 
                    {simulationFeedback ? (
                      <div className="pilotage-empty-box" style={{ marginTop: 10 }}>
                        {simulationFeedback}
                      </div>
                    ) : null}
                  </div> 
                </section> 
              )} 

              {tab === 'validations' && (
                <>
                  <section className="pilotage-card">
                    <div className="pilotage-card-head">
                      <h3><Package size={18} /> Demandes en attente de validation</h3>
                      <small>Flux pro: demandeur → responsable → magasinier</small>
                      <div className="pilotage-inline-actions">
                        <label className="pilotage-checkbox">
                          <input
                            type="checkbox"
                            checked={urgentRequestsOnly}
                            onChange={(e) => setUrgentRequestsOnly(e.target.checked)}
                          />
                          Urgentes seulement
                        </label>
                        <label className="pilotage-checkbox">
                          <input
                            type="checkbox"
                            checked={urgentRequestsFirst}
                            onChange={(e) => setUrgentRequestsFirst(e.target.checked)}
                          />
                          Urgentes d&apos;abord
                        </label>
                      </div>
                    </div>
                    {!filteredPendingRequests.length ? (
                      <div className="pilotage-empty-box">Aucune demande en attente.</div>
                    ) : (
                      <div className="pilotage-pending-list">
                        {filteredPendingRequests.map((reqItem) => (
                          <div key={reqItem.id} className="pilotage-pending-item">
                            <div className="pilotage-pending-top">
                              <div className="pilotage-pending-title">
                                <strong>{reqItem.produit}</strong>
                                <span>{reqItem.reference}</span>
                                {reqItem.priority && reqItem.priority !== 'normal' ? (
                                  <span className={`pilotage-pill ${reqItem.priority === 'critical' ? 'critique' : 'moyen'}`}>
                                    {reqItem.priorityLabel}
                                  </span>
                                ) : null}
                              </div>
                              <span className="pilotage-pending-date">{reqItem.dateSoumission}</span>
                            </div>

                            <div className="pilotage-pending-grid">
                              <div><label>Code</label><span>{reqItem.codeProduit}</span></div>
                              <div><label>Quantite</label><span>{reqItem.quantite}</span></div>
                              <div><label>Demandeur</label><span>{reqItem.demandeur}</span></div>
                              <div><label>Direction</label><span>{reqItem.direction}</span></div>
                            </div>

                            {reqItem.note ? <p className="pilotage-pending-desc">{reqItem.note}</p> : null}

                            <div className="pilotage-pending-actions">
                              <button
                                className="pilotage-btn ok"
                                onClick={() => handleValidateRequest(reqItem.id, 'validated')}
                                disabled={isSubmitting}
                              >
                                <CheckCircle size={15} /> Valider
                              </button>
                              <button
                                className="pilotage-btn no"
                                onClick={() => handleValidateRequest(reqItem.id, 'rejected')}
                                disabled={isSubmitting}
                              >
                                <XCircle size={15} /> Rejeter
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>

                  <section className="pilotage-card">
                    <div className="pilotage-card-head">
                      <h3><Package size={18} /> Produits en attente de validation</h3>
                      <small>Action du responsable (valider / rejeter)</small>
                    </div>
                    {!mappedPendingProducts.length ? (
                      <div className="pilotage-empty-box">Aucun produit en attente.</div>
                    ) : (
                      <div className="pilotage-pending-list">
                        {mappedPendingProducts.map((product) => (
                          <div key={product.id} className="pilotage-pending-item">
                            <div className="pilotage-pending-top">
                              <div className="pilotage-pending-title">
                                <strong>{product.nom}</strong>
                                <span>{product.code}</span>
                              </div>
                              <span className="pilotage-pending-date">{product.dateSoumission}</span>
                            </div> 
 
                            <div className="pilotage-pending-grid"> 
                              <div>
                                <label>Categorie</label>
                                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                                  <select
                                    value={categoryDraftByProductId[product.id] || ''}
                                    onChange={(e) => setCategoryDraftByProductId((p) => ({ ...p, [product.id]: e.target.value }))}
                                    disabled={isSubmitting}
                                    style={{ padding: '8px 10px', borderRadius: 10, border: '1px solid #e2e8f0', fontWeight: 900, minWidth: 210 }}
                                  >
                                    <option value="">-- Choisir --</option>
                                    {categories.map((c) => (
                                      <option key={c.id} value={c.id}>
                                        {c.name}
                                      </option>
                                    ))}
                                  </select>
                                  <button
                                    type="button"
                                    className="pilotage-icon-btn"
                                    onClick={() => loadAiCategorySuggestion(product.id)}
                                    disabled={isSubmitting || Boolean(aiCategoryLoadingByProductId[product.id])}
                                    title="Suggestion IA categorie"
                                  >
                                    {aiCategoryLoadingByProductId[product.id] ? '...' : 'IA'}
                                  </button>
                                </div>
                                {Array.isArray(aiCategoryByProductId[product.id]) && aiCategoryByProductId[product.id].length > 0 ? (
                                  <div style={{ marginTop: 6, fontSize: 12, color: '#64748b', fontWeight: 800 }}>
                                    Suggestion: <strong style={{ color: '#0f172a' }}>{aiCategoryByProductId[product.id][0].name}</strong> ({aiCategoryByProductId[product.id][0].confidence}%)
                                  </div>
                                ) : null}
                                {product.categorieProposee ? (
                                  <div style={{ marginTop: 4, fontSize: 12, color: '#64748b', fontWeight: 800 }}>
                                    Proposee: <strong style={{ color: '#0f172a' }}>{product.categorieProposee}</strong>
                                  </div>
                                ) : null}
                              </div> 
                              <div><label>Unite</label><span>{product.unite}</span></div> 
                              <div> 
                                <label>Seuil min</label> 
                                {editingSeuilId === product.id ? ( 
                                  <div className="pilotage-seuil-edit"> 
                                    <input type="number" min="0" value={editedSeuil} onChange={(e) => setEditedSeuil(e.target.value)} />
                                    <button className="pilotage-icon-btn" onClick={() => saveEditedSeuil(product.id)}><CheckCircle size={14} /></button>
                                    <button className="pilotage-icon-btn danger" onClick={cancelEditSeuil}><XCircle size={14} /></button>
                                  </div>
                                ) : (
                                  <span className="pilotage-seuil-display" onClick={() => startEditSeuil(product.id, product.seuilMinimum)}>
                                    {product.seuilMinimum} <Edit3 size={12} />
                                  </span>
                                )}
                              </div>
                              <div><label>Magasinier</label><span>{product.magasinier}</span></div>
                            </div>

                            {product.description ? <p className="pilotage-pending-desc">{product.description}</p> : null}

                            <div className="pilotage-pending-actions"> 
                              <button className="pilotage-btn ok" onClick={() => handleValidate(product.id)} disabled={isSubmitting}> 
                                <CheckCircle size={15} /> Valider 
                              </button> 
                              <button className="pilotage-btn no" onClick={() => handleReject(product.id)} disabled={isSubmitting}> 
                                <XCircle size={15} /> Rejeter 
                              </button> 
                              <button className="pilotage-btn danger" onClick={() => handleDeleteProduct(product.id)} disabled={isSubmitting}> 
                                <XCircle size={15} /> Supprimer 
                              </button> 
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                </>
              )}
            </div>
          </main>
        </div>
      </div>
    </ProtectedPage>
  );
};

export default PilotageResp;
