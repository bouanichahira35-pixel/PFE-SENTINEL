import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  History,
  Download,
  Package,
  ArrowDownToLine,
  ArrowUpFromLine,
  User,
  Calendar,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  X,
  RotateCcw,
  Search,
  TrendingUp,
  TrendingDown,
  BarChart3,
  Layers,
  ChevronLeft,
  ChevronRight,
  SlidersHorizontal,
} from 'lucide-react';
import SidebarResp from '../../components/responsable/SidebarResp';
import HeaderPage from '../../components/shared/HeaderPage';
import ProtectedPage from '../../components/shared/ProtectedPage';
import LoadingSpinner from '../../components/shared/LoadingSpinner';
import { useToast } from '../../components/shared/Toast';
import { get } from '../../services/api';
import useIsMobile from '../../hooks/useIsMobile';
import { useLocation } from 'react-router-dom';
import './TransactionsResp.css';

function formatDate(value) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString('fr-FR');
}

function formatDateShort(value) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('fr-FR');
}

const PAGE_SIZE = 25;

const TransactionsResp = ({ userName, onLogout }) => {
  const toast = useToast();
  const isMobile = useIsMobile(640);
  const location = useLocation();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth <= 768 : false
  );
  const [isLoading, setIsLoading] = useState(false);
  const [items, setItems] = useState([]);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('tous');
  const [filterMagasinier, setFilterMagasinier] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [filterMinQty, setFilterMinQty] = useState('');
  const [filterMaxQty, setFilterMaxQty] = useState('');
  const [showExpandedFilters, setShowExpandedFilters] = useState(false);

  // Sort
  const [sortKey, setSortKey] = useState('dateRaw');
  const [sortDir, setSortDir] = useState('desc');

  // Pagination
  const [page, setPage] = useState(1);

  useEffect(() => {
    const params = new URLSearchParams(location.search || '');
    const q = String(params.get('q') || '').trim();
    const type = String(params.get('type') || '').trim().toLowerCase();
    if (q) setSearchQuery(q);
    if (type === 'sortie' || type === 'entree' || type === 'tous') setFilterType(type);
  }, [location.search]);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [entries, exits] = await Promise.all([
        get('/stock/entries').catch(() => []),
        get('/stock/exits').catch(() => []),
      ]);

      const entryRows = (Array.isArray(entries) ? entries : []).map((e) => ({
        id: `entry-${e._id}`,
        type: 'entree',
        typeLabel: 'Entree',
        produit: e.product?.name || '-',
        code: e.product?.code_product || '-',
        quantite: Number(e.quantity || 0),
        dateRaw: e.date_entry || e.createdAt,
        magasinier: e.magasinier?.username || '-',
        source: e.supplier || e.service_requester || e.delivery_note_number || '-',
      }));

      const exitRows = (Array.isArray(exits) ? exits : []).map((x) => ({
        id: `exit-${x._id}`,
        type: 'sortie',
        typeLabel: 'Sortie',
        produit: x.product?.name || '-',
        code: x.product?.code_product || '-',
        quantite: Number(x.quantity || 0),
        dateRaw: x.date_exit || x.createdAt,
        magasinier: x.magasinier?.username || '-',
        source: x.direction_laboratory || x.beneficiary || x.withdrawal_paper_number || '-',
      }));

      setItems(
        [...entryRows, ...exitRows].sort(
          (a, b) => new Date(b.dateRaw || 0) - new Date(a.dateRaw || 0)
        )
      );
    } catch (err) {
      toast.error(err.message || 'Erreur chargement transactions');
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Unique magasiniers for dropdown
  const magasiniers = useMemo(() => {
    const set = new Set(items.map((i) => i.magasinier).filter((m) => m && m !== '-'));
    return Array.from(set).sort();
  }, [items]);

  // Filtered items
  const filtered = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    const dateFrom = filterDateFrom ? new Date(filterDateFrom) : null;
    const dateTo = filterDateTo ? new Date(filterDateTo + 'T23:59:59') : null;
    const minQty = filterMinQty !== '' ? Number(filterMinQty) : null;
    const maxQty = filterMaxQty !== '' ? Number(filterMaxQty) : null;

    return items.filter((item) => {
      if (filterType !== 'tous' && item.type !== filterType) return false;
      if (filterMagasinier && item.magasinier !== filterMagasinier) return false;
      if (q &&
        !item.produit.toLowerCase().includes(q) &&
        !item.code.toLowerCase().includes(q) &&
        !item.magasinier.toLowerCase().includes(q) &&
        !String(item.source || '').toLowerCase().includes(q)
      ) return false;
      if (dateFrom) {
        const d = new Date(item.dateRaw || 0);
        if (d < dateFrom) return false;
      }
      if (dateTo) {
        const d = new Date(item.dateRaw || 0);
        if (d > dateTo) return false;
      }
      if (minQty !== null && item.quantite < minQty) return false;
      if (maxQty !== null && item.quantite > maxQty) return false;
      return true;
    });
  }, [items, searchQuery, filterType, filterMagasinier, filterDateFrom, filterDateTo, filterMinQty, filterMaxQty]);

  // Sorted
  const sorted = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const va = a[sortKey];
      const vb = b[sortKey];
      if (sortKey === 'dateRaw') {
        return dir * (new Date(va || 0) - new Date(vb || 0));
      }
      if (sortKey === 'quantite') return dir * (va - vb);
      return dir * String(va).localeCompare(String(vb));
    });
  }, [filtered, sortKey, sortDir]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const paginated = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return sorted.slice(start, start + PAGE_SIZE);
  }, [sorted, page]);

  // Reset page when filters change
  useEffect(() => { setPage(1); }, [searchQuery, filterType, filterMagasinier, filterDateFrom, filterDateTo, filterMinQty, filterMaxQty]);

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const SortIcon = ({ col }) => {
    if (sortKey !== col) return <span className="tx-sort-icon"><ChevronsUpDown size={12} /></span>;
    return <span className="tx-sort-icon">{sortDir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />}</span>;
  };

  const resetFilters = () => {
    setSearchQuery('');
    setFilterType('tous');
    setFilterMagasinier('');
    setFilterDateFrom('');
    setFilterDateTo('');
    setFilterMinQty('');
    setFilterMaxQty('');
  };

  const activeFilterCount = [
    filterType !== 'tous',
    !!filterMagasinier,
    !!filterDateFrom,
    !!filterDateTo,
    filterMinQty !== '',
    filterMaxQty !== '',
    !!searchQuery,
  ].filter(Boolean).length;

  const handleExport = () => {
    if (!filtered.length) { toast.warning('Aucune transaction a exporter'); return; }
    const header = ['Type', 'Produit', 'Code', 'Quantite', 'Date', 'Magasinier', 'Source_Destination'];
    const esc = (v) => {
      const s = String(v ?? '');
      return s.includes('"') || s.includes(';') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [
      header.join(';'),
      ...filtered.map((item) =>
        [item.typeLabel, item.produit, item.code, item.quantite, formatDate(item.dateRaw), item.magasinier, item.source]
          .map(esc).join(';')
      ),
    ];
    const blob = new Blob([`\uFEFF${lines.join('\n')}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transactions_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  // Stats
  const stats = useMemo(() => {
    const total = filtered.length;
    const entrees = filtered.filter((i) => i.type === 'entree').length;
    const sorties = filtered.filter((i) => i.type === 'sortie').length;
    const totalQty = filtered.reduce((s, i) => s + i.quantite, 0);
    return { total, entrees, sorties, totalQty };
  }, [filtered]);

  // Active filter chips
  const activeChips = [];
  if (filterType !== 'tous') activeChips.push({ label: filterType === 'entree' ? 'Entrees' : 'Sorties', clear: () => setFilterType('tous') });
  if (filterMagasinier) activeChips.push({ label: `Magasinier: ${filterMagasinier}`, clear: () => setFilterMagasinier('') });
  if (filterDateFrom) activeChips.push({ label: `Depuis: ${filterDateFrom}`, clear: () => setFilterDateFrom('') });
  if (filterDateTo) activeChips.push({ label: `Jusqu'à: ${filterDateTo}`, clear: () => setFilterDateTo('') });
  if (filterMinQty !== '') activeChips.push({ label: `Qté ≥ ${filterMinQty}`, clear: () => setFilterMinQty('') });
  if (filterMaxQty !== '') activeChips.push({ label: `Qté ≤ ${filterMaxQty}`, clear: () => setFilterMaxQty('') });
  if (searchQuery) activeChips.push({ label: `"${searchQuery}"`, clear: () => setSearchQuery('') });

  const pageNums = () => {
    const nums = [];
    const delta = 2;
    for (let i = Math.max(1, page - delta); i <= Math.min(totalPages, page + delta); i++) nums.push(i);
    return nums;
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
            title="Transactions"
            searchValue={searchQuery}
            onSearchChange={setSearchQuery}
            onMenuClick={() => setSidebarCollapsed((prev) => !prev)}
          />
          <main className="main-content">
            {isLoading && <LoadingSpinner overlay text="Chargement..." />}

            <div className="tx-page">

              {/* ── Stats row ── */}
              <div className="tx-stats-row">
                <div className="tx-stat-card">
                  <div className="tx-stat-icon all"><Layers size={20} /></div>
                  <div>
                    <div className="tx-stat-label">Total</div>
                    <div className="tx-stat-value">{stats.total.toLocaleString('fr-FR')}</div>
                  </div>
                </div>
                <div className="tx-stat-card">
                  <div className="tx-stat-icon in"><TrendingDown size={20} /></div>
                  <div>
                    <div className="tx-stat-label">Entrees</div>
                    <div className="tx-stat-value">{stats.entrees.toLocaleString('fr-FR')}</div>
                  </div>
                </div>
                <div className="tx-stat-card">
                  <div className="tx-stat-icon out"><TrendingUp size={20} /></div>
                  <div>
                    <div className="tx-stat-label">Sorties</div>
                    <div className="tx-stat-value">{stats.sorties.toLocaleString('fr-FR')}</div>
                  </div>
                </div>
                <div className="tx-stat-card">
                  <div className="tx-stat-icon qty"><BarChart3 size={20} /></div>
                  <div>
                    <div className="tx-stat-label">Qté totale</div>
                    <div className="tx-stat-value">{stats.totalQty.toLocaleString('fr-FR')}</div>
                  </div>
                </div>
              </div>

              {/* ── Filters panel ── */}
              <div className="tx-filters-panel">
                <div className="tx-filters-top">
                  {/* Type tabs */}
                  <div className="tx-type-tabs">
                    {['tous', 'entree', 'sortie'].map((t) => (
                      <button
                        key={t}
                        className={`tx-tab ${filterType === t ? `active ${t}` : ''}`}
                        onClick={() => setFilterType(t)}
                      >
                        {t === 'tous' ? 'Toutes' : t === 'entree' ? 'Entrees' : 'Sorties'}
                      </button>
                    ))}
                  </div>

                  {/* Search */}
                  <div className="tx-filter-group" style={{ flex: 1, minWidth: 160, maxWidth: 280 }}>
                    <div style={{ position: 'relative' }}>
                      <Search size={14} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--tx-text3)', pointerEvents: 'none' }} />
                      <input
                        className="tx-filter-input"
                        style={{ paddingLeft: '2rem', width: '100%', boxSizing: 'border-box' }}
                        placeholder="Produit, code, magasinier…"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="tx-spacer" />

                  {/* More filters toggle */}
                  <button
                    className={`tx-btn ghost`}
                    onClick={() => setShowExpandedFilters((v) => !v)}
                  >
                    <SlidersHorizontal size={14} />
                    Filtres avancés
                    {activeFilterCount > 0 && (
                      <span style={{
                        background: 'var(--tx-accent)',
                        color: '#fff',
                        borderRadius: '999px',
                        fontSize: '0.65rem',
                        fontWeight: 800,
                        padding: '0.08rem 0.38rem',
                        marginLeft: 2,
                      }}>{activeFilterCount}</span>
                    )}
                  </button>

                  {activeFilterCount > 0 && (
                    <button className="tx-btn danger" onClick={resetFilters}>
                      <RotateCcw size={13} />
                      Réinitialiser
                    </button>
                  )}

                  <button className="tx-btn primary" onClick={handleExport}>
                    <Download size={14} />
                    Export CSV
                  </button>
                </div>

                {/* Expanded filters */}
                {showExpandedFilters && (
                  <div className="tx-filters-expanded">
                    <div className="tx-filter-group">
                      <label>Magasinier</label>
                      <select
                        className="tx-filter-select"
                        value={filterMagasinier}
                        onChange={(e) => setFilterMagasinier(e.target.value)}
                      >
                        <option value="">Tous</option>
                        {magasiniers.map((m) => <option key={m} value={m}>{m}</option>)}
                      </select>
                    </div>

                    <div className="tx-filter-group">
                      <label>Date début</label>
                      <input
                        type="date"
                        className="tx-filter-input"
                        value={filterDateFrom}
                        onChange={(e) => setFilterDateFrom(e.target.value)}
                      />
                    </div>

                    <div className="tx-filter-group">
                      <label>Date fin</label>
                      <input
                        type="date"
                        className="tx-filter-input"
                        value={filterDateTo}
                        onChange={(e) => setFilterDateTo(e.target.value)}
                      />
                    </div>

                    <div className="tx-filter-group">
                      <label>Qté min</label>
                      <input
                        type="number"
                        min="0"
                        className="tx-filter-input"
                        placeholder="0"
                        value={filterMinQty}
                        onChange={(e) => setFilterMinQty(e.target.value)}
                      />
                    </div>

                    <div className="tx-filter-group">
                      <label>Qté max</label>
                      <input
                        type="number"
                        min="0"
                        className="tx-filter-input"
                        placeholder="∞"
                        value={filterMaxQty}
                        onChange={(e) => setFilterMaxQty(e.target.value)}
                      />
                    </div>
                  </div>
                )}

                {/* Active chips */}
                {activeChips.length > 0 && (
                  <div className="tx-active-filters">
                    {activeChips.map((chip, i) => (
                      <span key={i} className="tx-chip">
                        {chip.label}
                        <button onClick={chip.clear}><X size={11} /></button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* ── Table card ── */}
              <div className="tx-card">
                <div className="tx-card-head">
                  <h3>
                    <History size={18} />
                    Historique des transactions
                  </h3>
                  <span className="tx-count-badge">
                    {filtered.length.toLocaleString('fr-FR')} ligne{filtered.length !== 1 ? 's' : ''}
                  </span>
                </div>

                {isMobile ? (
                  <>
                    {!paginated.length ? (
                      <div className="tx-empty-state">
                        <div className="tx-empty-icon"><History size={26} /></div>
                        <h4>Aucune transaction trouvée</h4>
                        <p>Essayez de modifier vos filtres de recherche.</p>
                      </div>
                    ) : (
                      <div className="mobile-card-list">
                        {paginated.map((item) => (
                          <div key={item.id} className="mobile-card">
                            <div className="mobile-card-header">
                              <div>
                                <h3 className="mobile-card-title">{item.produit}</h3>
                                <div className="mobile-card-subtitle">{item.code}</div>
                              </div>
                              <span className={`type-pill ${item.type}`}>
                                {item.type === 'entree' ? <ArrowDownToLine size={12} /> : <ArrowUpFromLine size={12} />}
                                {item.typeLabel}
                              </span>
                            </div>
                            <div className="mobile-card-grid">
                              <div className="mobile-kv">
                                <div className="mobile-kv-label">Quantité</div>
                                <div className="mobile-kv-value">{item.quantite}</div>
                              </div>
                              <div className="mobile-kv">
                                <div className="mobile-kv-label">Date</div>
                                <div className="mobile-kv-value">{formatDateShort(item.dateRaw)}</div>
                              </div>
                              <div className="mobile-kv">
                                <div className="mobile-kv-label">Magasinier</div>
                                <div className="mobile-kv-value">{item.magasinier || userName || '-'}</div>
                              </div>
                              <div className="mobile-kv">
                                <div className="mobile-kv-label">Source</div>
                                <div className="mobile-kv-value">{item.source}</div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="tx-table-wrap">
                    <table className="tx-table">
                      <thead>
                        <tr>
                          <th onClick={() => handleSort('type')} className={sortKey === 'type' ? 'sorted' : ''}>
                            Type <SortIcon col="type" />
                          </th>
                          <th onClick={() => handleSort('produit')} className={sortKey === 'produit' ? 'sorted' : ''}>
                            Produit <SortIcon col="produit" />
                          </th>
                          <th onClick={() => handleSort('quantite')} className={sortKey === 'quantite' ? 'sorted' : ''}>
                            Quantité <SortIcon col="quantite" />
                          </th>
                          <th onClick={() => handleSort('dateRaw')} className={sortKey === 'dateRaw' ? 'sorted' : ''}>
                            Date <SortIcon col="dateRaw" />
                          </th>
                          <th onClick={() => handleSort('magasinier')} className={sortKey === 'magasinier' ? 'sorted' : ''}>
                            Magasinier <SortIcon col="magasinier" />
                          </th>
                          <th onClick={() => handleSort('source')} className={sortKey === 'source' ? 'sorted' : ''}>
                            Source / Destination <SortIcon col="source" />
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {paginated.map((item) => (
                          <tr key={item.id}>
                            <td>
                              <span className={`type-pill ${item.type}`}>
                                {item.type === 'entree' ? <ArrowDownToLine size={12} /> : <ArrowUpFromLine size={12} />}
                                {item.typeLabel}
                              </span>
                            </td>
                            <td>
                              <div className="product-cell">
                                <div className="product-icon-wrap">
                                  <Package size={14} />
                                </div>
                                <div>
                                  <strong>{item.produit}</strong>
                                  <small>{item.code}</small>
                                </div>
                              </div>
                            </td>
                            <td>
                              <span className="qty-badge">{item.quantite.toLocaleString('fr-FR')}</span>
                            </td>
                            <td>
                              <span className="meta-inline">
                                <Calendar size={13} />
                                {formatDate(item.dateRaw)}
                              </span>
                            </td>
                            <td>
                              <span className="meta-inline">
                                <User size={13} />
                                {item.magasinier || userName || '-'}
                              </span>
                            </td>
                            <td style={{ color: 'var(--tx-text2)' }}>{item.source}</td>
                          </tr>
                        ))}
                        {!paginated.length && (
                          <tr>
                            <td colSpan={6}>
                              <div className="tx-empty-state">
                                <div className="tx-empty-icon"><History size={26} /></div>
                                <h4>Aucune transaction trouvée</h4>
                                <p>Essayez de modifier vos filtres de recherche.</p>
                              </div>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="tx-pagination">
                    <span className="tx-page-info">
                      {((page - 1) * PAGE_SIZE + 1).toLocaleString('fr-FR')}–{Math.min(page * PAGE_SIZE, filtered.length).toLocaleString('fr-FR')} sur {filtered.length.toLocaleString('fr-FR')}
                    </span>
                    <div className="tx-page-btns">
                      <button
                        className="tx-page-btn"
                        onClick={() => setPage(1)}
                        disabled={page === 1}
                        title="Première page"
                      >
                        <ChevronLeft size={13} />
                        <ChevronLeft size={13} style={{ marginLeft: -7 }} />
                      </button>
                      <button
                        className="tx-page-btn"
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={page === 1}
                      >
                        <ChevronLeft size={13} />
                      </button>
                      {pageNums().map((n) => (
                        <button
                          key={n}
                          className={`tx-page-btn ${page === n ? 'active' : ''}`}
                          onClick={() => setPage(n)}
                        >
                          {n}
                        </button>
                      ))}
                      <button
                        className="tx-page-btn"
                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                        disabled={page === totalPages}
                      >
                        <ChevronRight size={13} />
                      </button>
                      <button
                        className="tx-page-btn"
                        onClick={() => setPage(totalPages)}
                        disabled={page === totalPages}
                        title="Dernière page"
                      >
                        <ChevronRight size={13} />
                        <ChevronRight size={13} style={{ marginLeft: -7 }} />
                      </button>
                    </div>
                  </div>
                )}
              </div>

            </div>
          </main>
        </div>
      </div>
    </ProtectedPage>
  );
};

export default TransactionsResp;
