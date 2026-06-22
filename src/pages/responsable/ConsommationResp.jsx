// BLOC 1 - Role du fichier.
// Ce fichier affiche une page de l'espace responsable pour ConsommationResp.
// Point de vigilance: garder les props, appels API et classes CSS synchronises avec les ecrans existants.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { BarChart3, Bell, Package, RefreshCw, Search, TrendingUp, Users, Download, FileText, Zap } from 'lucide-react';
import SidebarResp from '../../components/responsable/SidebarResp';
import HeaderPage from '../../components/shared/HeaderPage';
import LoadingSpinner from '../../components/shared/LoadingSpinner';
import BeneficiairePanel from './BeneficiairePanel';
import { get } from '../../services/api';
import { useToast } from '../../components/shared/Toast';
import { getUiErrorMessage } from '../../services/uiError';
import './ConsommationResp.css';
import './BeneficiairePanel.css';

/* ─── helpers ────────────────────────────────────────────────── */
function isoToday() {
  return new Date().toISOString().slice(0, 10);
}
function isoDaysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}
function isoMonthStart() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}
function validIsoDate(v) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(v || ''))) return '';
  const d = new Date(`${v}T00:00:00`);
  return Number.isNaN(d.getTime()) ? '' : String(v);
}
function fmt(v) {
  if (!v) return '-';
  return new Date(v).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
function safeNum(v) { return Number(v) || 0; }

function computeStatus(row, avgProd, avgBenef) {
  const qty = safeNum(row.quantity);
  const pk = row.product_code || row.product_name;
  const bk = row.beneficiary;
  const pAvg = avgProd.get(pk) || 0;
  const bAvg = avgBenef.get(bk) || 0;
  const isChem = String(row.product_family || '').toLowerCase().includes('chim');
  if (qty >= Math.max(pAvg * 3, bAvg * 3.2, isChem ? 8 : 12)) return 'danger';
  if (qty >= Math.max(pAvg * 1.8, bAvg * 2, 5)) return 'warn';
  return 'ok';
}
function computeAvgMap(rows, keyFn) {
  const m = new Map();
  rows.forEach((r) => {
    const k = keyFn(r);
    if (!k) return;
    const p = m.get(k) || { s: 0, c: 0 };
    p.s += safeNum(r.quantity); p.c++;
    m.set(k, p);
  });
  const a = new Map();
  m.forEach((v, k) => a.set(k, v.c ? v.s / v.c : 0));
  return a;
}

const STATUS_LABEL = { ok: 'Normal', warn: 'Élevé', danger: 'À vérifier' };
const PAGE_SIZE = 15;

/* ─── Component ──────────────────────────────────────────────── */
export default function ConsommationResp({ userName, onLogout }) {
  const toast = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const initialFrom = validIsoDate(searchParams.get('from'));
  const initialTo = validIsoDate(searchParams.get('to'));
  const hasInitialRange = Boolean(initialFrom || initialTo);

  // filtres
  const [fromDate, setFromDate] = useState(() => initialFrom || isoDaysAgo(6));
  const [toDate, setToDate] = useState(() => initialTo || isoToday());
  const [quickMode, setQuickMode] = useState(() => (hasInitialRange ? '' : '7d'));
  const [searchQ, setSearchQ] = useState(() => String(searchParams.get('q') || ''));
  const [selDir, setSelDir] = useState('');
  const [selCat, setSelCat] = useState('');
  const [selStat, setSelStat] = useState('');

  // données
  const [allRows, setAllRows] = useState([]);
  const [loading, setLoading] = useState(false);

  // panneau bénéficiaire
  const [activeBeneficiary, setActiveBeneficiary] = useState(null);

  // export dropdown
  const [showExportMenu, setShowExportMenu] = useState(false);

  // pagination
  const [page, setPage] = useState(1);

  /* ── chargement ── */
  const loadData = useCallback(async (from, to) => {
    setLoading(true);
    try {
      const res = await get(`/responsable/consommation?from=${from}&to=${to}`);
      setAllRows(Array.isArray(res?.rows) ? res.rows : res?.data || []);
    } catch (err) {
      toast.error(getUiErrorMessage(err, 'Chargement des données échoué'));
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { loadData(fromDate, toDate); }, [fromDate, loadData, toDate]);

  /* ── quick range ── */
  function applyQuick(k) {
    setQuickMode(k);
    const now = isoToday();
    let from = now;
    if (k === 'today') from = now;
    else if (k === '7d') from = isoDaysAgo(6);
    else if (k === '30d') from = isoDaysAgo(29);
    else if (k === 'month') from = isoMonthStart();
    setFromDate(from);
    setToDate(now);
  }

  /* ── filtres ── */
  const filteredRows = useMemo(() => {
    const q = searchQ.trim().toLowerCase();
    const avgProd = computeAvgMap(allRows, (r) => r.product_code || r.product_name);
    const avgBenef = computeAvgMap(allRows, (r) => r.beneficiary);
    return allRows.filter((r) => {
      if (selDir && r.direction !== selDir) return false;
      if (selCat && r.product_category !== selCat) return false;
      if (selStat) { if (computeStatus(r, avgProd, avgBenef) !== selStat) return false; }
      if (!q) return true;
      return [r.beneficiary, r.direction, r.product_name, r.product_code].some(
        (v) => v && v.toLowerCase().includes(q),
      );
    });
  }, [allRows, searchQ, selDir, selCat, selStat]);

  /* ── KPIs ── */
  const kpis = useMemo(() => {
    const benefs = new Set(filteredRows.map((r) => r.beneficiary));
    const total = filteredRows.reduce((a, r) => a + safeNum(r.quantity), 0);
    const byProd = new Map();
    const byDir = new Map();
    filteredRows.forEach((r) => {
      const pk = r.product_name; byProd.set(pk, (byProd.get(pk) || 0) + safeNum(r.quantity));
      const dk = r.direction; if (dk) byDir.set(dk, (byDir.get(dk) || 0) + safeNum(r.quantity));
    });
    let topP = null, topPQ = 0;
    byProd.forEach((q, k) => { if (q > topPQ) { topPQ = q; topP = k; } });
    let topD = null, topDQ = 0;
    byDir.forEach((q, k) => { if (q > topDQ) { topDQ = q; topD = k; } });
    const avgProd = computeAvgMap(filteredRows, (r) => r.product_code || r.product_name);
    const avgBenef = computeAvgMap(filteredRows, (r) => r.beneficiary);
    const alerts = filteredRows.filter((r) => computeStatus(r, avgProd, avgBenef) !== 'ok').length;
    return { lines: filteredRows.length, benefs: benefs.size, total, topP, topPQ, topD, alerts };
  }, [filteredRows]);

  /* ── top bénéficiaires ── */
  const topBenefs = useMemo(() => {
    const m = new Map();
    filteredRows.forEach((r) => m.set(r.beneficiary, (m.get(r.beneficiary) || 0) + safeNum(r.quantity)));
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [filteredRows]);

  /* ── top produits ── */
  const topProds = useMemo(() => {
    const m = new Map();
    filteredRows.forEach((r) => {
      const k = r.product_name; m.set(k, (m.get(k) || 0) + safeNum(r.quantity));
    });
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [filteredRows]);

  /* ── options filtres ── */
  const dirOptions = useMemo(() => [...new Set(allRows.map((r) => r.direction).filter(Boolean))].sort(), [allRows]);
  const catOptions = useMemo(() => [...new Set(allRows.map((r) => r.product_category).filter(Boolean))].sort(), [allRows]);

  /* ── pagination ── */
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const pageRows = filteredRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const avgProd = useMemo(() => computeAvgMap(filteredRows, (r) => r.product_code || r.product_name), [filteredRows]);
  const avgBenef = useMemo(() => computeAvgMap(filteredRows, (r) => r.beneficiary), [filteredRows]);

  const allBeneficiaries = useMemo(() => [...new Set(allRows.map((r) => r.beneficiary).filter(Boolean))].sort(), [allRows]);

  /* ── export CSV ── */
  function exportCsv() {
    const hdr = 'Date,Bénéficiaire,Direction,Produit,Code,Catégorie,Quantité,Unité,Motif';
    const lines = filteredRows.map((r) =>
      [fmt(r.date_exit), r.beneficiary, r.direction, r.product_name, r.product_code, r.product_category, r.quantity, r.unit, r.motif || '']
        .map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','),
    );
    const blob = new Blob([[hdr, ...lines].join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `consommation_${fromDate}_${toDate}.csv`;
    a.click();
    setShowExportMenu(false);
  }

  /* ── export PDF (placeholder pour future intégration) ── */
  function exportPdf() {
    toast.info('Rapport PDF — Génération en cours...');
    // À implémenter avec jsPDF ou similaire
    setShowExportMenu(false);
  }

  const maxBar = topBenefs[0]?.[1] || 1;
  const maxProd = topProds[0]?.[1] || 1;

  return (
    <div className="admin-layout">
      <SidebarResp
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((p) => !p)}
        onLogout={onLogout}
        userName={userName}
      />

      {/* Overlay quand le panneau est ouvert */}
      {activeBeneficiary && (
        <div
          className="cons-panel-overlay"
          onClick={() => setActiveBeneficiary(null)}
          aria-hidden="true"
        />
      )}

      <div className={`admin-main ${sidebarCollapsed ? 'collapsed' : ''} ${activeBeneficiary ? 'panel-open' : ''}`}>
        <HeaderPage
          title="Consommation par bénéficiaire"
          subtitle="Suivi des sorties de stock par bénéficiaire, produit et direction."
          icon={<TrendingUp size={22} />}
          hideGlobalSearch={true}
        />

        {loading && <LoadingSpinner overlay text="Chargement..." />}

        <div className="resp-consumption">

          {/* ── Filtres dates ── */}
          <div className="cons-controls">
            <div className="cons-top-row">
              <div className="cons-date">
                <label>
                  <BarChart3 size={15} />
                  Date début
                  <input type="date" value={fromDate} onChange={(e) => { setFromDate(e.target.value); setQuickMode(''); }} />
                </label>
                <label>
                  Date fin
                  <input type="date" value={toDate} onChange={(e) => { setToDate(e.target.value); setQuickMode(''); }} />
                </label>
              </div>
              <div className="cons-quick">
                {[['today', "Aujourd'hui"], ['7d', '7 jours'], ['30d', '30 jours'], ['month', 'Mois en cours']].map(([k, lbl]) => (
                  <button key={k} className={`cons-pill ${quickMode === k ? 'active' : ''}`} onClick={() => applyQuick(k)}>{lbl}</button>
                ))}
              </div>
              <button
                className="cons-pill"
                onClick={() => loadData(fromDate, toDate)}
                disabled={loading}
              >
                <RefreshCw size={13} /> Actualiser
              </button>
            </div>

            <div className="cons-filter-row">
              <div className="cons-search-wrap">
                <Search size={14} className="cons-search-icon" />
                <input
                  className="cons-search"
                  placeholder="Rechercher un bénéficiaire ou un produit..."
                  value={searchQ}
                  onChange={(e) => { setSearchQ(e.target.value); setPage(1); }}
                />
              </div>
              <div className="cons-selects">
                <div className="cons-select">
                  <span>Direction</span>
                  <select value={selDir} onChange={(e) => { setSelDir(e.target.value); setPage(1); }}>
                    <option value="">Toutes</option>
                    {dirOptions.map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div className="cons-select">
                  <span>Catégorie</span>
                  <select value={selCat} onChange={(e) => { setSelCat(e.target.value); setPage(1); }}>
                    <option value="">Toutes</option>
                    {catOptions.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="cons-select">
                  <span>Statut</span>
                  <select value={selStat} onChange={(e) => { setSelStat(e.target.value); setPage(1); }}>
                    <option value="">Tous</option>
                    <option value="ok">Normal</option>
                    <option value="warn">Élevé</option>
                    <option value="danger">À vérifier</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* ── KPIs ── */}
          <div className="cons-kpis">
            {[
              { label: 'Lignes', value: kpis.lines, sub: 'sorties enregistrées', icon: BarChart3 },
              { label: 'Bénéficiaires', value: kpis.benefs, sub: 'personnes concernées', icon: Users },
              { label: 'Quantité totale', value: kpis.total, sub: 'articles sortis', icon: Package },
              { label: 'Top produit', value: kpis.topP || 'N/A', sub: kpis.topP ? kpis.topPQ + ' unités' : 'Aucun', icon: TrendingUp },
              { label: 'Alertes', value: kpis.alerts, sub: 'lignes à surveiller', icon: Bell, alert: kpis.alerts > 0 },
            ].map(({ label, value, sub, icon: Icon, alert }, i) => (
              <div key={label} className={`cons-kpi ${alert ? 'cons-kpi-alert' : ''}`} style={{ '--i': i + 1 }}>
                <div className="cons-kpi-head">
                  <div className={`cons-kpi-icon ${alert ? 'danger' : ''}`}><Icon size={15} /></div>
                  <span>{label}</span>
                </div>
                <div className="cons-kpi-value">{value}</div>
                <div className="cons-kpi-note">{sub}</div>
              </div>
            ))}
          </div>

          {/* ── Résumé ── */}
          <div className="cons-summary">
            <div className="cons-summary-head">
              <span className="cons-summary-title"><TrendingUp size={15} /> Résumé de la période</span>
              <span className="cons-summary-meta">{fmt(fromDate)} au {fmt(toDate)}</span>
            </div>
            <div className={`cons-summary-body ${!filteredRows.length ? 'empty' : ''}`}>
              {filteredRows.length
                ? <>
                    <strong>{kpis.benefs}</strong> bénéficiaire{kpis.benefs !== 1 ? 's' : ''} ont consommé{' '}
                    <strong>{kpis.total}</strong> article{kpis.total !== 1 ? 's' : ''}. Produit le plus demandé&nbsp;:{' '}
                    <strong>{kpis.topP || '-'}</strong>.{' '}
                    {kpis.alerts > 0 && <span className="cons-alert-inline">⚠ {kpis.alerts} ligne{kpis.alerts > 1 ? 's' : ''} à surveiller.</span>}
                    {' '}Direction la plus active : <strong>{kpis.topD || '-'}</strong>.
                  </>
                : <em>Aucune consommation enregistrée sur cette période.</em>}
            </div>
          </div>

          {/* ── Graphiques ── */}
          <div className="cons-charts">
            {/* Top bénéficiaires */}
            <div className="cons-chart-card">
              <div className="cons-chart-head">
                <h3><Users size={14} /> Top bénéficiaires <span>Cliquez pour voir le profil</span></h3>
              </div>
              <div className="cons-bars">
                {topBenefs.length
                  ? topBenefs.map(([name, qty]) => (
                      <button
                        key={name}
                        type="button"
                        className={`cons-bar-row ${activeBeneficiary === name ? 'active' : ''}`}
                        onClick={() => setActiveBeneficiary(name === activeBeneficiary ? null : name)}
                      >
                        <span className="cons-bar-label">{name.split(' ')[0]}</span>
                        <span className="cons-bar-track"><span className="cons-bar-fill" style={{ width: `${Math.round((qty / maxBar) * 100)}%` }} /></span>
                        <span className="cons-bar-value">{qty}</span>
                      </button>
                    ))
                  : <div className="cons-empty-mini">Aucune donnée</div>}
              </div>
            </div>

            {/* Top produits */}
            <div className="cons-chart-card">
              <div className="cons-chart-head">
                <h3><Package size={14} /> Top produits <span>Les plus sortis</span></h3>
              </div>
              <div className="cons-bars">
                {topProds.length
                  ? topProds.map(([name, qty]) => (
                      <button
                        key={name}
                        type="button"
                        className="cons-bar-row"
                        onClick={() => setSearchQ(name)}
                      >
                        <span className="cons-bar-label" title={name}>{name}</span>
                        <span className="cons-bar-track"><span className="cons-bar-fill" style={{ width: `${Math.round((qty / maxProd) * 100)}%` }} /></span>
                        <span className="cons-bar-value">{qty}</span>
                      </button>
                    ))
                  : <div className="cons-empty-mini">Aucune donnée</div>}
              </div>
            </div>

            {/* Bénéficiaires actifs */}
            <div className="cons-chart-card">
              <div className="cons-chart-head">
                <h3><Users size={14} /> Bénéficiaires actifs <span>Voir profil →</span></h3>
              </div>
              <div className="cons-bars">
                {allBeneficiaries.slice(0, 8).map((name) => {
                  const count = allRows.filter((r) => r.beneficiary === name).length;
                  return (
                    <button
                      key={name}
                      type="button"
                      className={`cons-bar-row ${activeBeneficiary === name ? 'active' : ''}`}
                      onClick={() => setActiveBeneficiary(name === activeBeneficiary ? null : name)}
                    >
                      <span className="cons-bar-label">{name.split(' ')[0]}</span>
                      <span className="cons-bar-track"><span className="cons-bar-fill" style={{ width: `${Math.round((count / Math.max(...allBeneficiaries.map((b) => allRows.filter((r) => r.beneficiary === b).length), 1)) * 100)}%`, background: '#8b5cf6' }} /></span>
                      <span className="cons-bar-value">{count}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* ── Tableau ── */}
          <div className="cons-table-wrap">
            <div className="cons-table-head">
              <div className="cons-table-title">
                <strong>Tableau détaillé</strong>
                <span>{filteredRows.length} ligne{filteredRows.length !== 1 ? 's' : ''}</span>
              </div>
              <div className="cons-export-group">
                <div className="cons-export-menu-wrap" style={{ position: 'relative' }}>
                  <button 
                    className="cons-link"
                    onClick={() => setShowExportMenu(!showExportMenu)}
                  >
                    <Download size={13} /> Exporter ▾
                  </button>
                  {showExportMenu && (
                    <div className="cons-export-dropdown">
                      <button onClick={exportCsv} className="cons-export-option">
                        <FileText size={12} /> Exporter CSV
                      </button>
                      <button onClick={exportPdf} className="cons-export-option">
                        <FileText size={12} /> Rapport PDF
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {pageRows.length ? (
              <table className="cons-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Bénéficiaire</th>
                    <th>Direction</th>
                    <th>Produit</th>
                    <th>Catégorie</th>
                    <th className="num">Qté</th>
                    <th>Statut</th>
                    <th className="actions">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((r, i) => {
                    const s = computeStatus(r, avgProd, avgBenef);
                    return (
                      <tr key={r.id || i}>
                        <td className="nowrap">{fmt(r.date_exit)}</td>
                        <td>
                          <button
                            type="button"
                            className="cons-benef-link"
                            onClick={() => setActiveBeneficiary(r.beneficiary === activeBeneficiary ? null : r.beneficiary)}
                          >
                            {r.beneficiary}
                          </button>
                        </td>
                        <td style={{ fontSize: 12 }}>{r.direction}</td>
                        <td>
                          <div className="cons-product-cell">
                            <span className="cons-product-code">{r.product_code}</span>
                            <span className="cons-product-name">{r.product_name}</span>
                          </div>
                        </td>
                        <td style={{ fontSize: 12 }}>{r.product_category}</td>
                        <td className="num">{r.quantity}</td>
                        <td>
                          <span className={`cons-status ${s}`}>
                            {s === 'ok' ? '✓' : '⚠'} {STATUS_LABEL[s]}
                          </span>
                        </td>
                        <td className="actions">
                          <button
                            className="cons-action"
                            type="button"
                            onClick={() => setActiveBeneficiary(r.beneficiary === activeBeneficiary ? null : r.beneficiary)}
                          >
                            Profil
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <div className="empty-state">
                <h4>Aucune donnée</h4>
                <p>Aucune consommation trouvée pour les filtres sélectionnés.</p>
              </div>
            )}

            <div className="cons-pagination">
              <button className="cons-pager" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Précédent</button>
              <span className="cons-page-indicator">Page {page} / {totalPages}</span>
              <button className="cons-pager" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Suivant</button>
            </div>
          </div>

          {/* ── Assistant IA (call-to-action floattant) ── */}
          {!filteredRows.length && (
            <div className="cons-ai-prompt" onClick={() => navigate('/responsable/assistant')}>
              <Zap size={16} />
              <div>
                <strong>Anomalie détectée ?</strong>
                <p>Laissez l'IA analyser l'historique de ce produit</p>
              </div>
              <span className="cons-ai-arrow">→</span>
            </div>
          )}

        </div>
      </div>

      {/* ── Panneau bénéficiaire ── */}
      {activeBeneficiary && (
        <BeneficiairePanel
          beneficiaryName={activeBeneficiary}
          allRows={allRows}
          allBeneficiaries={allBeneficiaries}
          onClose={() => setActiveBeneficiary(null)}
        />
      )}
    </div>
  );
}