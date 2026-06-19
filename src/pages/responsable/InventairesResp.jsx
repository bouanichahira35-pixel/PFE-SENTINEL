import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, ClipboardCheck, ClipboardList, History, Info, RefreshCw, Rocket, Save, Search, ShieldAlert, XCircle } from 'lucide-react';
import SidebarResp from '../../components/responsable/SidebarResp';
import HeaderPage from '../../components/shared/HeaderPage';
import ProtectedPage from '../../components/shared/ProtectedPage';
import LoadingSpinner from '../../components/shared/LoadingSpinner';
import { useToast } from '../../components/shared/Toast';
import { get, patch, post } from '../../services/api';
import './InventairesResp.css';

function formatDt(value) {
  if (!value) return '-';
  try {
    return new Date(value).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch {
    return '-';
  }
}

const ACTIVE_STATUSES = new Set(['A_FAIRE', 'EN_COURS', 'A_VALIDER', 'A_RECOMPTER']);
const HISTORY_STATUSES = new Set(['VALIDE', 'REJETE', 'ANNULE']);

const STATUS_LABELS = {
  BROUILLON: 'Brouillon',
  A_FAIRE: 'Déclaré',
  EN_COURS: 'En cours',
  A_VALIDER: 'À valider',
  A_RECOMPTER: 'À recompter',
  VALIDE: 'Validé',
  REJETE: 'Rejeté',
  ANNULE: 'Annulé',
};

function toDateInputValue(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

function statusLabel(status) {
  const key = String(status || '').toUpperCase();
  return STATUS_LABELS[key] || key || '-';
}

function assignedMagasiniersLabel(inv) {
  const names = [];
  const seen = new Set();
  const pushName = (u) => {
    const name = String(u?.username || '').trim();
    if (!name || seen.has(name)) return;
    seen.add(name);
    names.push(name);
  };

  if (Array.isArray(inv?.magasinier_ids)) inv.magasinier_ids.forEach(pushName);
  pushName(inv?.magasinier_id);
  return names.length ? names.join(', ') : '-';
}

function perimeterLabel(inv) {
  if (!inv) return '-';
  if (String(inv.type_inventaire) === 'GLOBAL') return 'Tous les articles';
  const product = inv.product_id?.name
    ? `Produit: ${inv.product_id.code_product || ''} ${inv.product_id.name}`.trim()
    : '';
  const fam = inv.famille_id ? `Famille: ${inv.famille_id}` : '';
  const cat = inv.categorie_id?.name ? `Catégorie: ${inv.categorie_id.name}` : '';
  return [product, fam, cat].filter(Boolean).join(' | ') || '-';
}

const InventairesResp = ({ userName, onLogout }) => {
  const toast = useToast();
  const navigate = useNavigate();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => (typeof window !== 'undefined' ? window.innerWidth <= 768 : false));
  const [isLoading, setIsLoading] = useState(false);
  const [inventories, setInventories] = useState([]);
  const [activeInventoryId, setActiveInventoryId] = useState('');
  const [showHelp, setShowHelp] = useState(false);
  const [tab, setTab] = useState('declared');
  const [query, setQuery] = useState('');
  const [options, setOptions] = useState({ magasiniers: [] });
  const [inventoryLines, setInventoryLines] = useState([]);
  const [settingsDraft, setSettingsDraft] = useState({
    date_prevue: '',
    commentaire: '',
    notifications_activees: true,
    bloquer_mouvements: false,
    lock_scope: 'auto',
    movement_blocked_product_ids: [],
    magasinier_ids: [],
  });

  const activeInventory = useMemo(
    () => (inventories || []).find((x) => String(x._id) === String(activeInventoryId)) || null,
    [activeInventoryId, inventories]
  );

  const loadInventories = useCallback(async () => {
    setIsLoading(true);
    try {
      const payload = await get('/inventory/inventories');
      setInventories(Array.isArray(payload?.inventories) ? payload.inventories : []);
    } catch (err) {
      toast.error(err.message || 'Erreur chargement inventaires');
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  const loadOptions = useCallback(async () => {
    try {
      const payload = await get('/inventory/launch/options');
      setOptions({ magasiniers: Array.isArray(payload?.magasiniers) ? payload.magasiniers : [] });
    } catch {
      setOptions({ magasiniers: [] });
    }
  }, []);

  useEffect(() => {
    loadInventories();
  }, [loadInventories]);

  useEffect(() => {
    loadOptions();
  }, [loadOptions]);

  useEffect(() => {
    if (!activeInventory?._id) {
      setInventoryLines([]);
      return;
    }

    let cancelled = false;
    async function loadLines() {
      try {
        const payload = await get(`/inventory/responsable/inventories/${activeInventory._id}/analysis`);
        if (!cancelled) setInventoryLines(Array.isArray(payload?.lines) ? payload.lines : []);
      } catch {
        if (!cancelled) setInventoryLines([]);
      }
    }
    loadLines();
    return () => {
      cancelled = true;
    };
  }, [activeInventory?._id]);

  useEffect(() => {
    if (!activeInventory) return;
    const blockedIds = Array.isArray(activeInventory.movement_blocked_product_ids)
      ? activeInventory.movement_blocked_product_ids.map((id) => String(id?._id || id)).filter(Boolean)
      : [];
    const assignedIds = Array.isArray(activeInventory.magasinier_ids)
      ? activeInventory.magasinier_ids.map((u) => String(u?._id || u)).filter(Boolean)
      : [];
    const primaryId = String(activeInventory.magasinier_id?._id || activeInventory.magasinier_id || '');
    const nextAssigned = Array.from(new Set([primaryId, ...assignedIds].filter(Boolean)));
    setSettingsDraft({
      date_prevue: toDateInputValue(activeInventory.date_prevue),
      commentaire: activeInventory.commentaire || '',
      notifications_activees: activeInventory.notifications_activees !== false,
      bloquer_mouvements: Boolean(activeInventory.bloquer_mouvements || activeInventory.movement_blocked),
      lock_scope: String(activeInventory.movement_block_scope || '') === 'global' ? 'global' : blockedIds.length ? 'products' : 'auto',
      movement_blocked_product_ids: blockedIds,
      magasinier_ids: nextAssigned,
    });
  }, [activeInventory]);

  const activeCount = useMemo(() => (inventories || []).filter((i) => ACTIVE_STATUSES.has(String(i.status))).length, [inventories]);
  const toValidateCount = useMemo(() => (inventories || []).filter((i) => String(i.status) === 'A_VALIDER').length, [inventories]);
  const historyCount = useMemo(() => (inventories || []).filter((i) => HISTORY_STATUSES.has(String(i.status))).length, [inventories]);
  const canEditActive = useMemo(() => activeInventory && ['A_FAIRE', 'EN_COURS', 'A_RECOMPTER'].includes(String(activeInventory.status)), [activeInventory]);
  const canCancelActive = useMemo(() => activeInventory && ACTIVE_STATUSES.has(String(activeInventory.status)), [activeInventory]);
  const filteredInventories = useMemo(() => {
    const q = String(query || '').trim().toLowerCase();
    return (inventories || []).filter((inv) => {
      const status = String(inv.status || '');
      if (tab === 'declared' && !ACTIVE_STATUSES.has(status)) return false;
      if (tab === 'to_validate' && status !== 'A_VALIDER') return false;
      if (tab === 'history' && !HISTORY_STATUSES.has(status)) return false;

      if (!q) return true;
      const haystack = [
        inv.reference,
        inv.type_inventaire,
        statusLabel(inv.status),
        inv.magasin_id?.name,
        inv.product_id?.code_product,
        inv.product_id?.name,
        inv.categorie_id?.name,
        inv.famille_id,
        assignedMagasiniersLabel(inv),
      ].join(' ').toLowerCase();
      return haystack.includes(q);
    });
  }, [inventories, query, tab]);

  useEffect(() => {
    if (!filteredInventories.length) {
      setActiveInventoryId('');
      return;
    }
    const exists = filteredInventories.some((inv) => String(inv._id) === String(activeInventoryId));
    if (!exists) setActiveInventoryId(String(filteredInventories[0]._id));
  }, [activeInventoryId, filteredInventories]);

  const toggleDraftMagasinier = (id, checked) => {
    const key = String(id || '');
    if (!key) return;
    setSettingsDraft((prev) => {
      const set = new Set((prev.magasinier_ids || []).map(String));
      if (checked) set.add(key);
      else set.delete(key);
      return { ...prev, magasinier_ids: Array.from(set) };
    });
  };

  const toggleLockedProduct = (id, checked) => {
    const key = String(id || '');
    if (!key) return;
    setSettingsDraft((prev) => {
      const set = new Set((prev.movement_blocked_product_ids || []).map(String));
      if (checked) set.add(key);
      else set.delete(key);
      return { ...prev, movement_blocked_product_ids: Array.from(set), lock_scope: 'products' };
    });
  };

  const saveInventorySettings = async () => {
    if (!activeInventory?._id || !canEditActive) return;
    if (!settingsDraft.magasinier_ids.length) {
      toast.error('Selectionnez au moins un magasinier');
      return;
    }
    if (
      settingsDraft.bloquer_mouvements &&
      settingsDraft.lock_scope === 'products' &&
      !settingsDraft.movement_blocked_product_ids.length
    ) {
      toast.error('Selectionnez au moins un produit a bloquer');
      return;
    }

    setIsLoading(true);
    try {
      await patch(`/inventory/responsable/inventories/${activeInventory._id}/settings`, {
        date_prevue: settingsDraft.date_prevue,
        commentaire: settingsDraft.commentaire,
        notifications_activees: Boolean(settingsDraft.notifications_activees),
        magasinier_ids: settingsDraft.magasinier_ids,
        bloquer_mouvements: Boolean(settingsDraft.bloquer_mouvements),
        movement_blocked_product_ids: settingsDraft.lock_scope === 'products'
          ? settingsDraft.movement_blocked_product_ids
          : [],
      });
      toast.success('Inventaire mis a jour');
      await loadInventories();
    } catch (err) {
      toast.error(err.message || 'Erreur modification inventaire');
    } finally {
      setIsLoading(false);
    }
  };

  const cancelInventory = async () => {
    if (!activeInventory?._id || !canCancelActive) return;
    const motif = window.prompt(`Motif d'annulation pour ${activeInventory.reference} :`, 'Inventaire stoppe par le responsable');
    if (!motif || String(motif).trim().length < 5) {
      toast.error('Motif obligatoire (minimum 5 caracteres)');
      return;
    }
    setIsLoading(true);
    try {
      await post(`/inventory/responsable/inventories/${activeInventory._id}/cancel`, { motif });
      toast.success('Inventaire annule et mouvements debloques');
      await loadInventories();
      setTab('history');
    } catch (err) {
      toast.error(err.message || 'Erreur annulation inventaire');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <ProtectedPage userName={userName}>
      <div className="app-layout">
        <div className={`sidebar-backdrop ${sidebarCollapsed ? 'hidden' : ''}`} onClick={() => setSidebarCollapsed(true)} />
        <SidebarResp collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} onLogout={onLogout} userName={userName} />

        <div className="main-container">
          <HeaderPage userName={userName} title="Inventaires" showSearch={false} onMenuClick={() => setSidebarCollapsed((p) => !p)} />
          <main className="main-content">
            {isLoading && <LoadingSpinner overlay text="Chargement..." />}

            <section className="inv-help-card">
              <div className="inv-help-head">
                <div className="inv-help-title">
                  <Info size={16} />
                  <span>Rôle du responsable</span>
                </div>
                <button className="inv-help-toggle" type="button" onClick={() => setShowHelp((p) => !p)}>
                  {showHelp ? 'Masquer' : 'Afficher'}
                </button>
              </div>
              {showHelp && (
                <div className="inv-help-body">
                  <div className="inv-help-block">
                    <strong>Lancement & suivi</strong>
                    <ol>
                      <li>Définir le périmètre (GLOBAL ou TOURNANT).</li>
                      <li>Assigner un ou plusieurs magasiniers et la date prévue.</li>
                      <li>Suivre l'avancement puis valider à la fin.</li>
                    </ol>
                  </div>
                  <div className="inv-help-block">
                    <strong>Statuts métier</strong>
                    <ul>
                      <li><code>A_FAIRE</code> : inventaire déclaré et assigné.</li>
                      <li><code>EN_COURS</code> : comptage démarré par le magasinier.</li>
                      <li><code>A_VALIDER</code> : comptage terminé, attente validation.</li>
                      <li><code>A_RECOMPTER</code> : recomptage demandé.</li>
                      <li><code>VALIDE</code> / <code>REJETE</code> / <code>ANNULE</code> : historique clôturé.</li>
                    </ul>
                  </div>
                </div>
              )}
            </section>

            <div className="inv-resp-grid">
              <section className="inv-card">
                <div className="inv-head">
                  <h3><ClipboardCheck size={18} /> Inventaires</h3>
                  <div className="inv-head-actions">
                    <div className="inv-search">
                      <Search size={16} />
                      <input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Rechercher référence, produit, magasin..."
                      />
                    </div>
                    <button className="inv-btn" type="button" onClick={loadInventories} disabled={isLoading}>
                      <RefreshCw size={16} /> Actualiser
                    </button>
                    <button className="inv-btn" type="button" onClick={() => navigate('/responsable/inventaires/a-valider')} disabled={isLoading}>
                      <ClipboardList size={16} /> À valider
                    </button>
                    <button className="inv-btn primary" type="button" onClick={() => navigate('/responsable/inventaires/lancer')} disabled={isLoading}>
                      <Rocket size={16} /> Lancer un inventaire
                    </button>
                  </div>
                </div>

                <div className="inv-tabs" role="tablist" aria-label="Filtrer les inventaires">
                  <button type="button" className={`inv-tab${tab === 'declared' ? ' active' : ''}`} onClick={() => setTab('declared')}>
                    Déclarés <strong>{activeCount}</strong>
                  </button>
                  <button type="button" className={`inv-tab${tab === 'to_validate' ? ' active' : ''}`} onClick={() => setTab('to_validate')}>
                    À valider <strong>{toValidateCount}</strong>
                  </button>
                  <button type="button" className={`inv-tab${tab === 'history' ? ' active' : ''}`} onClick={() => setTab('history')}>
                    Historique <strong>{historyCount}</strong>
                  </button>
                  <button type="button" className={`inv-tab${tab === 'all' ? ' active' : ''}`} onClick={() => setTab('all')}>
                    Tous <strong>{inventories.length}</strong>
                  </button>
                </div>

                <div className="inv-banner">
                  <span>Inventaires déclarés: <strong>{activeCount}</strong></span>
                  <span>À valider: <strong>{toValidateCount}</strong></span>
                  <span>Historique: <strong>{historyCount}</strong></span>
                </div>

                <div className="inv-list">
                  {filteredInventories.map((s) => (
                    <button
                      key={s._id}
                      type="button"
                      className={`inv-session ${String(activeInventoryId) === String(s._id) ? 'active' : ''}`}
                      onClick={() => setActiveInventoryId(String(s._id))}
                    >
                      <div className="inv-session-title">
                        <strong>{s.reference}</strong>
                        <span className={`inv-pill ${String(s.status || '').toLowerCase()}`}>{statusLabel(s.status)}</span>
                      </div>
                      <div className="inv-session-sub">{String(s.type_inventaire || '-')}</div>
                      <div className="inv-session-meta">
                        Lancé: {formatDt(s.date_lancement || s.createdAt)} - Magasiniers: {assignedMagasiniersLabel(s)}
                      </div>
                      <div className="inv-progress-mini">
                        <span style={{ width: `${Math.min(100, Math.max(0, Number(s.progress?.pct || 0)))}%` }} />
                      </div>
                      <div className="inv-session-meta">
                        Avancement: {Number(s.progress?.counted || 0)}/{Number(s.progress?.total || 0)} ({Number(s.progress?.pct || 0)}%)
                        {Number(s.recount_lines_count || 0) > 0 ? ` - ${Number(s.recount_lines_count)} a recompter` : ''}
                      </div>
                    </button>
                  ))}
                  {!filteredInventories.length && (
                    <div className="inv-empty">Aucun inventaire dans cette vue.</div>
                  )}
                </div>
              </section>

              <section className="inv-card">
                <div className="inv-head">
                  <h3>{tab === 'history' ? <History size={18} /> : <ClipboardCheck size={18} />} Détails</h3>
                  {activeInventory?.reference ? <div className="inv-ref">Réf: <strong>{activeInventory.reference}</strong></div> : null}
                </div>

                {!activeInventory ? (
                  <div className="inv-empty">Sélectionnez un inventaire.</div>
                ) : (
                  <>
                    <div className="inv-banner">
                      <span>Statut: <strong>{statusLabel(activeInventory.status)}</strong></span>
                      <span>Type: <strong>{activeInventory.type_inventaire}</strong></span>
                      <span>Magasin: <strong>{activeInventory.magasin_id?.name || '-'}</strong></span>
                    </div>

                    <div className="inv-status-panel">
                      <div>
                        <span>Etat actuel</span>
                        <strong>{Number(activeInventory.progress?.pct || 0)}%</strong>
                      </div>
                      <div>
                        <span>Lignes comptees</span>
                        <strong>{Number(activeInventory.progress?.counted || 0)}/{Number(activeInventory.progress?.total || 0)}</strong>
                      </div>
                      <div>
                        <span>A recompter</span>
                        <strong>{Number(activeInventory.recount_lines_count || 0)}</strong>
                      </div>
                      <div>
                        <span>Verrou mouvement</span>
                        <strong>{activeInventory.movement_blocked ? (activeInventory.movement_block_scope === 'products' ? 'Produits' : 'Global') : 'Debloque'}</strong>
                      </div>
                    </div>

                    <div className="inv-actions">
                      <button className="inv-btn" type="button" onClick={() => navigate(`/responsable/inventaires/analyse/${activeInventory._id}`)}>
                        <ArrowRight size={16} /> Voir l'analyse
                      </button>
                      <button className="inv-btn warning" type="button" onClick={cancelInventory} disabled={!canCancelActive || isLoading}>
                        <XCircle size={16} /> Desactiver / annuler
                      </button>
                    </div>

                    <div className="inv-edit-panel">
                      <div className="inv-subhead">
                        <span><ShieldAlert size={16} /> Modifier l'inventaire en cours</span>
                        {!canEditActive ? <span className="inv-mini">Modification fermee pour ce statut</span> : null}
                      </div>

                      <div className="inv-edit-grid">
                        <label>
                          Date prevue
                          <input
                            type="date"
                            value={settingsDraft.date_prevue}
                            onChange={(e) => setSettingsDraft((p) => ({ ...p, date_prevue: e.target.value }))}
                            disabled={!canEditActive || isLoading}
                          />
                        </label>
                        <label>
                          Notifications
                          <select
                            value={settingsDraft.notifications_activees ? '1' : '0'}
                            onChange={(e) => setSettingsDraft((p) => ({ ...p, notifications_activees: e.target.value === '1' }))}
                            disabled={!canEditActive || isLoading}
                          >
                            <option value="1">Activees</option>
                            <option value="0">Desactivees</option>
                          </select>
                        </label>
                      </div>

                      <label className="inv-edit-label">Commentaire</label>
                      <textarea
                        className="inv-edit-textarea"
                        rows={3}
                        value={settingsDraft.commentaire}
                        onChange={(e) => setSettingsDraft((p) => ({ ...p, commentaire: e.target.value }))}
                        disabled={!canEditActive || isLoading}
                        placeholder="Consignes, correction de périmètre, remarque responsable..."
                      />

                      <div className="inv-edit-block">
                        <strong>Magasiniers assignes</strong>
                        <div className="inv-check-grid">
                          {(options.magasiniers || []).map((u) => {
                            const id = String(u?._id || '');
                            return (
                              <label key={id} className="inv-check-item">
                                <input
                                  type="checkbox"
                                  checked={(settingsDraft.magasinier_ids || []).includes(id)}
                                  onChange={(e) => toggleDraftMagasinier(id, e.target.checked)}
                                  disabled={!canEditActive || isLoading}
                                />
                                <span>{u?.username || '-'}</span>
                              </label>
                            );
                          })}
                          {!(options.magasiniers || []).length ? <span className="inv-mini">Aucun magasinier charge</span> : null}
                        </div>
                      </div>

                      <div className="inv-edit-block">
                        <strong>Mouvements pendant l'inventaire</strong>
                        <label className="inv-check-item strong">
                          <input
                            type="checkbox"
                            checked={settingsDraft.bloquer_mouvements}
                            onChange={(e) => setSettingsDraft((p) => ({ ...p, bloquer_mouvements: e.target.checked }))}
                            disabled={!canEditActive || isLoading}
                          />
                          <span>Bloquer les mouvements stock</span>
                        </label>

                        {settingsDraft.bloquer_mouvements ? (
                          <>
                            <div className="inv-radio-inline">
                              <label>
                                <input
                                  type="radio"
                                  checked={settingsDraft.lock_scope !== 'products'}
                                  onChange={() => setSettingsDraft((p) => ({ ...p, lock_scope: activeInventory.type_inventaire === 'GLOBAL' ? 'global' : 'auto', movement_blocked_product_ids: [] }))}
                                  disabled={!canEditActive || isLoading}
                                />
                                {activeInventory.type_inventaire === 'GLOBAL' ? 'Tout le magasin' : 'Tout le perimetre'}
                              </label>
                              <label>
                                <input
                                  type="radio"
                                  checked={settingsDraft.lock_scope === 'products'}
                                  onChange={() => setSettingsDraft((p) => ({ ...p, lock_scope: 'products' }))}
                                  disabled={!canEditActive || isLoading}
                                />
                                Produits selectionnes
                              </label>
                            </div>

                            {settingsDraft.lock_scope === 'products' ? (
                              <div className="inv-product-lock-list">
                                {inventoryLines.map((line) => {
                                  const productId = String(line.product?._id || '');
                                  if (!productId) return null;
                                  return (
                                    <label key={line._id} className="inv-check-item">
                                      <input
                                        type="checkbox"
                                        checked={(settingsDraft.movement_blocked_product_ids || []).includes(productId)}
                                        onChange={(e) => toggleLockedProduct(productId, e.target.checked)}
                                        disabled={!canEditActive || isLoading}
                                      />
                                      <span>{line.product?.code_product || '-'} - {line.product?.name || 'Produit'}</span>
                                    </label>
                                  );
                                })}
                                {!inventoryLines.length ? <span className="inv-mini">Lignes produits non chargees</span> : null}
                              </div>
                            ) : null}
                          </>
                        ) : null}
                      </div>

                      <div className="inv-actions">
                        <button className="inv-btn primary" type="button" onClick={saveInventorySettings} disabled={!canEditActive || isLoading}>
                          <Save size={16} /> Enregistrer les modifications
                        </button>
                      </div>
                    </div>

                    <div className="inv-lines">
                      <div className="inv-line">
                        <div className="inv-line-main"><strong>Périmètre</strong></div>
                        <div className="inv-line-kv">
                          <span>{perimeterLabel(activeInventory)}</span>
                        </div>
                      </div>
                      <div className="inv-line">
                        <div className="inv-line-main"><strong>Affectation</strong></div>
                        <div className="inv-line-kv">
                          <span>Magasiniers: <strong>{assignedMagasiniersLabel(activeInventory)}</strong></span>
                          <span>Date prévue: <strong>{formatDt(activeInventory.date_prevue)}</strong></span>
                        </div>
                      </div>
                      <div className="inv-line">
                        <div className="inv-line-main"><strong>Règles</strong></div>
                        <div className="inv-line-kv">
                          <span>Mouvements: <strong>{activeInventory.bloquer_mouvements ? 'bloqués' : 'non bloqués'}</strong></span>
                          <span>Notifications: <strong>{activeInventory.notifications_activees ? 'activées' : 'désactivées'}</strong></span>
                        </div>
                      </div>
                      {activeInventory.commentaire ? (
                        <div className="inv-line">
                          <div className="inv-line-main"><strong>Commentaire</strong></div>
                          <div className="inv-line-kv">
                            <span>{activeInventory.commentaire}</span>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </>
                )}
              </section>
            </div>
          </main>
        </div>
      </div>
    </ProtectedPage>
  );
};

export default InventairesResp;
