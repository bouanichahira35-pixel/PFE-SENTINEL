import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Package,
  Calendar,
  User,
  Filter,
  Download,
  FileText,
  Paperclip,
  Brain,
  RefreshCw,
  BarChart3,
} from 'lucide-react';
import SidebarResp from '../../components/responsable/SidebarResp';
import HeaderPage from '../../components/shared/HeaderPage';
import AppTable from '../../components/shared/AppTable';
import LoadingSpinner from '../../components/shared/LoadingSpinner';
import { useToast } from '../../components/shared/Toast';
import { get, post } from '../../services/api';
import { useUiLanguage } from '../../utils/uiLanguage';
import './HistoriqueResp.css';

function formatDate(value) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString('fr-FR');
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function sumPredictions(items) {
  if (!Array.isArray(items)) return 0;
  return items.reduce((acc, x) => acc + Number(x?.expected_quantity || 0), 0);
}

const HistoriqueResp = ({ userName, onLogout }) => {
  const lang = useUiLanguage();
  const toast = useToast();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('tous');
  const [filterMagasinier, setFilterMagasinier] = useState('tous');
  const [items, setItems] = useState([]);
  const [isLoadingAi, setIsLoadingAi] = useState(false);
  const [aiMetrics, setAiMetrics] = useState(null);
  const [aiBacktesting, setAiBacktesting] = useState(null);
  const [aiVersions, setAiVersions] = useState([]);
  const [aiMetricKey, setAiMetricKey] = useState('stockout_f1');
  const [aiLiveGap, setAiLiveGap] = useState({
    predicted_7d: 0,
    actual_7d: 0,
    gap_7d: 0,
    gap_7d_pct: 0,
    predicted_14d: 0,
    actual_14d: 0,
    gap_14d: 0,
    gap_14d_pct: 0,
  });

  const i18n = {
    fr: { title: 'Historique Global', fail: 'Chargement historique echoue', allOps: 'Toutes les operations', entries: 'Entrees', exits: 'Sorties', validations: 'Validations', allMag: 'Tous les magasiniers', export: 'Exporter', noData: 'Aucune donnee a exporter', op: 'operation', ops: 'operations' },
    en: { title: 'Global History', fail: 'Failed to load history', allOps: 'All operations', entries: 'Entries', exits: 'Exits', validations: 'Validations', allMag: 'All storekeepers', export: 'Export', noData: 'No data to export', op: 'operation', ops: 'operations' },
    ar: { title: 'السجل العام', fail: 'فشل تحميل السجل', allOps: 'كل العمليات', entries: 'الدخول', exits: 'الخروج', validations: 'الاعتمادات', allMag: 'كل أمناء المخزن', export: 'تصدير', noData: 'لا توجد بيانات للتصدير', op: 'عملية', ops: 'عمليات' },
  }[lang];

  const loadData = useCallback(async () => {
    setIsLoadingAi(true);
    try {
      const [
        entries,
        exits,
        historyResponse,
        metricsResponse,
        backtestingResponse,
        versionsResponse,
        pred7Response,
        pred14Response,
      ] = await Promise.all([
        get('/stock/entries'),
        get('/stock/exits'),
        get('/history'),
        get('/ai/models/metrics').catch(() => ({ metrics: null })),
        get('/ai/models/backtesting').catch(() => ({ backtesting: null })),
        get('/ai/models/versions').catch(() => ({ versions: [] })),
        post('/ai/predict/consumption', { horizon_days: 7 }).catch(() => ({ predictions: [] })),
        post('/ai/predict/consumption', { horizon_days: 14 }).catch(() => ({ predictions: [] })),
      ]);

      const history = Array.isArray(historyResponse)
        ? historyResponse
        : Array.isArray(historyResponse?.items)
          ? historyResponse.items
          : [];

      const entryRows = entries.map((e) => ({
        id: `entry-${e._id}`,
        type: 'entree',
        typeLabel: 'Entree',
        produit: e.product?.name || '-',
        code: e.product?.code_product || '-',
        quantite: Number(e.quantity || 0),
        date: e.date_entry || e.createdAt,
        magasinier: e.magasinier?.username || '-',
        responsable: userName || '-',
        source: e.supplier || e.service_requester || e.delivery_note_number || '-',
        attachments: Array.isArray(e.attachments) ? e.attachments : [],
      }));

      const exitRows = exits.map((x) => ({
        id: `exit-${x._id}`,
        type: 'sortie',
        typeLabel: 'Sortie',
        produit: x.product?.name || '-',
        code: x.product?.code_product || '-',
        quantite: Number(x.quantity || 0),
        date: x.date_exit || x.createdAt,
        magasinier: x.magasinier?.username || '-',
        responsable: userName || '-',
        source: x.direction_laboratory || x.beneficiary || x.withdrawal_paper_number || '-',
        attachments: Array.isArray(x.attachments) ? x.attachments : [],
      }));

      const validationRows = history
        .filter((h) => ['validation', 'product_create', 'product_update'].includes(h.action_type))
        .map((h) => ({
          id: `${h.action_type}-${h._id}`,
          type: h.action_type === 'validation' ? 'validation' : 'autre',
          typeLabel:
            h.action_type === 'product_create'
              ? 'Ajout produit'
              : h.action_type === 'product_update'
                ? 'Maj produit'
                : 'Validation',
          produit: h.product?.name || '-',
          code: h.product?.code_product || '-',
          quantite: Number(h.quantity || 0),
          date: h.date_action || h.createdAt,
          magasinier: '-',
          responsable: h.user?.username || userName || '-',
          source: h.description || 'Validation produit',
          attachments: [],
        }));

      setItems([...entryRows, ...exitRows, ...validationRows].sort((a, b) => new Date(b.date) - new Date(a.date)));

      setAiMetrics(metricsResponse?.metrics || null);
      setAiBacktesting(backtestingResponse?.backtesting || null);
      setAiVersions(Array.isArray(versionsResponse?.versions) ? versionsResponse.versions : []);

      const now = Date.now();
      const from7 = now - (7 * 24 * 60 * 60 * 1000);
      const from14 = now - (14 * 24 * 60 * 60 * 1000);
      let actual7 = 0;
      let actual14 = 0;
      for (const x of exits) {
        const t = new Date(x.date_exit || x.createdAt || 0).getTime();
        if (!Number.isFinite(t)) continue;
        const qty = Number(x.quantity || 0);
        if (t >= from7) actual7 += qty;
        if (t >= from14) actual14 += qty;
      }
      const predicted7 = sumPredictions(pred7Response?.predictions);
      const predicted14 = sumPredictions(pred14Response?.predictions);
      const gap7 = predicted7 - actual7;
      const gap14 = predicted14 - actual14;
      const gap7Pct = actual7 > 0 ? (gap7 / actual7) * 100 : (predicted7 > 0 ? 100 : 0);
      const gap14Pct = actual14 > 0 ? (gap14 / actual14) * 100 : (predicted14 > 0 ? 100 : 0);
      setAiLiveGap({
        predicted_7d: Number(predicted7.toFixed(2)),
        actual_7d: Number(actual7.toFixed(2)),
        gap_7d: Number(gap7.toFixed(2)),
        gap_7d_pct: Number(gap7Pct.toFixed(2)),
        predicted_14d: Number(predicted14.toFixed(2)),
        actual_14d: Number(actual14.toFixed(2)),
        gap_14d: Number(gap14.toFixed(2)),
        gap_14d_pct: Number(gap14Pct.toFixed(2)),
      });
    } catch (err) {
      toast.error(err.message || i18n.fail);
    } finally {
      setIsLoadingAi(false);
    }
  }, [toast, userName, i18n.fail]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const magasiniers = useMemo(() => ['tous', ...new Set(items.map((h) => h.magasinier).filter((x) => x && x !== '-'))], [items]);

  const filteredHistorique = useMemo(() => {
    return items.filter((item) => {
      const q = searchQuery.toLowerCase();
      const matchSearch = item.produit.toLowerCase().includes(q) || item.code.toLowerCase().includes(q);
      const matchType = filterType === 'tous' || item.type === filterType;
      const matchMag = filterMagasinier === 'tous' || item.magasinier === filterMagasinier;
      return matchSearch && matchType && matchMag;
    });
  }, [items, searchQuery, filterType, filterMagasinier]);

  const reliability = useMemo(() => {
    const cons7 = clamp(100 - Math.abs(Number(aiLiveGap.gap_7d_pct || 0)), 0, 100);
    const cons14 = aiMetrics?.consumption_j14?.mape !== undefined
      ? clamp(100 - Number(aiMetrics.consumption_j14.mape || 0), 0, 100)
      : null;
    const f1 = Number(aiMetrics?.stockout_j7?.f1 || 0);
    const auc = Number(aiMetrics?.stockout_j7?.auc || 0);
    const rupture7 = clamp(((f1 * 100) * 0.6) + ((auc * 100) * 0.4), 0, 100);
    return {
      consumption_7d: Number(cons7.toFixed(2)),
      consumption_14d: cons14 === null ? null : Number(cons14.toFixed(2)),
      rupture_7d: Number(rupture7.toFixed(2)),
    };
  }, [aiLiveGap, aiMetrics]);

  const backtestingSeries = useMemo(() => {
    const rows = Array.isArray(aiVersions) ? aiVersions.slice(0, 12).reverse() : [];
    const mapped = rows.map((v) => {
      const s = v?.backtesting_summary || {};
      const valueRaw =
        aiMetricKey === 'stockout_f1' ? Number(s.stockout_f1 || 0) * 100
          : aiMetricKey === 'stockout_auc' ? Number(s.stockout_auc || 0) * 100
            : aiMetricKey === 'consumption_mae' ? Number(s.consumption_mae || 0)
              : Number(s.consumption_mape || 0);
      return {
        label: String(v?.model_version || '-').slice(-6),
        value: Number.isFinite(valueRaw) ? Number(valueRaw.toFixed(2)) : 0,
      };
    });
    const max = Math.max(1, ...mapped.map((x) => x.value));
    return { rows: mapped, max };
  }, [aiVersions, aiMetricKey]);

  const getTypeIcon = (type) => {
    if (type === 'entree') return <ArrowDownToLine size={16} />;
    if (type === 'sortie') return <ArrowUpFromLine size={16} />;
    return <FileText size={16} />;
  };

  const getTypeClass = (type) => {
    if (type === 'entree') return 'type-entree';
    if (type === 'sortie') return 'type-sortie';
    if (type === 'validation') return 'type-validation';
    return 'type-autre';
  };

  const handleExport = () => {
    if (!filteredHistorique.length) {
      toast.warning(i18n.noData);
      return;
    }

    const header = ['Type', 'Produit', 'Code', 'Quantite', 'Date', 'Magasinier', 'Responsable', 'Source_Destination'];
    const escapeCsv = (v) => {
      const s = String(v ?? '');
      if (s.includes('"') || s.includes(';') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };
    const lines = [
      header.join(';'),
      ...filteredHistorique.map((item) => ([
        item.typeLabel,
        item.produit,
        item.code,
        item.quantite,
        formatDate(item.date),
        item.magasinier,
        item.responsable,
        item.source,
      ].map(escapeCsv).join(';'))),
    ];
    const blob = new Blob([`\uFEFF${lines.join('\n')}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `historique_global_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="app-layout">
      <SidebarResp collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} onLogout={onLogout} userName={userName} />
      <div className="main-container">
        <HeaderPage userName={userName} title={i18n.title} searchValue={searchQuery} onSearchChange={setSearchQuery} />
        <main className="main-content">
          {(isLoadingAi) && <LoadingSpinner overlay text="Chargement IA..." />}
          <div className="historique-resp-page">
            <div className="ai-history-grid">
              <div className="ai-history-card">
                <div className="ai-history-head"><Brain size={16} /><span>Ecart prevision/reel J+7</span></div>
                <strong>{aiLiveGap.gap_7d >= 0 ? '+' : ''}{aiLiveGap.gap_7d}</strong>
                <small>Prev {aiLiveGap.predicted_7d} / Reel {aiLiveGap.actual_7d} ({aiLiveGap.gap_7d_pct}%)</small>
              </div>
              <div className="ai-history-card">
                <div className="ai-history-head"><Brain size={16} /><span>Ecart prevision/reel J+14</span></div>
                <strong>{aiLiveGap.gap_14d >= 0 ? '+' : ''}{aiLiveGap.gap_14d}</strong>
                <small>Prev {aiLiveGap.predicted_14d} / Reel {aiLiveGap.actual_14d} ({aiLiveGap.gap_14d_pct}%)</small>
              </div>
              <div className="ai-history-card">
                <div className="ai-history-head"><BarChart3 size={16} /><span>Fiabilite conso</span></div>
                <strong>J+7: {reliability.consumption_7d}%</strong>
                <small>J+14: {reliability.consumption_14d ?? '-'}%</small>
              </div>
              <div className="ai-history-card">
                <div className="ai-history-head"><BarChart3 size={16} /><span>Fiabilite rupture J+7</span></div>
                <strong>{reliability.rupture_7d}%</strong>
                <small>F1 {aiMetrics?.stockout_j7?.f1 ?? '-'} / AUC {aiMetrics?.stockout_j7?.auc ?? '-'}</small>
              </div>
            </div>

            <div className="ai-backtesting-card">
              <div className="ai-backtesting-head">
                <h3><Brain size={18} /> Courbe Backtesting IA</h3>
                <div className="ai-backtesting-actions">
                  <select value={aiMetricKey} onChange={(e) => setAiMetricKey(e.target.value)}>
                    <option value="stockout_f1">Stockout F1 (%)</option>
                    <option value="stockout_auc">Stockout AUC (%)</option>
                    <option value="consumption_mae">Conso MAE</option>
                    <option value="consumption_mape">Conso MAPE (%)</option>
                  </select>
                  <button className="export-btn ghost" onClick={loadData}>
                    <RefreshCw size={14} /> Refresh IA
                  </button>
                </div>
              </div>
              <div className="ai-bars">
                {backtestingSeries.rows.map((row) => (
                  <div className="ai-bar-col" key={`${row.label}-${row.value}`}>
                    <div className="ai-bar-value">{row.value}</div>
                    <div className="ai-bar-track">
                      <div
                        className="ai-bar-fill"
                        style={{ height: `${Math.max(6, (row.value / backtestingSeries.max) * 100)}%` }}
                        title={`${row.label}: ${row.value}`}
                      />
                    </div>
                    <div className="ai-bar-label">{row.label}</div>
                  </div>
                ))}
                {!backtestingSeries.rows.length && (
                  <div className="ai-empty-line">Aucune version IA disponible. Lance un entrainement.</div>
                )}
              </div>
              <div className="ai-backtesting-meta">
                <span>Test stockout: {aiBacktesting?.stockout_j7?.test_samples ?? 0} echantillons</span>
                <span>Test consommation: {aiBacktesting?.consumption_j14?.test_samples ?? 0} echantillons</span>
              </div>
            </div>

            <div className="historique-toolbar">
              <div className="toolbar-filters">
                <div className="filter-group">
                  <Filter size={16} />
                  <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="filter-select">
                    <option value="tous">{i18n.allOps}</option>
                    <option value="entree">{i18n.entries}</option>
                    <option value="sortie">{i18n.exits}</option>
                    <option value="validation">{i18n.validations}</option>
                  </select>
                </div>
                <div className="filter-group">
                  <User size={16} />
                  <select value={filterMagasinier} onChange={(e) => setFilterMagasinier(e.target.value)} className="filter-select">
                    <option value="tous">{i18n.allMag}</option>
                    {magasiniers.filter((m) => m !== 'tous').map((mag) => (
                      <option key={mag} value={mag}>{mag}</option>
                    ))}
                  </select>
                </div>
              </div>
              <button className="export-btn" onClick={handleExport}>
                <Download size={16} />
                {i18n.export}
              </button>
            </div>

            <div className="historique-table-container">
              <AppTable
                className="historique-table"
                headers={['Type', 'Produit', 'Quantite', 'Date', 'Magasinier', 'Responsable', 'Source / Destination', 'Pieces']}
              >
                {filteredHistorique.map((item, index) => (
                  <tr key={item.id} style={{ animationDelay: `${index * 20}ms` }}>
                    <td>
                      <span className={`type-badge ${getTypeClass(item.type)}`}>
                        {getTypeIcon(item.type)}
                        {item.typeLabel}
                      </span>
                    </td>
                    <td className="product-cell">
                      <Package size={16} />
                      <div>
                        <span className="product-name">{item.produit}</span>
                        <span className="product-code">{item.code}</span>
                      </div>
                    </td>
                    <td className="quantity-cell">
                      <span className={item.type === 'entree' ? 'qty-plus' : item.type === 'sortie' ? 'qty-minus' : ''}>
                        {item.type === 'entree' ? '+' : item.type === 'sortie' ? '-' : ''}
                        {item.quantite}
                      </span>
                    </td>
                    <td className="date-cell">
                      <Calendar size={14} />
                      {formatDate(item.date)}
                    </td>
                    <td className="user-cell mag">
                      <User size={14} />
                      {item.magasinier}
                    </td>
                    <td className="user-cell resp">
                      <User size={14} />
                      {item.responsable}
                    </td>
                    <td className="source-cell">{item.source}</td>
                    <td className="source-cell">
                      {item.attachments.length === 0 ? '-' : item.attachments.map((a, idx) => (
                        <div key={`${item.id}-att-${idx}`}>
                          <a href={a.file_url} target="_blank" rel="noreferrer">
                            <Paperclip size={12} /> {a.label || a.file_name || `Piece ${idx + 1}`}
                          </a>
                        </div>
                      ))}
                    </td>
                  </tr>
                ))}
              </AppTable>
            </div>

            <div className="historique-footer">
              <p>{filteredHistorique.length} {filteredHistorique.length > 1 ? i18n.ops : i18n.op}</p>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default HistoriqueResp;
