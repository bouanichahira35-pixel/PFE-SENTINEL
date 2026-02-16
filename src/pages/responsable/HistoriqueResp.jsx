import { useEffect, useMemo, useState } from 'react';
import { ArrowDownToLine, ArrowUpFromLine, Package, Calendar, User, Filter, Download, FileText, Paperclip } from 'lucide-react';
import SidebarResp from '../../components/responsable/SidebarResp';
import HeaderPage from '../../components/shared/HeaderPage';
import { useToast } from '../../components/shared/Toast';
import { get } from '../../services/api';
import './HistoriqueResp.css';

function formatDate(value) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString('fr-FR');
}

const HistoriqueResp = ({ userName, onLogout }) => {
  const toast = useToast();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('tous');
  const [filterMagasinier, setFilterMagasinier] = useState('tous');
  const [items, setItems] = useState([]);

  useEffect(() => {
    let ignore = false;
    const loadData = async () => {
      try {
        const [entries, exits, history] = await Promise.all([get('/stock/entries'), get('/stock/exits'), get('/history')]);
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
          .filter((h) => h.action_type === 'validation')
          .map((h) => ({
            id: `validation-${h._id}`,
            type: 'validation',
            typeLabel: 'Validation',
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
      } catch (err) {
        toast.error(err.message || 'Chargement historique echoue');
      }
    };
    loadData();
    return () => {
      ignore = true;
    };
  }, [toast, userName]);

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
      toast.warning('Aucune donnee a exporter');
      return;
    }

    const header = [
      'Type',
      'Produit',
      'Code',
      'Quantite',
      'Date',
      'Magasinier',
      'Responsable',
      'Source_Destination',
    ];

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
        <HeaderPage userName={userName} title="Historique Global" searchValue={searchQuery} onSearchChange={setSearchQuery} />

        <main className="main-content">
          <div className="historique-resp-page">
            <div className="historique-toolbar">
              <div className="toolbar-filters">
                <div className="filter-group">
                  <Filter size={16} />
                  <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="filter-select">
                    <option value="tous">Toutes les operations</option>
                    <option value="entree">Entrees</option>
                    <option value="sortie">Sorties</option>
                    <option value="validation">Validations</option>
                  </select>
                </div>
                <div className="filter-group">
                  <User size={16} />
                  <select value={filterMagasinier} onChange={(e) => setFilterMagasinier(e.target.value)} className="filter-select">
                    <option value="tous">Tous les magasiniers</option>
                    {magasiniers.filter((m) => m !== 'tous').map((mag) => (
                      <option key={mag} value={mag}>
                        {mag}
                      </option>
                    ))}
                  </select>
                </div>
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
                    <th>Responsable</th>
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

export default HistoriqueResp;
