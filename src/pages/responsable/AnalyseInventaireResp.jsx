import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  RefreshCw,
  Search,
  Download,
  CheckCircle2,
  RotateCcw,
  XCircle,
  AlertTriangle,
  Info,
} from 'lucide-react';
import SidebarResp from '../../components/responsable/SidebarResp';
import HeaderPage from '../../components/shared/HeaderPage';
import ProtectedPage from '../../components/shared/ProtectedPage';
import LoadingSpinner from '../../components/shared/LoadingSpinner';
import { useToast } from '../../components/shared/Toast';
import { get, patch, post } from '../../services/api';
import './AnalyseInventaireResp.css';

function formatDt(value) {
  if (!value) return '-';
  try {
    return new Date(value).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch {
    return '-';
  }
}

function formatMoney(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return '-';
  return n.toLocaleString('fr-FR', { maximumFractionDigits: 3 });
}

function perimeterLabel(inv) {
  if (!inv) return '-';
  if (String(inv.type_inventaire) === 'GLOBAL') return 'Tous les articles';
  const zone = inv.zone_id?.name ? `Zone: ${inv.zone_id.name}` : '';
  const fam = inv.famille_id ? `Famille: ${inv.famille_id}` : '';
  const cat = inv.categorie_id?.name ? `Catégorie: ${inv.categorie_id.name}` : '';
  return [zone, fam, cat].filter(Boolean).join(' | ') || '-';
}

function toCsv(lines = []) {
  const header = [
    'reference',
    'designation',
    'emplacement',
    'qte_theorique_initiale',
    'qte_comptee',
    'ecart',
    'unit_price',
    'valeur_ecart',
    'criticite',
    'observation_magasinier',
    'motif_ecart',
    'observation_responsable',
  ];
  const escape = (v) => {
    const s = String(v ?? '');
    if (s.includes('"') || s.includes(';') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const body = lines.map((l) => ([
    l.product?.code_product,
    l.product?.name,
    l.product?.emplacement,
    l.quantite_theorique_initiale,
    l.quantite_comptee,
    l.ecart,
    l.unit_price,
    l.valeur_ecart,
    l.criticite,
    l.observation_magasinier,
    l.motif_ecart,
    l.observation_responsable,
  ].map(escape).join(';')));
  return [header.join(';'), ...body].join('\n');
}

const AnalyseInventaireResp = ({ userName, onLogout }) => {
  const toast = useToast();
  const navigate = useNavigate();
  const params = useParams();
  const inventoryId = String(params.id || '');

  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => (typeof window !== 'undefined' ? window.innerWidth <= 768 : false));
  const [isLoading, setIsLoading] = useState(false);
  const [inventory, setInventory] = useState(null);
  const [summary, setSummary] = useState(null);
  const [lines, setLines] = useState([]);
  const [motifs, setMotifs] = useState([]);
  const [query, setQuery] = useState('');
  const [drafts, setDrafts] = useState(() => new Map());

  const [showRecountModal, setShowRecountModal] = useState(false);
  const [recountMotif, setRecountMotif] = useState('');
  const [recountScope, setRecountScope] = useState('all_deltas'); // all_deltas | critical_deltas | selected
  const [selectedLines, setSelectedLines] = useState(() => new Set());

  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectMotif, setRejectMotif] = useState('');

  const load = useCallback(async () => {
    if (!inventoryId) return;
    setIsLoading(true);
    try {
      const payload = await get(`/inventory/responsable/inventories/${inventoryId}/analysis`);
      setInventory(payload?.inventory || null);
      setSummary(payload?.summary || null);
      const nextLines = Array.isArray(payload?.lines) ? payload.lines : [];
      setLines(nextLines);
      setMotifs(Array.isArray(payload?.motifs_ecart) ? payload.motifs_ecart : []);
      setDrafts(new Map(nextLines.map((l) => [String(l._id), { motif_ecart: l.motif_ecart || '', observation_responsable: l.observation_responsable || '' }])));
    } catch (err) {
      toast.error(err.message || "Erreur chargement analyse inventaire");
    } finally {
      setIsLoading(false);
    }
  }, [inventoryId, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const filteredLines = useMemo(() => {
    const q = String(query || '').trim().toLowerCase();
    if (!q) return lines;
    return lines.filter((l) => {
      const code = String(l.product?.code_product || '').toLowerCase();
      const name = String(l.product?.name || '').toLowerCase();
      const emp = String(l.product?.emplacement || '').toLowerCase();
      return code.includes(q) || name.includes(q) || emp.includes(q);
    });
  }, [lines, query]);

  const selectableRecountLines = useMemo(() => (lines || []).filter((l) => Number(l.ecart || 0) !== 0), [lines]);

  const canAct = useMemo(() => String(inventory?.status) === 'A_VALIDER', [inventory?.status]);

  const updateLine = async (lineId, patchBody) => {
    if (!inventoryId || !lineId) return;
    setIsLoading(true);
    try {
      await patch(`/inventory/responsable/inventories/${inventoryId}/lines/${lineId}`, patchBody);
      await load();
    } catch (err) {
      toast.error(err.message || 'Erreur mise à jour ligne');
    } finally {
      setIsLoading(false);
    }
  };

  const setDraft = (lineId, patchDraft) => {
    setDrafts((prev) => {
      const next = new Map(prev);
      const current = next.get(lineId) || { motif_ecart: '', observation_responsable: '' };
      next.set(lineId, { ...current, ...patchDraft });
      return next;
    });
  };

  const saveDraftLine = async (lineId) => {
    const draft = drafts.get(String(lineId)) || { motif_ecart: '', observation_responsable: '' };
    await updateLine(String(lineId), {
      motif_ecart: draft.motif_ecart || '',
      observation_responsable: draft.observation_responsable || '',
    });
  };

  const exportCsv = () => {
    const csv = toCsv(lines);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${inventory?.reference || 'inventaire'}_analyse.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const validateInventory = async () => {
    const ok = window.confirm("Voulez-vous vraiment valider cet inventaire ? Cette action va ajuster définitivement le stock.");
    if (!ok) return;
    setIsLoading(true);
    try {
      const r = await post(`/inventory/responsable/inventories/${inventoryId}/validate`, {});
      toast.success(`Inventaire validé (${r?.adjustments?.length || 0} ajustement(s))`);
      await load();
    } catch (err) {
      toast.error(err.message || 'Erreur validation');
    } finally {
      setIsLoading(false);
    }
  };

  const openRecount = () => {
    setRecountMotif('');
    setRecountScope('all_deltas');
    setSelectedLines(new Set());
    setShowRecountModal(true);
  };

  const submitRecountRequest = async () => {
    const motif = String(recountMotif || '').trim();
    if (motif.length < 5) {
      toast.error('Motif obligatoire (min 5 caractères)');
      return;
    }
    const lineIds = recountScope === 'selected' ? Array.from(selectedLines) : [];
    setIsLoading(true);
    try {
      const r = await post(`/inventory/responsable/inventories/${inventoryId}/recount-request`, {
        motif,
        scope: recountScope,
        line_ids: lineIds,
      });
      toast.success(`Recomptage demandé (${r?.targets_count || 0} ligne(s))`);
      setShowRecountModal(false);
      await load();
    } catch (err) {
      toast.error(err.message || 'Erreur demande recomptage');
    } finally {
      setIsLoading(false);
    }
  };

  const openReject = () => {
    setRejectMotif('');
    setShowRejectModal(true);
  };

  const submitReject = async () => {
    const motif = String(rejectMotif || '').trim();
    if (motif.length < 5) {
      toast.error('Motif obligatoire (min 5 caractères)');
      return;
    }
    const ok = window.confirm('Rejeter cet inventaire ? Aucun stock ne sera modifié.');
    if (!ok) return;
    setIsLoading(true);
    try {
      await post(`/inventory/responsable/inventories/${inventoryId}/reject`, { motif });
      toast.success('Inventaire rejeté');
      setShowRejectModal(false);
      await load();
    } catch (err) {
      toast.error(err.message || 'Erreur rejet');
    } finally {
      setIsLoading(false);
    }
  };

  const toggleSelected = (lineId) => {
    setSelectedLines((prev) => {
      const next = new Set(prev);
      if (next.has(lineId)) next.delete(lineId);
      else next.add(lineId);
      return next;
    });
  };

  return (
    <ProtectedPage userName={userName}>
      <div className="app-layout">
        <div className={`sidebar-backdrop ${sidebarCollapsed ? 'hidden' : ''}`} onClick={() => setSidebarCollapsed(true)} />
        <SidebarResp collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} onLogout={onLogout} userName={userName} />

        <div className="main-container">
          <HeaderPage userName={userName} title="Analyse inventaire" showSearch={false} onMenuClick={() => setSidebarCollapsed((p) => !p)} />
          <main className="main-content">
            {isLoading && <LoadingSpinner overlay text="Traitement..." />}

            <div className="inv-an-head">
              <div className="inv-an-title">
                <h2>{inventory?.reference || 'Inventaire'}</h2>
                <div className="inv-an-sub">
                  <span className={`inv-pill ${String(inventory?.status || '').toLowerCase()}`}>{inventory?.status || '-'}</span>
                  <span>Type: <strong>{inventory?.type_inventaire || '-'}</strong></span>
                  <span>Magasin: <strong>{inventory?.magasin_id?.name || '-'}</strong></span>
                  <span>Périmètre: <strong>{perimeterLabel(inventory)}</strong></span>
                  <span>Magasinier: <strong>{inventory?.magasinier_id?.username || '-'}</strong></span>
                  <span>Soumis: <strong>{formatDt(inventory?.submitted_at)}</strong></span>
                </div>
              </div>
              <div className="inv-an-actions">
                <button className="inv-btn" type="button" onClick={() => navigate('/responsable/inventaires/a-valider')}>
                  <ArrowLeft size={16} /> Retour
                </button>
                <button className="inv-btn" type="button" onClick={load} disabled={isLoading}>
                  <RefreshCw size={16} /> Actualiser
                </button>
                <button className="inv-btn" type="button" onClick={exportCsv} disabled={!lines.length}>
                  <Download size={16} /> Exporter rapport
                </button>
              </div>
            </div>

            <div className="inv-an-kpis">
              <div className="kpi">
                <div className="k">Articles comptés</div>
                <div className="v">{summary?.articles_comptes ?? '-'}/{summary?.total_articles ?? '-'}</div>
              </div>
              <div className="kpi ok">
                <div className="k">Sans écart</div>
                <div className="v">{summary?.articles_sans_ecart ?? '-'}</div>
              </div>
              <div className="kpi warn">
                <div className="k">Avec écart</div>
                <div className="v">{summary?.articles_avec_ecart ?? '-'}</div>
              </div>
              <div className="kpi crit">
                <div className="k">Critiques en écart</div>
                <div className="v">{summary?.articles_critiques_en_ecart ?? '-'}</div>
              </div>
              <div className="kpi money">
                <div className="k">Valeur écarts (abs)</div>
                <div className="v">{formatMoney(summary?.valeur_totale_ecarts_abs)}</div>
              </div>
              <div className="kpi info">
                <div className="k">Fiabilité</div>
                <div className="v">{Number(summary?.fiabilite_pct ?? 0).toFixed(2)}%</div>
              </div>
            </div>

            <div className="inv-an-buttons">
              <button className="inv-btn success" type="button" onClick={validateInventory} disabled={!canAct || isLoading}>
                <CheckCircle2 size={16} /> Valider et ajuster le stock
              </button>
              <button className="inv-btn warning" type="button" onClick={openRecount} disabled={!canAct || isLoading}>
                <RotateCcw size={16} /> Demander recomptage
              </button>
              <button className="inv-btn danger" type="button" onClick={openReject} disabled={!canAct || isLoading}>
                <XCircle size={16} /> Rejeter
              </button>
              {!canAct ? (
                <div className="inv-an-hint">
                  <Info size={16} /> Actions désactivées (statut actuel: {inventory?.status || '-'})
                </div>
              ) : null}
            </div>

            <section className="inv-an-card">
              <div className="inv-an-table-head">
                <div className="inv-an-search">
                  <Search size={16} />
                  <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher (réf, désignation, emplacement)..." />
                </div>
                <div className="inv-an-legend">
                  <span className="tag ok"><CheckCircle2 size={14} /> Écart nul</span>
                  <span className="tag warn"><AlertTriangle size={14} /> Écart</span>
                  <span className="tag crit"><XCircle size={14} /> Critique</span>
                </div>
              </div>

              <div className="inv-table-wrap">
                <table className="inv-table">
                  <thead>
                    <tr>
                      <th>Référence</th>
                      <th>Désignation</th>
                      <th>Emplacement</th>
                      <th>Qté théorique</th>
                      <th>Qté comptée</th>
                      <th>Écart</th>
                      <th>Valeur écart</th>
                      <th>Criticité</th>
                      <th>Obs magasinier</th>
                      <th>Motif</th>
                      <th>Obs responsable</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLines.map((l) => {
                      const delta = Number(l.ecart || 0);
                      const isZero = delta === 0;
                      const isCritical = String(l.criticite) === 'critique';
                      const rowClass = isCritical && !isZero ? 'crit' : !isZero ? 'warn' : 'ok';
                      const lineId = String(l._id);
                      const draft = drafts.get(lineId) || { motif_ecart: l.motif_ecart || '', observation_responsable: l.observation_responsable || '' };
                      const hasDirty = String(draft.motif_ecart || '') !== String(l.motif_ecart || '')
                        || String(draft.observation_responsable || '') !== String(l.observation_responsable || '');
                      return (
                        <tr key={l._id} className={`row-${rowClass}`}>
                          <td><strong>{l.product?.code_product}</strong></td>
                          <td>{l.product?.name}</td>
                          <td>{l.product?.emplacement || '-'}</td>
                          <td>{l.quantite_theorique_initiale}</td>
                          <td>{l.quantite_comptee}</td>
                          <td className={delta === 0 ? 'delta-zero' : delta > 0 ? 'delta-pos' : 'delta-neg'}>{delta}</td>
                          <td>{formatMoney(l.valeur_ecart)}</td>
                          <td>{isCritical ? <span className="badge-crit">Critique</span> : <span className="badge-norm">Normal</span>}</td>
                          <td className="cell-wrap">{l.observation_magasinier || '-'}</td>
                          <td>
                            <select
                              value={draft.motif_ecart || ''}
                              onChange={(e) => setDraft(lineId, { motif_ecart: e.target.value || '' })}
                              disabled={isLoading}
                            >
                              <option value="">-</option>
                              {motifs.map((m) => (
                                <option key={m} value={m}>{m}</option>
                              ))}
                            </select>
                          </td>
                          <td>
                            <input
                              value={draft.observation_responsable || ''}
                              onChange={(e) => setDraft(lineId, { observation_responsable: e.target.value })}
                              placeholder="Note / décision..."
                              disabled={isLoading}
                            />
                            <div className="inv-line-save">
                              <button className="inv-btn" type="button" onClick={() => saveDraftLine(lineId)} disabled={isLoading || !hasDirty}>
                                <CheckCircle2 size={16} /> Enregistrer
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {!filteredLines.length && (
                      <tr>
                        <td colSpan={11}>
                          <div className="inv-empty">Aucune ligne.</div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            {showRecountModal ? (
              <div className="inv-modal-backdrop" onClick={() => setShowRecountModal(false)}>
                <div className="inv-modal" onClick={(e) => e.stopPropagation()}>
                  <div className="inv-modal-head">
                    <strong>Demander recomptage</strong>
                    <button className="inv-btn" type="button" onClick={() => setShowRecountModal(false)}>Fermer</button>
                  </div>
                  <div className="inv-modal-body">
                    <label>Motif (obligatoire)</label>
                    <textarea value={recountMotif} onChange={(e) => setRecountMotif(e.target.value)} rows={3} placeholder="Ex: écarts importants sur articles critiques..." />

                    <label>Portée</label>
                    <div className="inv-radio-row">
                      <label><input type="radio" name="scope" checked={recountScope === 'all_deltas'} onChange={() => setRecountScope('all_deltas')} /> Toutes les lignes en écart</label>
                      <label><input type="radio" name="scope" checked={recountScope === 'critical_deltas'} onChange={() => setRecountScope('critical_deltas')} /> Lignes critiques en écart</label>
                      <label><input type="radio" name="scope" checked={recountScope === 'selected'} onChange={() => setRecountScope('selected')} /> Sélection manuelle</label>
                    </div>

                    {recountScope === 'selected' ? (
                      <>
                        <div className="inv-modal-hint">
                          <Info size={16} /> Sélectionnez les lignes à recompter.
                        </div>
                        <div className="inv-modal-list">
                          {selectableRecountLines.map((l) => (
                            <label key={l._id} className="inv-modal-line">
                              <input
                                type="checkbox"
                                checked={selectedLines.has(String(l._id))}
                                onChange={() => toggleSelected(String(l._id))}
                              />
                              <span className="code">{l.product?.code_product}</span>
                              <span className="name">{l.product?.name}</span>
                              <span className={`delta ${Number(l.ecart || 0) === 0 ? 'z' : Number(l.ecart || 0) > 0 ? 'p' : 'n'}`}>{Number(l.ecart || 0)}</span>
                            </label>
                          ))}
                          {!selectableRecountLines.length && <div className="inv-empty">Aucune ligne en écart.</div>}
                        </div>
                      </>
                    ) : null}
                  </div>
                  <div className="inv-modal-footer">
                    <button className="inv-btn warning" type="button" onClick={submitRecountRequest} disabled={isLoading || !canAct}>
                      <RotateCcw size={16} /> Confirmer recomptage
                    </button>
                  </div>
                </div>
              </div>
            ) : null}

            {showRejectModal ? (
              <div className="inv-modal-backdrop" onClick={() => setShowRejectModal(false)}>
                <div className="inv-modal" onClick={(e) => e.stopPropagation()}>
                  <div className="inv-modal-head">
                    <strong>Rejeter inventaire</strong>
                    <button className="inv-btn" type="button" onClick={() => setShowRejectModal(false)}>Fermer</button>
                  </div>
                  <div className="inv-modal-body">
                    <label>Motif (obligatoire)</label>
                    <textarea value={rejectMotif} onChange={(e) => setRejectMotif(e.target.value)} rows={3} placeholder="Ex: comptage incohérent / procédure non respectée..." />
                    <div className="inv-modal-hint danger">
                      <AlertTriangle size={16} /> Le rejet ne modifie pas le stock et doit rester rare.
                    </div>
                  </div>
                  <div className="inv-modal-footer">
                    <button className="inv-btn danger" type="button" onClick={submitReject} disabled={isLoading || !canAct}>
                      <XCircle size={16} /> Confirmer rejet
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </main>
        </div>
      </div>
    </ProtectedPage>
  );
};

export default AnalyseInventaireResp;
