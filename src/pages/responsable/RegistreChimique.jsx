import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, FlaskConical, RefreshCw, Search, X } from 'lucide-react';
import SidebarResp from '../../components/responsable/SidebarResp';
import HeaderPage from '../../components/shared/HeaderPage';
import ProtectedPage from '../../components/shared/ProtectedPage';
import LoadingSpinner from '../../components/shared/LoadingSpinner';
import { useToast } from '../../components/shared/Toast';
import { API_BASE, get } from '../../services/api';
import {
  CHEMICAL_CLASS_OPTIONS,
  FDS_FILTER_OPTIONS,
  PHYSICAL_STATE_OPTIONS,
  computeChemicalRegisterSignals,
} from '../../utils/chemicalRegister';
import './RegistreChimique.css';

function pad2(n) {
  return String(Math.max(0, Math.floor(Number(n || 0)))).padStart(2, '0');
}

function formatMonthLabel(year, month) {
  const d = new Date(Number(year || 2026), Math.max(0, Number(month || 1) - 1), 1);
  if (Number.isNaN(d.getTime())) return `${month}/${year}`;
  return d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
}

function formatDateLabel(value) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function resolveAbsoluteUrl(path) {
  if (!path) return '';
  if (/^https?:\/\//i.test(path)) return path;
  const origin = String(API_BASE || '').replace(/\/api\/?$/, '');
  return `${origin}${String(path).startsWith('/') ? '' : '/'}${path}`;
}

function getAccessToken() {
  return sessionStorage.getItem('token') || localStorage.getItem('token') || '';
}

async function tryRefreshAccessToken() {
  const res = await fetch(`${API_BASE}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.token) return '';
  sessionStorage.setItem('token', data.token);
  localStorage.removeItem('token');
  return String(data.token || '');
}

async function fetchProtectedBlob(fileUrl) {
  const absolute = resolveAbsoluteUrl(fileUrl);
  if (!absolute) throw new Error('Fichier introuvable');

  const doFetch = async (token) =>
    fetch(absolute, {
      method: 'GET',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      credentials: 'include',
    });

  let token = getAccessToken();
  let res = await doFetch(token);
  if (res.status === 401) {
    const refreshed = await tryRefreshAccessToken();
    if (refreshed) {
      token = refreshed;
      res = await doFetch(token);
    }
  }

  if (!res.ok) throw new Error('Impossible d’ouvrir la FDS');
  const blob = await res.blob();
  return blob;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || 'document';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function openBlobInNewTab(blob) {
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener,noreferrer');
  setTimeout(() => URL.revokeObjectURL(url), 8000);
}

function toCsvValue(v) {
  const raw = v == null ? '' : String(v);
  const escaped = raw.replace(/"/g, '""');
  return `"${escaped}"`;
}

function buildCsv(rows, { year, month } = {}) {
  const header = [
    'Code produit',
    'Produit',
    'Classe chimique',
    'État physique',
    'Quantité disponible',
    'Unité',
    'Emplacement',
    'Fournisseur',
    'FDS',
    'Dernier mouvement',
    'Statut',
  ];

  const lines = [header.map(toCsvValue).join(',')];

  (rows || []).forEach((row) => {
    const sig = computeChemicalRegisterSignals(row);
    const fdsLabel = sig.hasFds ? 'Disponible' : 'Manquante';
    lines.push(
      [
        row?.code_product || '-',
        row?.designation || '-',
        sig.chemicalClass,
        sig.physicalState,
        Number(row?.quantite_restante || 0),
        row?.unite || '-',
        row?.emplacement || '-',
        row?.fournisseur || '-',
        fdsLabel,
        formatDateLabel(row?.last_movement_at),
        sig.status,
      ].map(toCsvValue).join(',')
    );
  });

  const fileName = `registre_chimique_${year}_${pad2(month)}.csv`;
  return { csv: lines.join('\n'), fileName };
}

function AnimatedKpi({ value }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const next = Math.max(0, Math.floor(Number(value || 0)));
    if (!Number.isFinite(next)) return;
    let raf = 0;
    const started = performance.now();
    const from = shown;
    const duration = 420;
    const tick = (now) => {
      const t = Math.min(1, (now - started) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const v = Math.round(from + (next - from) * eased);
      setShown(v);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return <span className="rc-kpi-value">{shown}</span>;
}

export default function RegistreChimique({ userName, onLogout }) {
  const toast = useToast();

  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => (typeof window !== 'undefined' ? window.innerWidth <= 768 : false));
  const [isLoading, setIsLoading] = useState(false);

  const now = useMemo(() => new Date(), []);
  const [year, setYear] = useState(() => now.getFullYear());
  const [month, setMonth] = useState(() => now.getMonth() + 1);

  const [filterChemicalClass, setFilterChemicalClass] = useState('Tous');
  const [filterPhysicalState, setFilterPhysicalState] = useState('Tous');
  const [filterFds, setFilterFds] = useState('Tous');
  const [filterEmplacement, setFilterEmplacement] = useState('');
  const [search, setSearch] = useState('');

  const [rows, setRows] = useState([]);
  const [detailRow, setDetailRow] = useState(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await get(`/reports/chemical-register?year=${encodeURIComponent(year)}&month=${encodeURIComponent(month)}`);
      setRows(Array.isArray(data?.rows) ? data.rows : []);
    } catch (err) {
      setRows([]);
      toast.error(err?.message || 'Impossible de charger le registre chimique. Veuillez réessayer.');
    } finally {
      setIsLoading(false);
    }
  }, [month, toast, year]);

  useEffect(() => {
    load();
  }, [load]);

  const prepared = useMemo(() => (
    (rows || []).map((r) => ({ ...r, _sig: computeChemicalRegisterSignals(r) }))
  ), [rows]);

  const filtered = useMemo(() => {
    const q = String(search || '').trim().toLowerCase();
    const emp = String(filterEmplacement || '').trim().toLowerCase();

    return prepared.filter((row) => {
      const sig = row._sig || computeChemicalRegisterSignals(row);

      if (filterChemicalClass !== 'Tous' && sig.chemicalClass !== filterChemicalClass) return false;
      if (filterPhysicalState !== 'Tous' && sig.physicalState !== filterPhysicalState) return false;
      if (filterFds === 'Disponible' && !sig.hasFds) return false;
      if (filterFds === 'Manquante' && sig.hasFds) return false;

      if (emp) {
        const v = String(row?.emplacement || '').toLowerCase();
        if (!v.includes(emp)) return false;
      }

      if (q) {
        const hay = `${row?.code_product || ''} ${row?.designation || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }

      return true;
    });
  }, [filterChemicalClass, filterEmplacement, filterFds, filterPhysicalState, prepared, search]);

  const kpis = useMemo(() => {
    const sigs = filtered.map((r) => r._sig || computeChemicalRegisterSignals(r));
    const total = filtered.length;
    const fdsOk = sigs.filter((s) => s.hasFds).length;
    const fdsMissing = total - fdsOk;
    const toWatch = sigs.filter((s) => s.status === 'À surveiller' || s.status === 'Sensible').length;
    return { total, fdsOk, fdsMissing, toWatch };
  }, [filtered]);

  const points = useMemo(() => {
    const sigs = filtered.map((r) => r._sig || computeChemicalRegisterSignals(r));
    const withoutFds = sigs.filter((s) => s.missingFds).length;
    const withoutClass = sigs.filter((s) => s.missingClass).length;
    const sensitive = sigs.filter((s) => s.sensitive).length;
    const expiringLots = filtered.reduce((acc, r) => acc + Math.max(0, Math.floor(Number(r?.lots_expiring_30d || 0))), 0);
    return { withoutFds, withoutClass, sensitive, expiringLots };
  }, [filtered]);

  const handleExport = useCallback(() => {
    if (!filtered.length) {
      toast.warning('Aucune ligne à exporter.');
      return;
    }
    const { csv, fileName } = buildCsv(filtered, { year, month });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    downloadBlob(blob, fileName);
  }, [filtered, month, toast, year]);

  const handleOpenFds = useCallback(async (row, mode) => {
    const fileUrl = row?.fds?.file_url;
    if (!fileUrl) {
      toast.warning('FDS manquante.');
      return;
    }
    try {
      const blob = await fetchProtectedBlob(fileUrl);
      if (mode === 'download') {
        const name = row?.fds?.file_name || `FDS_${row?.code_product || 'produit'}.pdf`;
        downloadBlob(blob, name);
      } else {
        openBlobInNewTab(blob);
      }
    } catch (err) {
      toast.error(err?.message || 'Impossible d’ouvrir la FDS');
    }
  }, [toast]);

  return (
    <ProtectedPage userName={userName}>
      <div className="app-layout">
        <div className={`sidebar-backdrop ${sidebarCollapsed ? 'hidden' : ''}`} onClick={() => setSidebarCollapsed(true)} />
        <SidebarResp collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed((p) => !p)} onLogout={onLogout} userName={userName} />

        <div className="main-container">
          <HeaderPage
            userName={userName}
            title="Registre chimique"
            showSearch={false}
            onRefresh={load}
            onMenuClick={() => setSidebarCollapsed((p) => !p)}
          />

          <main className="main-content">
            {isLoading && <LoadingSpinner overlay text="Chargement..." />}

            <div className="rc-page">
              <div className="rc-hero">
                <div className="rc-hero-left">
                  <div className="rc-hero-title">
                    <FlaskConical size={18} />
                    <strong>Registre chimique</strong>
                    <span className="rc-period">{formatMonthLabel(year, month)}</span>
                  </div>
                  <div className="rc-hero-sub">
                    Suivi des produits chimiques, des quantités stockées et des fiches de sécurité.
                  </div>
                </div>
                <div className="rc-hero-actions">
                  <button type="button" className="btn btn-secondary btn-sm" onClick={load} disabled={isLoading}>
                    <RefreshCw size={14} /> Actualiser
                  </button>
                  <button type="button" className="btn btn-primary btn-sm" onClick={handleExport} disabled={isLoading}>
                    <Download size={14} /> Exporter registre
                  </button>
                </div>
              </div>

              <section className="rc-filters" aria-label="Filtres">
                <div className="rc-filter-row">
                  <label className="rc-filter">
                    <span>Année</span>
                    <input
                      type="number"
                      min="2020"
                      max="2100"
                      value={year}
                      onChange={(e) => setYear(Math.max(2020, Math.min(2100, Number(e.target.value || now.getFullYear()))))}
                    />
                  </label>
                  <label className="rc-filter">
                    <span>Mois</span>
                    <select value={month} onChange={(e) => setMonth(Number(e.target.value || now.getMonth() + 1))}>
                      {Array.from({ length: 12 }).map((_, idx) => (
                        <option key={idx + 1} value={idx + 1}>{pad2(idx + 1)}</option>
                      ))}
                    </select>
                  </label>
                  <label className="rc-filter">
                    <span>Classe chimique</span>
                    <select value={filterChemicalClass} onChange={(e) => setFilterChemicalClass(e.target.value)}>
                      {CHEMICAL_CLASS_OPTIONS.map((opt) => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  </label>
                  <label className="rc-filter">
                    <span>État physique</span>
                    <select value={filterPhysicalState} onChange={(e) => setFilterPhysicalState(e.target.value)}>
                      {PHYSICAL_STATE_OPTIONS.map((opt) => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  </label>
                  <label className="rc-filter">
                    <span>FDS</span>
                    <select value={filterFds} onChange={(e) => setFilterFds(e.target.value)}>
                      {FDS_FILTER_OPTIONS.map((opt) => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="rc-filter-row">
                  <label className="rc-filter wide">
                    <span>Emplacement</span>
                    <input
                      type="text"
                      maxLength={80}
                      value={filterEmplacement}
                      onChange={(e) => setFilterEmplacement(e.target.value)}
                      placeholder="Ex : Dépôt - Entretien"
                    />
                  </label>
                  <label className="rc-filter wide">
                    <span>Rechercher</span>
                    <div className="rc-search">
                      <Search size={16} />
                      <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Code ou nom du produit..."
                      />
                    </div>
                  </label>
                </div>
              </section>

              <section className="rc-kpis" aria-label="Indicateurs">
                <article className="rc-kpi-card">
                  <span>Produits chimiques</span>
                  <AnimatedKpi value={kpis.total} />
                </article>
                <article className="rc-kpi-card ok">
                  <span>FDS disponibles</span>
                  <AnimatedKpi value={kpis.fdsOk} />
                </article>
                <article className="rc-kpi-card warn">
                  <span>FDS manquantes</span>
                  <AnimatedKpi value={kpis.fdsMissing} />
                </article>
                <article className="rc-kpi-card danger">
                  <span>Produits à surveiller</span>
                  <AnimatedKpi value={kpis.toWatch} />
                </article>
              </section>

              <section className="rc-watch" aria-label="Points à surveiller">
                <div className="rc-watch-head">
                  <strong>Points à surveiller</strong>
                  <span className="rc-watch-hint">À corriger / vérifier</span>
                </div>
                {(points.withoutFds + points.withoutClass + points.sensitive + points.expiringLots) === 0 ? (
                  <div className="rc-watch-ok">Aucun point critique détecté.</div>
                ) : (
                  <ul className="rc-watch-list">
                    <li><strong>{points.withoutFds}</strong> produit{points.withoutFds > 1 ? 's' : ''} sans FDS</li>
                    <li><strong>{points.withoutClass}</strong> produit{points.withoutClass > 1 ? 's' : ''} sans classe chimique</li>
                    <li><strong>{points.sensitive}</strong> produit{points.sensitive > 1 ? 's' : ''} sensible{points.sensitive > 1 ? 's' : ''}</li>
                    <li><strong>{points.expiringLots}</strong> lot{points.expiringLots > 1 ? 's' : ''} proche{points.expiringLots > 1 ? 's' : ''} péremption</li>
                  </ul>
                )}
              </section>

              <section className="rc-table-wrap" aria-label="Table registre chimique">
                <table className="rc-table">
                  <thead>
                    <tr>
                      <th>Code produit</th>
                      <th>Produit</th>
                      <th>Classe chimique</th>
                      <th>État physique</th>
                      <th>Quantité</th>
                      <th>Unité</th>
                      <th>Emplacement</th>
                      <th>Fournisseur</th>
                      <th>FDS</th>
                      <th>Dernier mouvement</th>
                      <th>Statut</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((row) => {
                      const sig = row._sig || computeChemicalRegisterSignals(row);
                      const rowKey = String(row?.product_id || row?.code_product || row?.designation || '');
                      return (
                        <tr key={rowKey}>
                          <td className="mono">{row?.code_product || '-'}</td>
                          <td>
                            <div className="rc-prod-name">{row?.designation || '-'}</div>
                          </td>
                          <td>
                            <span className={`rc-pill class-${sig.chemicalClass === 'Non renseignée' ? 'na' : sig.sensitive ? 'danger' : 'info'}`}>
                              {sig.chemicalClass}
                            </span>
                          </td>
                          <td>
                            <span className={`rc-pill ${sig.physicalState === 'Non renseigné' ? 'na' : 'neutral'}`}>
                              {sig.physicalState}
                            </span>
                          </td>
                          <td className="num">{Math.max(0, Math.floor(Number(row?.quantite_restante || 0)))}</td>
                          <td>{row?.unite || '-'}</td>
                          <td>{row?.emplacement || '-'}</td>
                          <td>{row?.fournisseur || '-'}</td>
                          <td>
                            {sig.hasFds ? (
                              <div className="rc-fds-cell">
                                <span className="rc-pill ok">Disponible</span>
                                <button type="button" className="rc-link" onClick={() => handleOpenFds(row, 'open')}>Ouvrir FDS</button>
                              </div>
                            ) : (
                              <div className="rc-fds-cell">
                                <span className="rc-pill warn">Manquante</span>
                                <span className="rc-pill warn subtle">À compléter</span>
                              </div>
                            )}
                          </td>
                          <td>{formatDateLabel(row?.last_movement_at)}</td>
                          <td>
                            <span className={`rc-pill status-${sig.status === 'Conforme' ? 'ok' : sig.status === 'À compléter' ? 'warn' : sig.status === 'À surveiller' ? 'info' : 'danger'}`}>
                              {sig.status}
                            </span>
                          </td>
                          <td>
                            <div className="rc-actions">
                              <button type="button" className="rc-btn" onClick={() => setDetailRow(row)}>Voir détail</button>
                              {sig.hasFds ? (
                                <button type="button" className="rc-btn subtle" onClick={() => handleOpenFds(row, 'download')}>Télécharger FDS</button>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      );
                    })}

                    {!filtered.length && (
                      <tr>
                        <td colSpan={12} className="rc-empty">
                          Aucun produit chimique trouvé pour cette période.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </section>
            </div>
          </main>
        </div>
      </div>

      {detailRow && (
        <div className="rc-modal-overlay" role="dialog" aria-modal="true" aria-label="Détail produit" onClick={() => setDetailRow(null)}>
          <div className="rc-modal" onClick={(e) => e.stopPropagation()}>
            <div className="rc-modal-head">
              <div className="rc-modal-title">
                <strong>{detailRow?.designation || 'Produit'}</strong>
                <span className="mono">{detailRow?.code_product || '-'}</span>
              </div>
              <button type="button" className="rc-modal-close" onClick={() => setDetailRow(null)} aria-label="Fermer">
                <X size={18} />
              </button>
            </div>
            <div className="rc-modal-body">
              {(() => {
                const sig = computeChemicalRegisterSignals(detailRow);
                return (
                  <>
                    <div className="rc-modal-grid">
                      <div className="rc-modal-item">
                        <span>Classe</span>
                        <strong>{sig.chemicalClass}</strong>
                      </div>
                      <div className="rc-modal-item">
                        <span>État</span>
                        <strong>{sig.physicalState}</strong>
                      </div>
                      <div className="rc-modal-item">
                        <span>Quantité</span>
                        <strong>{Math.max(0, Math.floor(Number(detailRow?.quantite_restante || 0)))} {detailRow?.unite || ''}</strong>
                      </div>
                      <div className="rc-modal-item">
                        <span>Emplacement</span>
                        <strong>{detailRow?.emplacement || '-'}</strong>
                      </div>
                      <div className="rc-modal-item">
                        <span>Fournisseur</span>
                        <strong>{detailRow?.fournisseur || '-'}</strong>
                      </div>
                      <div className="rc-modal-item">
                        <span>Dernier mouvement</span>
                        <strong>{formatDateLabel(detailRow?.last_movement_at)}</strong>
                      </div>
                      <div className="rc-modal-item">
                        <span>Prochaine péremption</span>
                        <strong>{formatDateLabel(detailRow?.next_expiry_date)}</strong>
                      </div>
                      <div className="rc-modal-item">
                        <span>Statut</span>
                        <strong>{sig.status}</strong>
                      </div>
                    </div>

                    <div className="rc-modal-actions">
                      {sig.hasFds ? (
                        <>
                          <button type="button" className="btn btn-primary btn-sm" onClick={() => handleOpenFds(detailRow, 'open')}>
                            Ouvrir FDS
                          </button>
                          <button type="button" className="btn btn-secondary btn-sm" onClick={() => handleOpenFds(detailRow, 'download')}>
                            Télécharger FDS
                          </button>
                        </>
                      ) : (
                        <div className="rc-modal-fds-missing">FDS manquante.</div>
                      )}
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}
    </ProtectedPage>
  );
}
