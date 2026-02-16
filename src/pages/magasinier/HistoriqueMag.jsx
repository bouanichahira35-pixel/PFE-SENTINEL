import { useEffect, useMemo, useState } from 'react';
import { ArrowDownToLine, ArrowUpFromLine, Package, Calendar, User, Filter, Paperclip, Download } from 'lucide-react';
import SidebarMag from '../../components/magasinier/SidebarMag';
import HeaderPage from '../../components/shared/HeaderPage';
import { useToast } from '../../components/shared/Toast';
import { get } from '../../services/api';
import './HistoriqueMag.css';

function formatDate(value) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString('fr-FR');
}

const HistoriqueMag = ({ userName, onLogout }) => {
  const toast = useToast();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('tous');
  const [items, setItems] = useState([]);

  useEffect(() => {
    let ignore = false;

    const loadData = async () => {
      try {
        const [entries, exits] = await Promise.all([get('/stock/entries'), get('/stock/exits')]);
        if (ignore) return;

        const entryRows = entries.map((e) => ({
          id: `entry-${e._id}`,
          type: 'entree',
          typeLabel: 'Entree',
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
          typeLabel: 'Sortie',
          produit: x.product?.name || '-',
          code: x.product?.code_product || '-',
          quantite: Number(x.quantity || 0),
          date: x.date_exit || x.createdAt,
          magasinier: x.magasinier?.username || '-',
          source: x.direction_laboratory || x.beneficiary || x.withdrawal_paper_number || '-',
          attachments: Array.isArray(x.attachments) ? x.attachments : [],
        }));

        const merged = [...entryRows, ...exitRows].sort((a, b) => new Date(b.date) - new Date(a.date));
        setItems(merged);
      } catch (err) {
        toast.error(err.message || 'Chargement historique echoue');
      }
    };

    loadData();
    return () => {
      ignore = true;
    };
  }, [toast]);

  const filteredHistorique = useMemo(() => {
    return items.filter((item) => {
      const q = searchQuery.toLowerCase();
      const matchSearch =
        item.produit.toLowerCase().includes(q) ||
        item.code.toLowerCase().includes(q) ||
        item.magasinier.toLowerCase().includes(q);
      const matchType = filterType === 'tous' || item.type === filterType;
      return matchSearch && matchType;
    });
  }, [items, searchQuery, filterType]);

  const getTypeIcon = (type) => {
    if (type === 'entree') return <ArrowDownToLine size={16} />;
    if (type === 'sortie') return <ArrowUpFromLine size={16} />;
    return <Package size={16} />;
  };

  const getTypeClass = (type) => {
    if (type === 'entree') return 'type-entree';
    if (type === 'sortie') return 'type-sortie';
    return 'type-ajout';
  };

  const handleExport = () => {
    if (!filteredHistorique.length) {
      toast.warning('Aucune donnee a exporter');
      return;
    }

    const header = ['Type', 'Produit', 'Code', 'Quantite', 'Date', 'Magasinier', 'Source_Destination'];
    const escapeCsv = (v) => {
      const s = String(v ?? '');
      if (s.includes('"') || s.includes(';') || s.includes('\n')) {
        return `"${s.replace(/"/g, '""')}"`;
      }
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
      <SidebarMag
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        onLogout={onLogout}
        userName={userName}
      />

      <div className="main-container">
        <HeaderPage userName={userName} title="Historique" searchValue={searchQuery} onSearchChange={setSearchQuery} />

        <main className="main-content">
          <div className="historique-page">
            <div className="historique-toolbar">
              <div className="filter-group">
                <Filter size={16} />
                <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="filter-select">
                  <option value="tous">Toutes les operations</option>
                  <option value="entree">Entrees</option>
                  <option value="sortie">Sorties</option>
                </select>
              </div>
              <button className="export-btn" onClick={handleExport}>
                <Download size={16} />
                Exporter
              </button>
            </div>

            <div className="historique-table-container">
              <table className="historique-table">
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
                        <span className={item.type === 'entree' ? 'qty-plus' : 'qty-minus'}>
                          {item.type === 'entree' ? '+' : '-'}
                          {item.quantite}
                        </span>
                      </td>
                      <td className="date-cell">
                        <Calendar size={14} />
                        {formatDate(item.date)}
                      </td>
                      <td className="user-cell">
                        <User size={14} />
                        {item.magasinier}
                      </td>
                      <td className="source-cell">{item.source}</td>
                      <td className="source-cell">
                        {item.attachments.length === 0 ? (
                          '-'
                        ) : (
                          item.attachments.map((a, idx) => (
                            <div key={`${item.id}-att-${idx}`}>
                              <a href={a.file_url} target="_blank" rel="noreferrer">
                                <Paperclip size={12} /> {a.label || a.file_name || `Piece ${idx + 1}`}
                              </a>
                            </div>
                          ))
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="historique-footer">
              <p>{filteredHistorique.length} operation{filteredHistorique.length > 1 ? 's' : ''}</p>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default HistoriqueMag;
