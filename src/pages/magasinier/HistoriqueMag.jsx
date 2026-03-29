import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Package,
  Calendar,
  User,
  Filter,
  Paperclip,
  Download,
  History,
} from 'lucide-react';
import SidebarMag from '../../components/magasinier/SidebarMag';
import HeaderPage from '../../components/shared/HeaderPage';
import LoadingSpinner from '../../components/shared/LoadingSpinner';
import { useToast } from '../../components/shared/Toast';
import { get } from '../../services/api';
import { useUiLanguage } from '../../utils/uiLanguage';
import useIsMobile from '../../hooks/useIsMobile';
import './HistoriqueMag.css';

function formatDate(value) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString('fr-FR');
}

const HistoriqueMag = ({ userName, onLogout }) => {
  const lang = useUiLanguage();
  const toast = useToast();
  const isMobile = useIsMobile(640);

  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => (typeof window !== 'undefined' ? window.innerWidth <= 768 : false));
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('tous');
  const [isLoading, setIsLoading] = useState(false);
  const [items, setItems] = useState([]);

  const i18n = {
    fr: {
      title: 'Historique',
      fail: 'Chargement historique echoue',
      allOps: 'Toutes les operations',
      entries: 'Entrees',
      exits: 'Sorties',
      productAdds: 'Ajout produit',
      addLabel: 'Ajout produit',
      updateLabel: 'Maj produit',
      export: 'Export CSV',
      noData: 'Aucune donnee a exporter',
      noRows: 'Aucune operation',
      tableTitle: 'Historique des transactions',
      lines: 'ligne(s)',
    },
    en: {
      title: 'History',
      fail: 'Failed to load history',
      allOps: 'All operations',
      entries: 'Entries',
      exits: 'Exits',
      productAdds: 'Product add',
      addLabel: 'Product add',
      updateLabel: 'Product update',
      export: 'Export CSV',
      noData: 'No data to export',
      noRows: 'No operation',
      tableTitle: 'Transaction history',
      lines: 'line(s)',
    },
    ar: {
      title: 'History',
      fail: 'Failed to load history',
      allOps: 'All operations',
      entries: 'Entries',
      exits: 'Exits',
      productAdds: 'Product add',
      addLabel: 'Product add',
      updateLabel: 'Product update',
      export: 'Export CSV',
      noData: 'No data to export',
      noRows: 'No operation',
      tableTitle: 'Transaction history',
      lines: 'line(s)',
    },
  }[lang];

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [entriesRes, exitsRes, historyRes] = await Promise.allSettled([
        get('/stock/entries'),
        get('/stock/exits'),
        get('/history'),
      ]);

      const entries = entriesRes.status === 'fulfilled' && Array.isArray(entriesRes.value) ? entriesRes.value : [];
      const exits = exitsRes.status === 'fulfilled' && Array.isArray(exitsRes.value) ? exitsRes.value : [];
      const historyResponse = historyRes.status === 'fulfilled' ? historyRes.value : [];
      const history = Array.isArray(historyResponse)
        ? historyResponse
        : Array.isArray(historyResponse?.items)
          ? historyResponse.items
          : [];

      const entryRows = entries.map((e) => ({
        id: `entry-${e._id}`,
        type: 'entree',
        typeLabel: i18n.entries,
        produit: e.product?.name || '-',
        code: e.product?.code_product || '-',
        quantite: Number(e.quantity || 0),
        date: e.date_entry || e.createdAt,
        magasinier: e.magasinier?.username || '-',
        source: e.supplier || e.service_requester || e.delivery_note_number || '-',
        attachments: Array.isArray(e.attachments) ? e.attachments : [],
      }));

      const exitRows = exits.map((x) => ({
        id: `exit-${x._id}`,
        type: 'sortie',
        typeLabel: i18n.exits,
        produit: x.product?.name || '-',
        code: x.product?.code_product || '-',
        quantite: Number(x.quantity || 0),
        date: x.date_exit || x.createdAt,
        magasinier: x.magasinier?.username || '-',
        source: x.direction_laboratory || x.beneficiary || x.withdrawal_paper_number || '-',
        attachments: Array.isArray(x.attachments) ? x.attachments : [],
      }));

      const productRows = history
        .filter((h) => ['product_create', 'product_update'].includes(h.action_type))
        .map((h) => ({
          id: `${h.action_type}-${h._id}`,
          type: 'ajout',
          typeLabel: h.action_type === 'product_create' ? i18n.addLabel : i18n.updateLabel,
          produit: h.product?.name || '-',
          code: h.product?.code_product || '-',
          quantite: Number(h.quantity || 0),
          date: h.date_action || h.createdAt,
          magasinier: h.user?.username || '-',
          source: h.description || '-',
          attachments: [],
        }));

      setItems(
        [...entryRows, ...exitRows, ...productRows].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))
      );
    } catch (err) {
      toast.error(err.message || i18n.fail);
    } finally {
      setIsLoading(false);
    }
  }, [toast, i18n.entries, i18n.exits, i18n.addLabel, i18n.updateLabel, i18n.fail]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filteredHistorique = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return items.filter((item) => {
      const matchSearch = !q
        || item.produit.toLowerCase().includes(q)
        || item.code.toLowerCase().includes(q)
        || item.magasinier.toLowerCase().includes(q)
        || String(item.source || '').toLowerCase().includes(q);
      const matchType = filterType === 'tous' || item.type === filterType;
      return matchSearch && matchType;
    });
  }, [items, searchQuery, filterType]);

  const getTypeIcon = (type) => {
    if (type === 'entree') return <ArrowDownToLine size={13} />;
    if (type === 'sortie') return <ArrowUpFromLine size={13} />;
    return <Package size={13} />;
  };

  const getTypeClass = (type) => {
    if (type === 'entree') return 'entree';
    if (type === 'sortie') return 'sortie';
    return 'ajout';
  };

  const handleExport = () => {
    if (!filteredHistorique.length) {
      toast.warning(i18n.noData);
      return;
    }

    const header = ['Type', 'Produit', 'Code', 'Quantite', 'Date', 'Magasinier', 'Source_Destination', 'Pieces'];
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
        item.source,
        item.attachments?.length || 0,
      ].map(escapeCsv).join(';'))),
    ];

    const blob = new Blob([`\uFEFF${lines.join('\n')}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `historique_magasinier_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

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
          onMenuClick={() => setSidebarCollapsed((prev) => !prev)}
        />

        <main className="main-content">
          {isLoading && <LoadingSpinner overlay text="Chargement..." />}

          <div className="hm-page">
            <div className="hm-toolbar">
              <div className="hm-filter">
                <Filter size={16} />
                <select value={filterType} onChange={(e) => setFilterType(e.target.value)}>
                  <option value="tous">{i18n.allOps}</option>
                  <option value="entree">{i18n.entries}</option>
                  <option value="sortie">{i18n.exits}</option>
                  <option value="ajout">{i18n.productAdds}</option>
                </select>
              </div>
              <button className="hm-btn" onClick={handleExport}>
                <Download size={15} />
                {i18n.export}
              </button>
            </div>

            <div className="hm-card">
              <div className="hm-card-head">
                <h3><History size={18} /> {i18n.tableTitle}</h3>
                <span>{filteredHistorique.length} {i18n.lines}</span>
              </div>

              {isMobile ? (
                <>
                  {!filteredHistorique.length ? (
                    <div className="hm-empty" style={{ padding: '1rem' }}>{i18n.noRows}</div>
                  ) : (
                    <div className="mobile-card-list">
                      {filteredHistorique.map((item) => (
                        <div key={item.id} className="mobile-card">
                          <div className="mobile-card-header">
                            <div>
                              <h3 className="mobile-card-title">{item.produit}</h3>
                              <div className="mobile-card-subtitle">{item.code}</div>
                            </div>
                            <span className={`hm-type-pill ${getTypeClass(item.type)}`}>
                              {getTypeIcon(item.type)} {item.typeLabel}
                            </span>
                          </div>

                          <div className="mobile-card-grid">
                            <div className="mobile-kv">
                              <div className="mobile-kv-label">Quantite</div>
                              <div className="mobile-kv-value">{item.quantite}</div>
                            </div>
                            <div className="mobile-kv">
                              <div className="mobile-kv-label">Date</div>
                              <div className="mobile-kv-value">{formatDate(item.date)}</div>
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

                          {item.attachments.length > 0 && (
                            <div style={{ marginTop: 10 }}>
                              <div className="mobile-kv-label">Pieces</div>
                              <div style={{ marginTop: 6 }} className="hm-piece-list">
                                {item.attachments.slice(0, 3).map((a, idx) => (
                                  <a key={`${item.id}-att-m-${idx}`} href={a.file_url} target="_blank" rel="noreferrer">
                                    <Paperclip size={12} /> {a.label || a.file_name || `Piece ${idx + 1}`}
                                  </a>
                                ))}
                                {item.attachments.length > 3 && (
                                  <span className="hm-no-piece">+{item.attachments.length - 3} piece(s)</span>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div className="hm-table-wrap">
                  <table className="hm-table">
                    <thead>
                      <tr>
                        <th>Type</th>
                        <th>Produit</th>
                        <th>Quantite</th>
                        <th>Date</th>
                        <th>Magasinier</th>
                        <th>Source / Destination</th>
                        <th>Pieces</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredHistorique.map((item) => (
                        <tr key={item.id}>
                          <td>
                            <span className={`hm-type-pill ${getTypeClass(item.type)}`}>
                              {getTypeIcon(item.type)}
                              {item.typeLabel}
                            </span>
                          </td>
                          <td>
                            <div className="hm-product-cell">
                              <Package size={14} />
                              <div>
                                <strong>{item.produit}</strong>
                                <small>{item.code}</small>
                              </div>
                            </div>
                          </td>
                          <td>{item.quantite}</td>
                          <td>
                            <span className="hm-meta-inline"><Calendar size={13} /> {formatDate(item.date)}</span>
                          </td>
                          <td>
                            <span className="hm-meta-inline"><User size={13} /> {item.magasinier || userName || '-'}</span>
                          </td>
                          <td>{item.source}</td>
                          <td>
                            {item.attachments.length === 0 ? (
                              <span className="hm-no-piece">-</span>
                            ) : (
                              <div className="hm-piece-list">
                                {item.attachments.map((a, idx) => (
                                  <a key={`${item.id}-att-${idx}`} href={a.file_url} target="_blank" rel="noreferrer">
                                    <Paperclip size={12} /> {a.label || a.file_name || `Piece ${idx + 1}`}
                                  </a>
                                ))}
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                      {!filteredHistorique.length && (
                        <tr>
                          <td colSpan={7} className="hm-empty">{i18n.noRows}</td>
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

export default HistoriqueMag;
