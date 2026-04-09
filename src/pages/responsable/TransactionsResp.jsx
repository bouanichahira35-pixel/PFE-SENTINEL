import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  History,
  Download,
  Filter,
  Package,
  ArrowDownToLine,
  ArrowUpFromLine,
  User,
  Calendar,
  MessageSquareText,
} from 'lucide-react';
import SidebarResp from '../../components/responsable/SidebarResp';
import HeaderPage from '../../components/shared/HeaderPage';
import ProtectedPage from '../../components/shared/ProtectedPage';
import LoadingSpinner from '../../components/shared/LoadingSpinner';
import { useToast } from '../../components/shared/Toast';
import { get } from '../../services/api';
import useIsMobile from '../../hooks/useIsMobile';
import './TransactionsResp.css';

function formatDate(value) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString('fr-FR');
}

const TransactionsResp = ({ userName, onLogout }) => {
  const toast = useToast();
  const isMobile = useIsMobile(640);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => (typeof window !== 'undefined' ? window.innerWidth <= 768 : false));
  const [isLoading, setIsLoading] = useState(false);
  const [items, setItems] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('tous');

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
        [...entryRows, ...exitRows].sort((a, b) => new Date(b.dateRaw || 0) - new Date(a.dateRaw || 0))
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

  const filtered = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return items.filter((item) => {
      const matchesSearch = !q
        || item.produit.toLowerCase().includes(q)
        || item.code.toLowerCase().includes(q)
        || item.magasinier.toLowerCase().includes(q);
      const matchesType = filterType === 'tous' || item.type === filterType;
      return matchesSearch && matchesType;
    });
  }, [items, searchQuery, filterType]);

  const handleExport = () => {
    if (!filtered.length) {
      toast.warning('Aucune transaction a exporter');
      return;
    }

    const header = ['Type', 'Produit', 'Code', 'Quantite', 'Date', 'Magasinier', 'Source_Destination'];
    const escapeCsv = (v) => {
      const s = String(v ?? '');
      if (s.includes('"') || s.includes(';') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };
    const lines = [
      header.join(';'),
      ...filtered.map((item) => ([
        item.typeLabel,
        item.produit,
        item.code,
        item.quantite,
        formatDate(item.dateRaw),
        item.magasinier,
        item.source,
      ].map(escapeCsv).join(';'))),
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
              <div className="tx-banner">
                <div className="tx-banner-info">
                  <MessageSquareText size={18} />
                  <div>
                    <strong>Flux décisionnel</strong>
                    <div className="tx-banner-sub">Accéder aux discussions et événements (optionnel).</div>
                  </div>
                </div>
                <Link to="/responsable/flux" className="tx-btn secondary">
                  Ouvrir le flux
                </Link>
              </div>
              <div className="tx-toolbar">
                <div className="tx-filter">
                  <Filter size={16} />
                  <select value={filterType} onChange={(e) => setFilterType(e.target.value)}>
                    <option value="tous">Toutes</option>
                    <option value="entree">Entrees</option>
                    <option value="sortie">Sorties</option>
                  </select>
                </div>
                <button className="tx-btn" onClick={handleExport}>
                  <Download size={15} />
                  Export CSV
                </button>
              </div>

              <div className="tx-card">
                <div className="tx-card-head">
                  <h3><History size={18} /> Historique des transactions</h3>
                  <span>{filtered.length} ligne(s)</span>
                </div>
                {isMobile ? (
                  <>
                    {!filtered.length ? (
                      <div className="tx-empty" style={{ padding: '1rem' }}>Aucune transaction trouvee.</div>
                    ) : (
                      <div className="mobile-card-list">
                        {filtered.map((item) => (
                          <div key={item.id} className="mobile-card">
                            <div className="mobile-card-header">
                              <div>
                                <h3 className="mobile-card-title">{item.produit}</h3>
                                <div className="mobile-card-subtitle">{item.code}</div>
                              </div>
                              <span className={`type-pill ${item.type}`}>
                                {item.type === 'entree' ? <ArrowDownToLine size={13} /> : <ArrowUpFromLine size={13} />}
                                {item.typeLabel}
                              </span>
                            </div>

                            <div className="mobile-card-grid">
                              <div className="mobile-kv">
                                <div className="mobile-kv-label">Quantite</div>
                                <div className="mobile-kv-value">{item.quantite}</div>
                              </div>
                              <div className="mobile-kv">
                                <div className="mobile-kv-label">Date</div>
                                <div className="mobile-kv-value">{formatDate(item.dateRaw)}</div>
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
                          <th>Type</th>
                          <th>Produit</th>
                          <th>Quantite</th>
                          <th>Date</th>
                          <th>Magasinier</th>
                          <th>Source / Destination</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.map((item) => (
                          <tr key={item.id}>
                            <td>
                              <span className={`type-pill ${item.type}`}>
                                {item.type === 'entree' ? <ArrowDownToLine size={13} /> : <ArrowUpFromLine size={13} />}
                                {item.typeLabel}
                              </span>
                            </td>
                            <td>
                              <div className="product-cell">
                                <Package size={14} />
                                <div>
                                  <strong>{item.produit}</strong>
                                  <small>{item.code}</small>
                                </div>
                              </div>
                            </td>
                            <td>{item.quantite}</td>
                            <td>
                              <span className="meta-inline"><Calendar size={13} /> {formatDate(item.dateRaw)}</span>
                            </td>
                            <td>
                              <span className="meta-inline"><User size={13} /> {item.magasinier || userName || '-'}</span>
                            </td>
                            <td>{item.source}</td>
                          </tr>
                        ))}
                        {!filtered.length && (
                          <tr>
                            <td colSpan={6} className="tx-empty">Aucune transaction trouvee.</td>
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
    </ProtectedPage>
  );
};

export default TransactionsResp;
