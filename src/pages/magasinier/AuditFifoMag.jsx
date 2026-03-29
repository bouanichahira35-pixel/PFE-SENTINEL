import { useEffect, useMemo, useState } from 'react'; 
import { AlertTriangle, CheckCircle2, Clock3, Filter, Info, QrCode, ShieldCheck, XCircle } from 'lucide-react'; 
import { useNavigate } from 'react-router-dom';
import SidebarMag from '../../components/magasinier/SidebarMag'; 
import HeaderPage from '../../components/shared/HeaderPage'; 
import AppTable from '../../components/shared/AppTable'; 
import { useToast } from '../../components/shared/Toast';
import { get } from '../../services/api';
import './AuditFifoMag.css';

function isoDate(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

function humanDate(value) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString('fr-FR');
}

const AuditFifoMag = ({ userName, onLogout }) => { 
  const navigate = useNavigate();
  const toast = useToast(); 
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => (typeof window !== 'undefined' ? window.innerWidth <= 768 : false));

  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);

  const [fromDate, setFromDate] = useState(isoDate(firstDay));
  const [toDate, setToDate] = useState(isoDate(today));
  const [resultFilter, setResultFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [kpis, setKpis] = useState(null);
  const [auditRows, setAuditRows] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let ignore = false;

    const load = async () => {
      setIsLoading(true);
      try {
        const params = `from=${encodeURIComponent(fromDate)}&to=${encodeURIComponent(toDate)}`;
        const [kpiRes, auditRes] = await Promise.all([
          get(`/stock/fifo/kpis?${params}`),
          get(`/stock/fifo/audit?${params}&limit=180`),
        ]);

        if (ignore) return;
        setKpis(kpiRes || null);
        setAuditRows(Array.isArray(auditRes?.items) ? auditRes.items : []);
      } catch (err) {
        if (!ignore) toast.error(err.message || 'Chargement audit FIFO echoue');
      } finally {
        if (!ignore) setIsLoading(false);
      }
    };

    load();
    return () => {
      ignore = true;
    };
  }, [fromDate, toDate, toast]);

  const filteredRows = useMemo(() => {
    return auditRows.filter((row) => {
      const byResult = resultFilter === 'all' || row.result === resultFilter;
      const byStatus = statusFilter === 'all' || row.status === statusFilter;
      return byResult && byStatus;
    });
  }, [auditRows, resultFilter, statusFilter]);

  const cards = [
    {
      key: 'attempts',
      icon: QrCode,
      label: 'Tentatives scan FIFO',
      value: Number(kpis?.fifo_scan?.attempts || 0),
      tone: 'info',
    },
    {
      key: 'blocked',
      icon: ShieldCheck,
      label: 'Erreurs bloquees',
      value: Number(kpis?.fifo_scan?.avoided_errors_count || 0),
      tone: 'warning',
    },
    {
      key: 'rate',
      icon: AlertTriangle,
      label: 'Taux erreurs evitees',
      value: `${Number(kpis?.fifo_scan?.avoided_error_rate_pct || 0)}%`,
      tone: 'danger',
    },
    {
      key: 'scan_adoption',
      icon: CheckCircle2,
      label: 'Adoption scan',
      value: `${Number(kpis?.performance?.scan_adoption_pct || 0)}%`,
      tone: 'success',
    },
  ];

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
          title="Audit FIFO & Performance"
          showSearch={false}
          onMenuClick={() => setSidebarCollapsed((prev) => !prev)}
        />

        <main className="main-content"> 
          <div className="fifo-audit-page"> 
            <section className="fifo-purpose">
              <div className="fifo-purpose-head">
                <Info size={16} />
                <strong>Cette page sert a controler la discipline FIFO et la qualite des scans QR.</strong>
              </div>
              <p>
                Tu vois ici les erreurs bloquees, le taux d'adoption du scan et le detail des audits.
                Objectif: reduire les erreurs de sortie et prouver la performance du magasinier.
              </p>
              <div className="fifo-purpose-actions">
                <button type="button" className="fifo-purpose-btn" onClick={() => navigate('/magasinier/entree-stock')}>
                  Faire une entree test
                </button>
                <button type="button" className="fifo-purpose-btn" onClick={() => navigate('/magasinier/sortie-stock')}>
                  Faire une sortie test
                </button>
              </div>
            </section>

            <section className="fifo-kpi-grid"> 
              {cards.map((card) => {
                const Icon = card.icon;
                return (
                  <article key={card.key} className={`fifo-kpi-card ${card.tone}`}>
                    <div className="fifo-kpi-icon"><Icon size={18} /></div>
                    <div className="fifo-kpi-label">{card.label}</div>
                    <div className="fifo-kpi-value">{card.value}</div>
                  </article>
                );
              })}
            </section>

            <section className="fifo-time-cards">
              <article className="fifo-time-card">
                <Clock3 size={16} />
                <span>Temps moyen manuel</span>
                <strong>{Number(kpis?.performance?.avg_form_time_manual_sec || 0)} s</strong>
              </article>
              <article className="fifo-time-card">
                <Clock3 size={16} />
                <span>Temps moyen scan</span>
                <strong>{Number(kpis?.performance?.avg_form_time_scan_sec || 0)} s</strong>
              </article>
              <article className="fifo-time-card">
                <CheckCircle2 size={16} />
                <span>Sorties FIFO QR</span>
                <strong>{Number(kpis?.exits?.modes?.fifo_qr || 0)}</strong>
              </article>
              <article className="fifo-time-card">
                <QrCode size={16} />
                <span>Bons internes QR</span>
                <strong>{Number(kpis?.exits?.modes?.internal_bond || 0)}</strong>
              </article>
            </section>

            <section className="fifo-toolbar">
              <div className="fifo-date-range">
                <label htmlFor="fifo-from">Du</label>
                <input id="fifo-from" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
                <label htmlFor="fifo-to">Au</label>
                <input id="fifo-to" type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
              </div>
              <div className="fifo-filters">
                <Filter size={16} />
                <select value={resultFilter} onChange={(e) => setResultFilter(e.target.value)}>
                  <option value="all">Tous resultats</option>
                  <option value="match">Match</option>
                  <option value="mismatch">Mismatch bloque</option>
                  <option value="no_lot">No lot bloque</option>
                </select>
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                  <option value="all">Tous statuts</option>
                  <option value="accepted">Acceptes</option>
                  <option value="blocked">Bloques</option>
                </select>
              </div>
            </section>

            <section className="fifo-table-wrap"> 
              <AppTable headers={['Date', 'Produit', 'Scan', 'Attendu', 'Resultat', 'Statut', 'Utilisateur', 'Sortie']}> 
                {filteredRows.map((row) => { 
                  const resultLabel = row.result === 'match'
                    ? 'Match'
                    : row.result === 'mismatch'
                      ? 'Mismatch'
                      : 'No lot';
                  const statusLabel = row.status === 'accepted' ? 'Accepte' : 'Bloque';
                  return (
                    <tr key={row._id}>
                      <td>{humanDate(row.createdAt)}</td>
                      <td>
                        <div className="fifo-product-cell">
                          <span>{row.product?.name || '-'}</span>
                          <small>{row.product?.code_product || '-'}</small>
                        </div>
                      </td>
                      <td className="fifo-token-cell">{row.scanned_qr || '-'}</td>
                      <td className="fifo-token-cell">{row.expected_qr || '-'}</td>
                      <td>
                        <span className={`fifo-pill result-${row.result || 'unknown'}`}>
                          {row.result === 'match' && <CheckCircle2 size={12} />}
                          {row.result === 'mismatch' && <XCircle size={12} />}
                          {row.result === 'no_lot' && <AlertTriangle size={12} />}
                          {resultLabel}
                        </span>
                      </td>
                      <td>
                        <span className={`fifo-pill status-${row.status || 'unknown'}`}>
                          {statusLabel}
                        </span>
                      </td>
                      <td>{row.user?.username || '-'}</td>
                      <td>{row.stock_exit?.exit_number || '-'}</td>
                    </tr>
                  );
                })} 
              </AppTable> 
              {!isLoading && filteredRows.length === 0 && (
                <div className="fifo-empty">
                  Aucune ligne audit FIFO sur cette periode. Lance quelques entrees/sorties pour voir les resultats.
                </div>
              )}
            </section> 

            <footer className="fifo-footer"> 
              {isLoading ? 'Chargement...' : `${filteredRows.length} ligne(s) audit FIFO`}
            </footer>
          </div>
        </main>
      </div>
    </div>
  );
};

export default AuditFifoMag;
