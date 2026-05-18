import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  Building2,
  Calendar,
  CheckCircle2,
  Eye,
  Package,
  RefreshCw,
  Tag,
  TrendingUp,
  Users,
  ArrowUpRight,
  X,
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import SidebarResp from '../../components/responsable/SidebarResp';
import HeaderPage from '../../components/shared/HeaderPage';
import ProtectedPage from '../../components/shared/ProtectedPage';
import LoadingSpinner from '../../components/shared/LoadingSpinner';
import { useToast } from '../../components/shared/Toast';
import { get } from '../../services/api';
import './ConsommationResp.css';

function formatIsoDate(date) {
  return new Date(date).toISOString().slice(0, 10);
}

function sumQty(rows) {
  return rows.reduce((acc, r) => acc + Number(r?.quantity || 0), 0);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function formatDateTime(value) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatDayLabel(dayValue) {
  if (!dayValue) return '-';
  const date = new Date(dayValue);
  if (Number.isNaN(date.getTime())) return String(dayValue).slice(5);
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
}

function toLineCoords(values, minValue, maxValue, width, height, padX, padY) {
  if (!Array.isArray(values) || !values.length) return [];
  const usableMin = Number.isFinite(minValue) ? minValue : 0;
  const usableMax = Number.isFinite(maxValue) ? maxValue : 1;
  const span = Math.max(1, usableMax - usableMin);
  const stepX = values.length > 1 ? (width - padX * 2) / (values.length - 1) : 0;

  return values.map((v, index) => {
    const normalized = (Number(v || 0) - usableMin) / span;
    const x = padX + index * stepX;
    const y = height - padY - normalized * (height - padY * 2);
    return { x, y };
  });
}

function toPolylinePoints(coords) {
  return coords.map((point) => `${point.x},${point.y}`).join(' ');
}

function toAreaPath(coords, height, padY) {
  if (!coords.length) return '';
  const baselineY = height - padY;
  const start = coords[0];
  const end = coords[coords.length - 1];
  return [
    `M ${start.x} ${baselineY}`,
    ...coords.map((point) => `L ${point.x} ${point.y}`),
    `L ${end.x} ${baselineY}`,
    'Z',
  ].join(' ');
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(Boolean(query.matches));
    update();
    if (typeof query.addEventListener === 'function') query.addEventListener('change', update);
    else query.addListener?.(update);
    return () => {
      if (typeof query.removeEventListener === 'function') query.removeEventListener('change', update);
      else query.removeListener?.(update);
    };
  }, []);

  return reduced;
}

function AnimatedNumber({ value, decimals = 0, durationMs = 650 }) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const [shown, setShown] = useState(() => Number(value || 0));
  const shownRef = useRef(shown);

  useEffect(() => {
    shownRef.current = shown;
  }, [shown]);

  useEffect(() => {
    const target = Number(value || 0);
    if (prefersReducedMotion) {
      setShown(target);
      return undefined;
    }

    const from = Number(shownRef.current || 0);
    const start = performance.now();
    const duration = clamp(Number(durationMs || 650), 250, 1600);

    let raf = 0;
    const tick = (now) => {
      const t = clamp((now - start) / duration, 0, 1);
      const ease = 1 - Math.pow(1 - t, 3);
      const next = from + (target - from) * ease;
      setShown(next);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [durationMs, prefersReducedMotion, value]);

  const fixed = shown.toFixed(Math.max(0, Number(decimals || 0)));
  return <>{fixed}</>;
}

function normalizeRow(r) {
  const legacyBenef = r?.beneficiaire ?? r?.beneficiary;
  const legacyProductName = r?.designation ?? r?.product_name;
  const legacyDate = r?.date_prelevement ?? r?.date_exit;

  return {
    exit_id: r?.exit_id || r?._id || null,
    exit_number: r?.exit_number || null,
    date_exit: legacyDate || null,

    beneficiary: legacyBenef || 'N/A',
    direction: r?.direction || r?.direction_laboratory || null,

    product_id: r?.product_id || r?.product?._id || null,
    product_code: r?.product_code || r?.product?.code_product || null,
    product_name: legacyProductName || r?.product?.name || '-',
    product_family: r?.product_family || r?.product?.family || null,
    product_category: r?.product_category || r?.product?.category?.name || null,
    unit: r?.unit || r?.product?.unite || 'Unite',

    quantity: Number(r?.quantity || 0),
    motif: r?.motif || r?.note || null,
    request_status: r?.request_status || null,
  };
}

function buildQuickRange(key) {
  const now = new Date();
  const to = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  if (key === 'today') {
    const from = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    return { from, to };
  }
  if (key === '7d') {
    const from = new Date(to.getTime() - 6 * 24 * 60 * 60 * 1000);
    return { from, to };
  }
  if (key === '30d') {
    const from = new Date(to.getTime() - 29 * 24 * 60 * 60 * 1000);
    return { from, to };
  }
  if (key === 'month') {
    const from = new Date(to.getFullYear(), to.getMonth(), 1);
    return { from, to };
  }
  return null;
}

function safeText(value, fallback = '-') {
  const s = String(value ?? '').trim();
  return s ? s : fallback;
}

function computeAverages(rows, keyFn) {
  const map = new Map();
  (rows || []).forEach((row) => {
    const key = String(keyFn(row) || '').trim();
    if (!key) return;
    const prev = map.get(key) || { sum: 0, count: 0 };
    prev.sum += Number(row?.quantity || 0);
    prev.count += 1;
    map.set(key, prev);
  });
  const avg = new Map();
  map.forEach((v, k) => {
    avg.set(k, v.count ? v.sum / v.count : 0);
  });
  return avg;
}

function computeStatus(row, avgByProduct, avgByBeneficiary) {
  const qty = Number(row?.quantity || 0);
  if (qty <= 0) return { label: 'Normal', tone: 'ok', icon: CheckCircle2 };

  const productKey = String(row?.product_id || row?.product_code || row?.product_name || '').trim();
  const beneficiaryKey = String(row?.beneficiary || '').trim();
  const productAvg = Number(avgByProduct.get(productKey) || 0);
  const beneficiaryAvg = Number(avgByBeneficiary.get(beneficiaryKey) || 0);

  const isSensitive = String(row?.product_family || '').toLowerCase() === 'produit_chimique';

  const highThreshold = Math.max(productAvg * 1.8, beneficiaryAvg * 2.0, 5);
  const verifyThreshold = Math.max(productAvg * 3.0, beneficiaryAvg * 3.2, isSensitive ? 8 : 12);

  if (qty >= verifyThreshold || (isSensitive && qty >= Math.max(productAvg * 2.0, 6))) {
    return { label: 'À vérifier', tone: 'danger', icon: AlertTriangle };
  }
  if (qty >= highThreshold) {
    return { label: 'Consommation élevée', tone: 'warn', icon: TrendingUp };
  }
  return { label: 'Normal', tone: 'ok', icon: CheckCircle2 };
}

export default function ConsommationResp({ userName, onLogout }) {
  const toast = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => (typeof window !== 'undefined' ? window.innerWidth <= 768 : false));
  const [isLoading, setIsLoading] = useState(false);

  const [from, setFrom] = useState(() => {
    const qp = String(searchParams.get('from') || '').trim();
    if (qp) {
      const dt = new Date(qp);
      if (!Number.isNaN(dt.getTime())) return formatIsoDate(dt);
    }
    const preset = String(searchParams.get('days') || searchParams.get('preset') || '').trim().toLowerCase();
    const quickKey = preset === '1' || preset === 'today' ? 'today' : preset === '7' || preset === '7d' ? '7d' : preset === '30' || preset === '30d' ? '30d' : preset === 'month' ? 'month' : '';
    const range = quickKey ? buildQuickRange(quickKey) : null;
    if (range) return formatIsoDate(range.from);

    const d = new Date();
    d.setDate(d.getDate() - 6);
    return formatIsoDate(d);
  });

  const [to, setTo] = useState(() => {
    const qp = String(searchParams.get('to') || '').trim();
    if (qp) {
      const dt = new Date(qp);
      if (!Number.isNaN(dt.getTime())) return formatIsoDate(dt);
    }
    const preset = String(searchParams.get('days') || searchParams.get('preset') || '').trim().toLowerCase();
    const quickKey = preset === '1' || preset === 'today' ? 'today' : preset === '7' || preset === '7d' ? '7d' : preset === '30' || preset === '30d' ? '30d' : preset === 'month' ? 'month' : '';
    const range = quickKey ? buildQuickRange(quickKey) : null;
    if (range) return formatIsoDate(range.to);
    return formatIsoDate(new Date());
  });

  const [search, setSearch] = useState(() => String(searchParams.get('q') || '').trim());
  const [directionFilter, setDirectionFilter] = useState(() => String(searchParams.get('direction') || '').trim());
  const [categoryFilter, setCategoryFilter] = useState(() => String(searchParams.get('category') || '').trim());
  const [typeFilter, setTypeFilter] = useState(() => String(searchParams.get('type') || '').trim());

  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(1);
  const [selectedRow, setSelectedRow] = useState(null);

  useEffect(() => {
    const qp = String(searchParams.get('q') || '').trim();
    if (qp) setSearch(qp);
    const dir = String(searchParams.get('direction') || '').trim();
    if (dir) setDirectionFilter(dir);
    const cat = String(searchParams.get('category') || '').trim();
    if (cat) setCategoryFilter(cat);
    const type = String(searchParams.get('type') || '').trim();
    if (type) setTypeFilter(type);

    const qpFrom = String(searchParams.get('from') || '').trim();
    const qpTo = String(searchParams.get('to') || '').trim();
    if (qpFrom) {
      const dt = new Date(qpFrom);
      if (!Number.isNaN(dt.getTime())) setFrom(formatIsoDate(dt));
    }
    if (qpTo) {
      const dt = new Date(qpTo);
      if (!Number.isNaN(dt.getTime())) setTo(formatIsoDate(dt));
    }
  }, [searchParams]);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await get(`/reports/consumption/person?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
      const raw = Array.isArray(data?.rows) ? data.rows : [];
      setRows(raw.map(normalizeRow));
      setPage(1);
    } catch (err) {
      setRows([]);
      toast.error(err?.message || 'Erreur chargement consommation');
    } finally {
      setIsLoading(false);
    }
  }, [from, to, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = String(search || '').trim().toLowerCase();
    return (rows || []).filter((r) => {
      if (directionFilter) {
        const dir = String(r?.direction || '').trim();
        if (dir !== directionFilter) return false;
      }
      if (categoryFilter) {
        const cat = String(r?.product_category || '').trim();
        if (cat !== categoryFilter) return false;
      }
      if (typeFilter) {
        const type = String(r?.product_family || '').trim();
        if (type !== typeFilter) return false;
      }

      if (!q) return true;
      const beneficiary = String(r?.beneficiary || '').toLowerCase();
      const direction = String(r?.direction || '').toLowerCase();
      const product = String(r?.product_name || '').toLowerCase();
      const code = String(r?.product_code || '').toLowerCase();
      const category = String(r?.product_category || '').toLowerCase();
      const family = String(r?.product_family || '').toLowerCase();
      return beneficiary.includes(q) || product.includes(q) || code.includes(q) || direction.includes(q) || category.includes(q) || family.includes(q);
    });
  }, [rows, search, directionFilter, categoryFilter, typeFilter]);

  const kpis = useMemo(() => {
    const beneficiaries = new Set(filtered.map((r) => String(r?.beneficiary || 'N/A')));
    const total = sumQty(filtered);

    const byProduct = new Map();
    const byDirection = new Map();
    filtered.forEach((r) => {
      const pKey = String(r?.product_id || r?.product_code || r?.product_name || '-');
      byProduct.set(pKey, (byProduct.get(pKey) || 0) + Number(r?.quantity || 0));
      const dKey = String(r?.direction || '').trim();
      if (dKey) byDirection.set(dKey, (byDirection.get(dKey) || 0) + Number(r?.quantity || 0));
    });

    let topProductKey = null;
    let topProductQty = 0;
    byProduct.forEach((qty, key) => {
      if (qty > topProductQty) {
        topProductQty = qty;
        topProductKey = key;
      }
    });

    const topProductRow = topProductKey
      ? filtered.find((r) => String(r?.product_id || r?.product_code || r?.product_name || '-') === String(topProductKey))
      : null;

    let topDirection = null;
    let topDirectionQty = 0;
    byDirection.forEach((qty, key) => {
      if (qty > topDirectionQty) {
        topDirectionQty = qty;
        topDirection = key;
      }
    });

    return {
      count: filtered.length,
      beneficiaries: beneficiaries.size,
      total,
      topProduct: topProductRow ? { name: topProductRow.product_name || '-', qty: topProductQty } : null,
      topDirection: topDirection ? { name: topDirection, qty: topDirectionQty } : null,
    };
  }, [filtered]);

  const directionOptions = useMemo(() => {
    const set = new Set();
    (rows || []).forEach((r) => {
      const v = String(r?.direction || '').trim();
      if (v) set.add(v);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'fr'));
  }, [rows]);

  const categoryOptions = useMemo(() => {
    const set = new Set();
    (rows || []).forEach((r) => {
      const v = String(r?.product_category || '').trim();
      if (v) set.add(v);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'fr'));
  }, [rows]);

  const typeOptions = useMemo(() => {
    const set = new Set();
    (rows || []).forEach((r) => {
      const v = String(r?.product_family || '').trim();
      if (v) set.add(v);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'fr'));
  }, [rows]);

  const topBeneficiaries = useMemo(() => {
    const map = new Map();
    filtered.forEach((r) => {
      const key = String(r?.beneficiary || 'N/A');
      map.set(key, (map.get(key) || 0) + Number(r?.quantity || 0));
    });
    const rowsAgg = Array.from(map.entries())
      .map(([name, qty]) => ({ name, qty: Number(qty || 0) }))
      .sort((a, b) => b.qty - a.qty);
    const max = rowsAgg.length ? rowsAgg[0].qty : 0;
    return rowsAgg.slice(0, 10).map((r) => ({ ...r, ratio: max ? r.qty / max : 0 }));
  }, [filtered]);

  const topProducts = useMemo(() => {
    const map = new Map();
    filtered.forEach((r) => {
      const key = String(r?.product_id || r?.product_code || r?.product_name || '-');
      const prev = map.get(key) || {
        key,
        code: r?.product_code || '-',
        name: r?.product_name || '-',
        qty: 0,
      };
      prev.qty += Number(r?.quantity || 0);
      map.set(key, prev);
    });
    const rowsAgg = Array.from(map.values()).sort((a, b) => b.qty - a.qty);
    const max = rowsAgg.length ? rowsAgg[0].qty : 0;
    return rowsAgg.slice(0, 10).map((r) => ({ ...r, ratio: max ? r.qty / max : 0 }));
  }, [filtered]);

  const dailyTrend = useMemo(() => {
    const map = new Map();
    (filtered || []).forEach((r) => {
      const day = r?.date_exit ? formatIsoDate(r.date_exit) : '';
      if (!day) return;
      map.set(day, (map.get(day) || 0) + Number(r?.quantity || 0));
    });
    return Array.from(map.entries())
      .map(([day, qty]) => ({ day, qty: Number(qty || 0) }))
      .sort((a, b) => new Date(a.day) - new Date(b.day));
  }, [filtered]);

  const quickKeyActive = useMemo(() => {
    const rangeToday = buildQuickRange('today');
    const range7 = buildQuickRange('7d');
    const range30 = buildQuickRange('30d');
    const rangeMonth = buildQuickRange('month');
    if (!rangeToday || !range7 || !range30 || !rangeMonth) return '';

    const same = (range) => formatIsoDate(range.from) === from && formatIsoDate(range.to) === to;
    if (same(rangeToday)) return 'today';
    if (same(range7)) return '7d';
    if (same(range30)) return '30d';
    if (same(rangeMonth)) return 'month';
    return '';
  }, [from, to]);

  const applyQuick = useCallback((key) => {
    const range = buildQuickRange(key);
    if (!range) return;
    setFrom(formatIsoDate(range.from));
    setTo(formatIsoDate(range.to));
  }, []);

  const avgByProduct = useMemo(() => computeAverages(filtered, (r) => r?.product_id || r?.product_code || r?.product_name), [filtered]);
  const avgByBeneficiary = useMemo(() => computeAverages(filtered, (r) => r?.beneficiary), [filtered]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(filtered.length / 20)), [filtered.length]);
  const currentPage = clamp(page, 1, totalPages);
  const pageRows = useMemo(() => {
    const start = (currentPage - 1) * 20;
    return filtered.slice(start, start + 20);
  }, [currentPage, filtered]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const periodSummary = useMemo(() => {
    if (!filtered.length) return 'Aucune consommation enregistrée sur cette période.';

    const parts = [];
    const beneficiaries = kpis.beneficiaries || 0;
    const totalQty = Math.round(Number(kpis.total || 0));
    parts.push(`${beneficiaries} bénéficiaire${beneficiaries > 1 ? 's' : ''} ont consommé ${totalQty} article${totalQty > 1 ? 's' : ''}.`);
    if (kpis.topProduct?.name) parts.push(`Le produit le plus demandé est “${kpis.topProduct.name}”.`);
    if (kpis.topDirection?.name) parts.push(`La direction la plus consommatrice est “${kpis.topDirection.name}”.`);
    return parts.join(' ');
  }, [filtered.length, kpis.beneficiaries, kpis.total, kpis.topDirection?.name, kpis.topProduct?.name]);

  return (
    <ProtectedPage userName={userName}>
      <div className="app-layout">
        <div className={`sidebar-backdrop ${sidebarCollapsed ? 'hidden' : ''}`} onClick={() => setSidebarCollapsed(true)} />
        <SidebarResp collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed((p) => !p)} onLogout={onLogout} userName={userName} />

        <div className="main-container">
          <HeaderPage
            userName={userName}
            title="Consommation par bénéficiaire"
            subtitle="Suivi des sorties de stock par bénéficiaire, produit et direction."
            showSearch={false}
            onRefresh={load}
            onMenuClick={() => setSidebarCollapsed((p) => !p)}
          />

          <main className="main-content">
            {isLoading && <LoadingSpinner overlay text="Chargement..." />}

            <div className="resp-consumption">
              <section className="cons-controls" aria-label="Filtres">
                <div className="cons-top-row">
                  <div className="cons-date">
                    <Calendar size={18} />
                    <label>
                      Date début
                      <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
                    </label>
                    <label>
                      Date fin
                      <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
                    </label>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={load}>
                      <RefreshCw size={14} /> Actualiser
                    </button>
                  </div>

                  <div className="cons-quick" aria-label="Filtres rapides">
                    <button type="button" className={`cons-pill ${quickKeyActive === 'today' ? 'active' : ''}`} onClick={() => applyQuick('today')} disabled={isLoading}>
                      Aujourd’hui
                    </button>
                    <button type="button" className={`cons-pill ${quickKeyActive === '7d' ? 'active' : ''}`} onClick={() => applyQuick('7d')} disabled={isLoading}>
                      7 jours
                    </button>
                    <button type="button" className={`cons-pill ${quickKeyActive === '30d' ? 'active' : ''}`} onClick={() => applyQuick('30d')} disabled={isLoading}>
                      30 jours
                    </button>
                    <button type="button" className={`cons-pill ${quickKeyActive === 'month' ? 'active' : ''}`} onClick={() => applyQuick('month')} disabled={isLoading}>
                      Mois en cours
                    </button>
                  </div>
                </div>

                <div className="cons-filter-row">
                  <input
                    className="cons-search"
                    placeholder="Rechercher un bénéficiaire ou un produit..."
                    value={search}
                    onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                  />

                  <div className="cons-selects" aria-label="Filtres avancés">
                    <label className="cons-select">
                      <span>Direction</span>
                      <select value={directionFilter} onChange={(e) => { setDirectionFilter(e.target.value); setPage(1); }}>
                        <option value="">Toutes</option>
                        {directionOptions.map((d) => (
                          <option key={d} value={d}>{d}</option>
                        ))}
                      </select>
                    </label>

                    <label className="cons-select">
                      <span>Catégorie</span>
                      <select value={categoryFilter} onChange={(e) => { setCategoryFilter(e.target.value); setPage(1); }}>
                        <option value="">Toutes</option>
                        {categoryOptions.map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </label>

                    <label className="cons-select">
                      <span>Type</span>
                      <select value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}>
                        <option value="">Tous</option>
                        {typeOptions.map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                </div>
              </section>

              <section className="cons-kpis" aria-label="Indicateurs">
                <article className="cons-kpi" style={{ '--i': 1 }}>
                  <div className="cons-kpi-head">
                    <div className="cons-kpi-icon info"><BarChart3 size={16} /></div>
                    <span>Lignes</span>
                  </div>
                  <strong className="cons-kpi-value"><AnimatedNumber value={kpis.count} /></strong>
                  <div className="cons-kpi-note">Nombre de lignes de consommation</div>
                </article>

                <article className="cons-kpi" style={{ '--i': 2 }}>
                  <div className="cons-kpi-head">
                    <div className="cons-kpi-icon info"><Users size={16} /></div>
                    <span>Bénéficiaires</span>
                  </div>
                  <strong className="cons-kpi-value"><AnimatedNumber value={kpis.beneficiaries} /></strong>
                  <div className="cons-kpi-note">Personnes ou services concernés</div>
                </article>

                <article className="cons-kpi" style={{ '--i': 3 }}>
                  <div className="cons-kpi-head">
                    <div className="cons-kpi-icon info"><Package size={16} /></div>
                    <span>Quantité totale</span>
                  </div>
                  <strong className="cons-kpi-value"><AnimatedNumber value={Math.round(kpis.total)} /></strong>
                  <div className="cons-kpi-note">Somme des quantités sorties</div>
                </article>

                <article className="cons-kpi" style={{ '--i': 4 }}>
                  <div className="cons-kpi-head">
                    <div className="cons-kpi-icon info"><TrendingUp size={16} /></div>
                    <span>Top produit</span>
                  </div>
                  <strong className="cons-kpi-value">{kpis.topProduct?.name ? safeText(kpis.topProduct.name, '-') : '-'}</strong>
                  <div className="cons-kpi-note">{kpis.topProduct ? `${Math.round(kpis.topProduct.qty)} unité(s)` : 'Aucun top produit'}</div>
                </article>

                <article className="cons-kpi" style={{ '--i': 5 }}>
                  <div className="cons-kpi-head">
                    <div className="cons-kpi-icon info"><Building2 size={16} /></div>
                    <span>Direction</span>
                  </div>
                  <strong className="cons-kpi-value">{kpis.topDirection?.name ? safeText(kpis.topDirection.name, '-') : '-'}</strong>
                  <div className="cons-kpi-note">{kpis.topDirection ? 'Direction la plus consommatrice' : 'Non disponible'}</div>
                </article>
              </section>

              <section className="cons-summary" aria-label="Résumé de la période">
                <div className="cons-summary-head">
                  <div className="cons-summary-title">
                    <Tag size={15} />
                    <strong>Résumé de la période</strong>
                  </div>
                  <div className="cons-summary-meta">{from} → {to}</div>
                </div>
                <div className={`cons-summary-body ${filtered.length ? '' : 'empty'}`}>
                  {periodSummary}
                </div>
              </section>

              <section className="cons-charts" aria-label="Graphiques">
                <article className="cons-chart-card" aria-label="Top bénéficiaires">
                  <div className="cons-chart-head">
                    <h3><Users size={16} /> Top bénéficiaires</h3>
                    <span>Qui consomme le plus</span>
                  </div>
                  {topBeneficiaries.length ? (
                    <div className="cons-bars">
                      {topBeneficiaries.slice(0, 8).map((row) => (
                        <button
                          type="button"
                          className="cons-bar-row"
                          key={row.name}
                          onClick={() => setSearch(row.name)}
                          title="Cliquer pour filtrer"
                        >
                          <span className="cons-bar-label">{safeText(row.name, 'N/A')}</span>
                          <span className="cons-bar-track" aria-hidden="true">
                            <span className="cons-bar-fill" style={{ width: `${Math.round(row.ratio * 100)}%` }} />
                          </span>
                          <span className="cons-bar-value">{Math.round(row.qty)}</span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="cons-empty-mini">Aucune donnée sur cette période.</div>
                  )}
                  <p className="cons-chart-note">Astuce : cliquez sur un nom pour filtrer la liste.</p>
                </article>

                <article className="cons-chart-card" aria-label="Top produits consommés">
                  <div className="cons-chart-head">
                    <h3><Package size={16} /> Top produits consommés</h3>
                    <span>Produits les plus sortis</span>
                  </div>
                  {topProducts.length ? (
                    <div className="cons-bars">
                      {topProducts.slice(0, 8).map((row) => (
                        <button
                          type="button"
                          className="cons-bar-row"
                          key={row.key}
                          onClick={() => setSearch(row.code && row.code !== '-' ? row.code : row.name)}
                          title="Cliquer pour filtrer"
                        >
                          <span className="cons-bar-label" title={row.name}>{row.code || '-'}</span>
                          <span className="cons-bar-track" aria-hidden="true">
                            <span className="cons-bar-fill" style={{ width: `${Math.round(row.ratio * 100)}%` }} />
                          </span>
                          <span className="cons-bar-value">{Math.round(row.qty)}</span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="cons-empty-mini">Aucune donnée sur cette période.</div>
                  )}
                  <p className="cons-chart-note">Astuce : cliquez sur un code pour filtrer la liste.</p>
                </article>

                <article className="cons-chart-card" aria-label="Évolution des consommations">
                  <div className="cons-chart-head">
                    <h3><TrendingUp size={16} /> Évolution des consommations</h3>
                    <span>Sorties par jour</span>
                  </div>
                  {dailyTrend.length > 1 ? (
                    <div className="cons-line-wrap">
                      {(() => {
                        const WIDTH = 520;
                        const HEIGHT = 190;
                        const PAD_X = 18;
                        const PAD_Y = 16;
                        const values = dailyTrend.map((d) => d.qty);
                        const min = 0;
                        const max = Math.max(...values, 1);
                        const coords = toLineCoords(values, min, max, WIDTH, HEIGHT, PAD_X, PAD_Y);
                        const labels = dailyTrend.map((d) => formatDayLabel(d.day));

                        return (
                          <>
                            <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="cons-line-svg" preserveAspectRatio="none">
                              <line x1={PAD_X} y1={HEIGHT - PAD_Y} x2={WIDTH - PAD_X} y2={HEIGHT - PAD_Y} className="cons-axis" />
                              <path d={toAreaPath(coords, HEIGHT, PAD_Y)} className="cons-area" />
                              <polyline points={toPolylinePoints(coords)} className="cons-line" />
                              {coords.length > 0 && (
                                <circle cx={coords[coords.length - 1].x} cy={coords[coords.length - 1].y} r="3.8" className="cons-point" />
                              )}
                            </svg>
                            <div className="cons-xlabels" style={{ gridTemplateColumns: `repeat(${Math.max(2, labels.length)}, minmax(0, 1fr))` }}>
                              {labels.map((label) => (
                                <span key={label}>{label}</span>
                              ))}
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  ) : (
                    <div className="cons-empty-mini">Pas assez de jours pour afficher une courbe.</div>
                  )}
                  <p className="cons-chart-note">Lecture : une hausse signifie plus de sorties de stock.</p>
                </article>
              </section>

              <section className="cons-table-wrap" aria-label="Tableau détaillé">
                <div className="cons-table-head">
                  <div className="cons-table-title">
                    <strong>Tableau détaillé</strong>
                    <span>{filtered.length} ligne(s)</span>
                  </div>
                  <div className="cons-table-actions">
                    <button type="button" className="cons-link" onClick={() => navigate('/responsable/transactions')} disabled={isLoading}>
                      Voir transactions <ArrowUpRight size={14} />
                    </button>
                  </div>
                </div>

                {filtered.length === 0 ? (
                  <div className="empty-state">
                    <h4>Aucune consommation trouvée</h4>
                    <p>Aucune sortie de stock n’a été enregistrée pour cette période. Essayez une période plus large ou consultez les transactions récentes.</p>
                    <div className="empty-actions">
                      <button type="button" className="btn btn-primary" onClick={() => applyQuick('30d')} disabled={isLoading}>
                        Afficher 30 derniers jours
                      </button>
                      <button type="button" className="btn btn-secondary" onClick={() => navigate('/responsable/transactions')} disabled={isLoading}>
                        Voir transactions
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <table className="cons-table">
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Bénéficiaire</th>
                          <th>Direction</th>
                          <th>Produit</th>
                          <th>Catégorie</th>
                          <th className="num">Quantité</th>
                          <th>Unité</th>
                          <th>Motif</th>
                          <th>Statut</th>
                          <th className="actions">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pageRows.map((r, idx) => {
                          const status = computeStatus(r, avgByProduct, avgByBeneficiary);
                          const StatusIcon = status.icon;
                          return (
                            <tr key={`${r.exit_id || 'x'}-${idx}`}>
                              <td className="nowrap">{formatDateTime(r.date_exit)}</td>
                              <td>{safeText(r.beneficiary, 'N/A')}</td>
                              <td>{safeText(r.direction, '-')}</td>
                              <td>
                                <div className="cons-product-cell">
                                  <span className="cons-product-code">{safeText(r.product_code, '-')}</span>
                                  <span className="cons-product-name">{safeText(r.product_name, '-')}</span>
                                </div>
                              </td>
                              <td>{safeText(r.product_category, '-')}</td>
                              <td className="num"><strong>{Number(r.quantity || 0)}</strong></td>
                              <td>{safeText(r.unit, 'Unite')}</td>
                              <td className="motif" title={safeText(r.motif, '-')}>{safeText(r.motif, '-')}</td>
                              <td>
                                <span className={`cons-status ${status.tone}`}>
                                  <StatusIcon size={14} />
                                  {status.label}
                                </span>
                              </td>
                              <td className="actions">
                                <button type="button" className="cons-action" onClick={() => setSelectedRow(r)} title="Voir détail">
                                  <Eye size={14} /> Détail
                                </button>
                                <button
                                  type="button"
                                  className="cons-action"
                                  onClick={() => navigate(`/responsable/produits?q=${encodeURIComponent(String(r.product_code || r.product_name || '').trim())}`)}
                                  title="Voir produit"
                                >
                                  <Package size={14} /> Produit
                                </button>
                                <button
                                  type="button"
                                  className="cons-action"
                                  onClick={() => navigate(`/responsable/transactions?type=sortie&q=${encodeURIComponent(String(r.product_code || r.product_name || '').trim())}`)}
                                  title="Voir transaction"
                                >
                                  <ArrowUpRight size={14} /> Transaction
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>

                    <div className="cons-pagination" aria-label="Pagination">
                      <button type="button" className="cons-pager" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={currentPage <= 1}>
                        Précédent
                      </button>
                      <div className="cons-page-indicator">Page <strong>{currentPage}</strong> / {totalPages}</div>
                      <button type="button" className="cons-pager" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage >= totalPages}>
                        Suivant
                      </button>
                    </div>
                  </>
                )}
              </section>

              {selectedRow && (
                <div className="cons-modal-backdrop" role="presentation" onClick={() => setSelectedRow(null)}>
                  <div className="cons-modal" role="dialog" aria-label="Détail consommation" onClick={(e) => e.stopPropagation()}>
                    <div className="cons-modal-head">
                      <div className="cons-modal-title">
                        <strong>Détail</strong>
                        <span className="cons-modal-sub">Sortie de stock</span>
                      </div>
                      <button type="button" className="cons-modal-close" onClick={() => setSelectedRow(null)} aria-label="Fermer">
                        <X size={18} />
                      </button>
                    </div>

                    <div className="cons-modal-grid">
                      <div className="cons-kv">
                        <span>Date</span>
                        <strong>{formatDateTime(selectedRow.date_exit)}</strong>
                      </div>
                      <div className="cons-kv">
                        <span>Bénéficiaire</span>
                        <strong>{safeText(selectedRow.beneficiary, 'N/A')}</strong>
                      </div>
                      <div className="cons-kv">
                        <span>Direction</span>
                        <strong>{safeText(selectedRow.direction, '-')}</strong>
                      </div>
                      <div className="cons-kv">
                        <span>Produit</span>
                        <strong>{safeText(selectedRow.product_name, '-')}</strong>
                      </div>
                      <div className="cons-kv">
                        <span>Catégorie</span>
                        <strong>{safeText(selectedRow.product_category, '-')}</strong>
                      </div>
                      <div className="cons-kv">
                        <span>Type</span>
                        <strong>{safeText(selectedRow.product_family, '-')}</strong>
                      </div>
                      <div className="cons-kv">
                        <span>Quantité</span>
                        <strong>{Number(selectedRow.quantity || 0)} {safeText(selectedRow.unit, 'Unite')}</strong>
                      </div>
                      <div className="cons-kv">
                        <span>Motif</span>
                        <strong>{safeText(selectedRow.motif, '-')}</strong>
                      </div>
                    </div>

                    <div className="cons-modal-actions">
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => navigate(`/responsable/produits?q=${encodeURIComponent(String(selectedRow.product_code || selectedRow.product_name || '').trim())}`)}
                      >
                        Voir produit
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => navigate(`/responsable/transactions?type=sortie&q=${encodeURIComponent(String(selectedRow.product_code || selectedRow.product_name || '').trim())}`)}
                      >
                        Voir transaction
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </main>
        </div>
      </div>
    </ProtectedPage>
  );
}
