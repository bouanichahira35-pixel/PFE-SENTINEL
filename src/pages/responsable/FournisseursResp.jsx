import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Truck,
  RefreshCw,
  Plus,
  Pencil,
  Eye,
  Power,
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import SidebarResp from '../../components/responsable/SidebarResp';
import HeaderPage from '../../components/shared/HeaderPage';
import LoadingSpinner from '../../components/shared/LoadingSpinner';
import { get, post, patch } from '../../services/api';
import { useToast } from '../../components/shared/Toast';
import { sanitizeText, isSafeText } from '../../utils/formGuards';
import './FournisseursResp.css';

function formatDate(date) {
  if (!date) return '-';
  try {
    return new Date(date).toLocaleDateString('fr-FR');
  } catch {
    return '-';
  }
}

function formatDateTime(date) {
  if (!date) return '-';
  try {
    return new Date(date).toLocaleString('fr-FR');
  } catch {
    return '-';
  }
}

function statusLabel(status) {
  const s = String(status || '').toUpperCase();
  if (s === 'ACTIF') return 'Actif';
  if (s === 'INACTIF') return 'Inactif';
  if (s === 'SUSPENDU') return 'Suspendu';
  if (s === 'A_VERIFIER') return 'À vérifier';
  return status || '-';
}

function reliabilityLabel(level) {
  const s = String(level || '').toUpperCase();
  if (s === 'FIABLE') return 'Fiable';
  if (s === 'MOYEN') return 'Moyen';
  if (s === 'A_SURVEILLER') return 'À surveiller';
  if (s === 'NON_EVALUE') return 'Non évalué';
  return level || '-';
}

function profileStateLabel(state) {
  const s = String(state || '').toLowerCase();
  if (s === 'complete') return 'Complète';
  if (s === 'incomplete') return 'Incomplète';
  if (s === 'a_verifier') return 'À vérifier';
  return state || '-';
}

function priorityPill(priority) {
  const p = String(priority || '').toUpperCase();
  if (p === 'ELEVEE') return { text: 'Élevée', className: 'pill critique' };
  if (p === 'MOYENNE') return { text: 'Moyenne', className: 'pill moyen' };
  if (p === 'FAIBLE') return { text: 'Faible', className: 'pill faible' };
  return { text: priority || '-', className: 'pill' };
}

const emptyDraft = {
  id: '',
  name: '',
  email: '',
  phone: '',
  address: '',
  domain: '',
  main_contact: '',
  internal_note: '',
  status: 'ACTIF',
  reliability_level: 'NON_EVALUE',
  last_verification_date: '',
};

const FournisseursResp = ({ userName, onLogout }) => {
  const toast = useToast();

  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => (typeof window !== 'undefined' ? window.innerWidth <= 768 : false));
  const [loading, setLoading] = useState(false);

  const [stats, setStats] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [alertsTotal, setAlertsTotal] = useState(0);

  const [suppliers, setSuppliers] = useState([]);
  const [suppliersTotal, setSuppliersTotal] = useState(0);
  const [suppliersPage, setSuppliersPage] = useState(1);
  const [suppliersLimit, setSuppliersLimit] = useState(20);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [reliabilityFilter, setReliabilityFilter] = useState('all');
  const [profileStateFilter, setProfileStateFilter] = useState('all');

  const [supplierModalOpen, setSupplierModalOpen] = useState(false);
  const [supplierModalMode, setSupplierModalMode] = useState('create'); // create | edit
  const [supplierDraft, setSupplierDraft] = useState(emptyDraft);
  const [savingSupplier, setSavingSupplier] = useState(false);

  const [duplicateModalOpen, setDuplicateModalOpen] = useState(false);
  const [duplicatePayload, setDuplicatePayload] = useState(null);
  const [duplicateList, setDuplicateList] = useState([]);
  const [duplicateMode, setDuplicateMode] = useState('create'); // create | edit

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailSupplier, setDetailSupplier] = useState(null);
  const [detailAlerts, setDetailAlerts] = useState([]);
  const [detailHistory, setDetailHistory] = useState([]);

  const supplierQuery = useMemo(() => {
    const params = new URLSearchParams();
    params.set('page', String(suppliersPage));
    params.set('limit', String(suppliersLimit));
    if (search.trim()) params.set('q', search.trim());
    if (statusFilter !== 'all') params.set('status', statusFilter);
    if (reliabilityFilter !== 'all') params.set('reliability', reliabilityFilter);
    if (profileStateFilter !== 'all') params.set('profile_state', profileStateFilter);
    return params.toString();
  }, [suppliersPage, suppliersLimit, search, statusFilter, reliabilityFilter, profileStateFilter]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [statsRes, alertsRes, suppliersRes] = await Promise.all([
        get('/suppliers/stats').catch(() => null),
        get('/supplier-alerts?status=NON_TRAITEE&limit=8').catch(() => null),
        get(`/suppliers?${supplierQuery}`).catch(() => null),
      ]);

      setStats(statsRes?.stats || null);

      const alertItems = Array.isArray(alertsRes?.items) ? alertsRes.items : [];
      setAlerts(alertItems);
      setAlertsTotal(Number(alertsRes?.total || alertItems.length || 0));

      const supplierItems = Array.isArray(suppliersRes?.items) ? suppliersRes.items : (Array.isArray(suppliersRes?.suppliers) ? suppliersRes.suppliers : []);
      setSuppliers(supplierItems);
      setSuppliersTotal(Number(suppliersRes?.total || supplierItems.length || 0));
    } catch (err) {
      toast.error(err.message || 'Chargement fournisseurs échoué');
    } finally {
      setLoading(false);
    }
  }, [supplierQuery, toast]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setSuppliersPage(1);
  }, [search, statusFilter, reliabilityFilter, profileStateFilter]);

  const openCreate = () => {
    setSupplierModalMode('create');
    setSupplierDraft({ ...emptyDraft });
    setSupplierModalOpen(true);
  };

  const openEdit = (s) => {
    setSupplierModalMode('edit');
    setSupplierDraft({
      id: s?._id || s?.id || '',
      name: s?.name || '',
      email: s?.email || '',
      phone: s?.phone || '',
      address: s?.address || '',
      domain: s?.domain || '',
      main_contact: s?.main_contact || '',
      internal_note: s?.internal_note || '',
      status: s?.status || 'ACTIF',
      reliability_level: s?.reliability_level || 'NON_EVALUE',
      last_verification_date: s?.last_verification_date ? String(s.last_verification_date).slice(0, 10) : '',
    });
    setSupplierModalOpen(true);
  };

  const openDetail = async (supplierId) => {
    const sid = String(supplierId || '').trim();
    if (!sid) return;
    setDetailOpen(true);
    setDetailLoading(true);
    setDetailSupplier(null);
    setDetailAlerts([]);
    setDetailHistory([]);
    try {
      const [detailRes, historyRes] = await Promise.all([
        get(`/suppliers/${encodeURIComponent(sid)}`),
        get(`/suppliers/${encodeURIComponent(sid)}/history?limit=25`).catch(() => ({ items: [] })),
      ]);
      setDetailSupplier(detailRes?.supplier || null);
      setDetailAlerts(Array.isArray(detailRes?.alerts) ? detailRes.alerts : []);
      setDetailHistory(Array.isArray(historyRes?.items) ? historyRes.items : []);
    } catch (err) {
      toast.error(err.message || 'Chargement fiche fournisseur échoué');
      setDetailOpen(false);
    } finally {
      setDetailLoading(false);
    }
  };

  const confirmDuplicateAndSave = async () => {
    if (!duplicatePayload) return;
    setDuplicateModalOpen(false);
    if (duplicateMode === 'create') {
      await doCreateSupplier({ ...duplicatePayload, confirm_duplicate: true });
    } else {
      await doUpdateSupplier(duplicatePayload.id, { ...duplicatePayload.payload, confirm_duplicate: true });
    }
  };

  const validateDraft = () => {
    const name = sanitizeText(supplierDraft.name || '');
    const email = sanitizeText(supplierDraft.email || '');
    const phone = sanitizeText(supplierDraft.phone || '');
    const status = String(supplierDraft.status || '').trim();

    if (!name || name.length < 2) return 'Le nom est obligatoire.';
    if (!email) return "L'email est obligatoire.";
    if (!phone) return 'Le téléphone est obligatoire.';
    if (!status) return 'Le statut est obligatoire.';
    if (!isSafeText(name, { min: 2, max: 80 })) return 'Nom invalide.';
    return null;
  };

  const buildSupplierPayloadFromDraft = () => ({
    name: sanitizeText(supplierDraft.name || ''),
    email: sanitizeText(supplierDraft.email || ''),
    phone: sanitizeText(supplierDraft.phone || ''),
    address: sanitizeText(supplierDraft.address || ''),
    domain: sanitizeText(supplierDraft.domain || ''),
    main_contact: sanitizeText(supplierDraft.main_contact || ''),
    internal_note: sanitizeText(supplierDraft.internal_note || ''),
    status: String(supplierDraft.status || 'ACTIF'),
    reliability_level: String(supplierDraft.reliability_level || 'NON_EVALUE'),
    last_verification_date: supplierDraft.last_verification_date ? supplierDraft.last_verification_date : null,
  });

  const doCreateSupplier = async (payload) => {
    setSavingSupplier(true);
    try {
      await post('/suppliers', payload);
      toast.success('Fournisseur ajouté avec succès.');
      setSupplierModalOpen(false);
      await load();
    } catch (err) {
      const code = err?.data?.code;
      if (code === 'DUPLICATE_WARNING') {
        setDuplicateMode('create');
        setDuplicatePayload(payload);
        setDuplicateList(Array.isArray(err?.data?.potential_duplicates) ? err.data.potential_duplicates : []);
        setDuplicateModalOpen(true);
        return;
      }
      toast.error(err.message || 'Création fournisseur échouée');
    } finally {
      setSavingSupplier(false);
    }
  };

  const doUpdateSupplier = async (supplierId, payload) => {
    setSavingSupplier(true);
    try {
      await patch(`/suppliers/${encodeURIComponent(supplierId)}`, payload);
      toast.success('Les informations du fournisseur ont été mises à jour.');
      setSupplierModalOpen(false);
      await load();
    } catch (err) {
      const code = err?.data?.code;
      if (code === 'DUPLICATE_WARNING') {
        setDuplicateMode('edit');
        setDuplicatePayload({ id: supplierId, payload });
        setDuplicateList(Array.isArray(err?.data?.potential_duplicates) ? err.data.potential_duplicates : []);
        setDuplicateModalOpen(true);
        return;
      }
      toast.error(err.message || 'Modification fournisseur échouée');
    } finally {
      setSavingSupplier(false);
    }
  };

  const saveSupplier = async () => {
    const validationError = validateDraft();
    if (validationError) return toast.error(validationError);

    const payload = buildSupplierPayloadFromDraft();
    if (supplierModalMode === 'edit') {
      const sid = String(supplierDraft.id || '').trim();
      if (!sid) return toast.error('Fournisseur invalide');
      await doUpdateSupplier(sid, payload);
      return;
    }
    await doCreateSupplier(payload);
  };

  const setSupplierStatus = async (supplierId, nextStatus) => {
    const sid = String(supplierId || '').trim();
    if (!sid) return;

    const st = String(nextStatus || '').trim();
    const confirmText = st === 'INACTIF'
      ? 'Ce fournisseur sera désactivé. Il ne sera plus considéré comme utilisable, mais son historique sera conservé.'
      : st === 'SUSPENDU'
        ? 'Ce fournisseur sera suspendu. Une vérification est recommandée.'
        : null;

    if (confirmText) {
      // eslint-disable-next-line no-alert
      const ok = window.confirm(confirmText);
      if (!ok) return;
    }

    try {
      await patch(`/suppliers/${encodeURIComponent(sid)}/status`, { status: st });
      if (st === 'INACTIF') toast.success('Le fournisseur a été désactivé. Son historique est conservé.');
      else if (st === 'ACTIF') toast.success('Le fournisseur a été réactivé.');
      else if (st === 'SUSPENDU') toast.success('Le fournisseur a été suspendu.');
      else if (st === 'A_VERIFIER') toast.success('Le fournisseur a été marqué comme à vérifier.');
      else toast.success('Statut mis à jour.');
      await load();
    } catch (err) {
      toast.error(err.message || 'Changement de statut échoué');
    }
  };

  const markAlertTreated = async (alertId) => {
    const id = String(alertId || '').trim();
    if (!id) return;
    try {
      await patch(`/supplier-alerts/${encodeURIComponent(id)}/status`, { status: 'TRAITEE' });
      toast.success("L'alerte fournisseur a été marquée comme traitée.");
      await load();
      if (detailOpen && (detailSupplier?._id || detailSupplier?.id)) {
        await openDetail(detailSupplier._id || detailSupplier.id);
      }
    } catch (err) {
      toast.error(err.message || "Traitement d'alerte échoué");
    }
  };

  const ignoreAlert = async (alertId) => {
    const id = String(alertId || '').trim();
    if (!id) return;
    try {
      await patch(`/supplier-alerts/${encodeURIComponent(id)}/status`, { status: 'IGNOREE' });
      toast.success("L'alerte fournisseur a été ignorée.");
      await load();
      if (detailOpen && (detailSupplier?._id || detailSupplier?.id)) {
        await openDetail(detailSupplier._id || detailSupplier.id);
      }
    } catch (err) {
      toast.error(err.message || "Ignorer l'alerte échoué");
    }
  };

  const supplierPageCount = useMemo(() => Math.max(1, Math.ceil((suppliersTotal || 0) / (suppliersLimit || 20))), [suppliersTotal, suppliersLimit]);
  const canPrev = suppliersPage > 1;
  const canNext = suppliersPage < supplierPageCount;

  return (
    <div className="resp-suppliers">
      <SidebarResp collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed((p) => !p)} onLogout={onLogout} />

      <div className={`resp-suppliers-main ${sidebarCollapsed ? 'collapsed' : ''}`}>
        <HeaderPage
          userName={userName}
          title="Gestion des fournisseurs"
          subtitle="Centralisation, contrôle et suivi du référentiel fournisseurs"
          icon={<Truck size={18} />}
          showSearch
          searchValue={search}
          onSearchChange={setSearch}
          onRefresh={load}
          onMenuClick={() => setSidebarCollapsed((p) => !p)}
        />

        <div className="resp-suppliers-page">
          {loading && (
            <div style={{ padding: 18 }}>
              <LoadingSpinner />
            </div>
          )}

          {!loading && (
            <>
              <div className="resp-suppliers-actions">
                <div className="resp-filters">
                  <label className="resp-filter">
                    <span>Statut</span>
                    <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                      <option value="all">Tous</option>
                      <option value="ACTIF">Actifs</option>
                      <option value="INACTIF">Inactifs</option>
                      <option value="SUSPENDU">Suspendus</option>
                      <option value="A_VERIFIER">À vérifier</option>
                    </select>
                  </label>
                  <label className="resp-filter">
                    <span>Fiabilité</span>
                    <select value={reliabilityFilter} onChange={(e) => setReliabilityFilter(e.target.value)}>
                      <option value="all">Tous</option>
                      <option value="FIABLE">Fiable</option>
                      <option value="MOYEN">Moyen</option>
                      <option value="A_SURVEILLER">À surveiller</option>
                      <option value="NON_EVALUE">Non évalué</option>
                    </select>
                  </label>
                  <label className="resp-filter">
                    <span>État fiche</span>
                    <select value={profileStateFilter} onChange={(e) => setProfileStateFilter(e.target.value)}>
                      <option value="all">Tous</option>
                      <option value="complete">Complète</option>
                      <option value="incomplete">Incomplète</option>
                      <option value="a_verifier">À vérifier</option>
                    </select>
                  </label>
                  <label className="resp-filter">
                    <span>Par page</span>
                    <select value={String(suppliersLimit)} onChange={(e) => setSuppliersLimit(Number(e.target.value || 20))}>
                      <option value="10">10</option>
                      <option value="20">20</option>
                      <option value="50">50</option>
                      <option value="100">100</option>
                    </select>
                  </label>
                </div>

                <div className="resp-actions-right">
                  <button type="button" className="btn" onClick={load}>
                    <RefreshCw size={16} /> Actualiser
                  </button>
                  <button type="button" className="btn primary" onClick={openCreate}>
                    <Plus size={16} /> Nouveau fournisseur
                  </button>
                </div>
              </div>

              <div className="resp-kpi-grid">
                <div className="resp-kpi">
                  <div className="resp-kpi-top">
                    <strong>Total</strong>
                    <ShieldCheck size={18} />
                  </div>
                  <div className="resp-kpi-value">{stats?.total_suppliers ?? '-'}</div>
                  <div className="muted">Fournisseurs</div>
                </div>
                <div className="resp-kpi">
                  <div className="resp-kpi-top">
                    <strong>Actifs</strong>
                    <CheckCircle2 size={18} />
                  </div>
                  <div className="resp-kpi-value">{stats?.active_suppliers ?? '-'}</div>
                  <div className="muted">Utilisables</div>
                </div>
                <div className="resp-kpi">
                  <div className="resp-kpi-top">
                    <strong>Inactifs</strong>
                    <XCircle size={18} />
                  </div>
                  <div className="resp-kpi-value">{stats?.inactive_suppliers ?? '-'}</div>
                  <div className="muted">Désactivés</div>
                </div>
                <div className="resp-kpi">
                  <div className="resp-kpi-top">
                    <strong>Alertes</strong>
                    <ShieldAlert size={18} />
                  </div>
                  <div className="resp-kpi-value">{stats?.open_alerts ?? '-'}</div>
                  <div className="muted">Non traitées</div>
                </div>
                <div className="resp-kpi">
                  <div className="resp-kpi-top">
                    <strong>Suspendus</strong>
                    <ShieldAlert size={18} />
                  </div>
                  <div className="resp-kpi-value">{stats?.suspended_suppliers ?? '-'}</div>
                  <div className="muted">Sous contrôle</div>
                </div>
                <div className="resp-kpi">
                  <div className="resp-kpi-top">
                    <strong>Fiches</strong>
                    <AlertTriangle size={18} />
                  </div>
                  <div className="resp-kpi-value">{stats?.incomplete_profiles ?? '-'}</div>
                  <div className="muted">Incomplètes</div>
                </div>
                <div className="resp-kpi">
                  <div className="resp-kpi-top">
                    <strong>À surveiller</strong>
                    <AlertTriangle size={18} />
                  </div>
                  <div className="resp-kpi-value">{stats?.watch_suppliers ?? '-'}</div>
                  <div className="muted">Fiabilité / vérif.</div>
                </div>
                <div className="resp-kpi">
                  <div className="resp-kpi-top">
                    <strong>À vérifier</strong>
                    <AlertTriangle size={18} />
                  </div>
                  <div className="resp-kpi-value">{stats?.to_verify_suppliers ?? '-'}</div>
                  <div className="muted">Statut</div>
                </div>
              </div>

              <div className="resp-suppliers-grid">
                <div className="resp-card">
                  <h3><AlertTriangle size={16} /> Alertes fournisseurs</h3>
                  {alerts.length === 0 && (
                    <div className="resp-empty">Aucune alerte non traitée.</div>
                  )}
                  {alerts.map((a) => {
                    const pill = priorityPill(a.priority);
                    const supplierName = a?.supplier?.name || a?.supplier_name || 'Fournisseur';
                    return (
                      <div className="risk-item" key={a._id}>
                        <div style={{ minWidth: 0 }}>
                          <div className="risk-name">{a.type || 'ALERTE'} <span className="muted">— {supplierName}</span></div>
                          <div className="risk-meta" title={a.message}>{a.message || '-'}</div>
                          <div className="risk-meta">
                            <span className="muted">Créée:</span> {formatDateTime(a.createdAt)}
                          </div>
                          <div className="risk-meta">
                            <button className="resp-link" type="button" onClick={() => openDetail(a?.supplier?._id || a?.supplier || '')}>Voir fournisseur</button>
                            {' · '}
                            <button className="resp-link" type="button" onClick={() => markAlertTreated(a._id)}>Marquer traitée</button>
                            {' · '}
                            <button className="resp-link" type="button" onClick={() => ignoreAlert(a._id)}>Ignorer</button>
                          </div>
                        </div>
                        <span className={pill.className}>{pill.text}</span>
                      </div>
                    );
                  })}
                  {alertsTotal > alerts.length && (
                    <div className="resp-empty">+ {alertsTotal - alerts.length} autre(s) alerte(s) non traitée(s) (voir section Alertes).</div>
                  )}
                </div>

                <div className="resp-card">
                  <div className="resp-section-head">
                    <h3 style={{ margin: 0 }}><Truck size={16} /> Fournisseurs</h3>
                    <div className="muted">
                      {suppliersTotal} résultat(s)
                    </div>
                  </div>

                  {suppliers.length === 0 && (
                    <div className="resp-empty">Aucun fournisseur trouvé avec les critères actuels.</div>
                  )}

                  {suppliers.length > 0 && (
                    <table className="orders-table">
                      <thead>
                        <tr>
                          <th>Nom</th>
                          <th>Email</th>
                          <th>Téléphone</th>
                          <th>Domaine</th>
                          <th>Statut</th>
                          <th>Fiabilité</th>
                          <th>État fiche</th>
                          <th>Dernière modif.</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {suppliers.map((s) => {
                          const sid = s?._id || s?.id;
                          const profile = String(s?.profile_state || '').toLowerCase();
                          const profileLabel = profile === 'complete'
                            ? 'Complète'
                            : profile === 'a_verifier'
                              ? 'À vérifier'
                              : 'Incomplète';
                          return (
                            <tr key={sid}>
                              <td title={s.name}>{s.name}</td>
                              <td title={s.email || ''}>{s.email || '-'}</td>
                              <td>{s.phone || '-'}</td>
                              <td>{s.domain || '-'}</td>
                              <td>{statusLabel(s.status)}</td>
                              <td>{reliabilityLabel(s.reliability_level)}</td>
                              <td>{profileLabel}</td>
                              <td>{formatDate(s.updatedAt)}</td>
                              <td>
                                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                  <button className="btn" type="button" onClick={() => openDetail(sid)} title="Voir détails">
                                    <Eye size={16} /> Voir
                                  </button>
                                  <button className="btn" type="button" onClick={() => openEdit(s)} title="Modifier">
                                    <Pencil size={16} /> Modifier
                                  </button>
                                  {String(s.status).toUpperCase() === 'ACTIF' && (
                                    <>
                                      <button className="btn" type="button" onClick={() => setSupplierStatus(sid, 'INACTIF')} title="Désactiver">
                                        <Power size={16} /> Désactiver
                                      </button>
                                      <button className="btn" type="button" onClick={() => setSupplierStatus(sid, 'SUSPENDU')} title="Suspendre">
                                        <ShieldAlert size={16} /> Suspendre
                                      </button>
                                      <button className="btn" type="button" onClick={() => setSupplierStatus(sid, 'A_VERIFIER')} title="Marquer à vérifier">
                                        <AlertTriangle size={16} /> À vérifier
                                      </button>
                                    </>
                                  )}
                                  {(String(s.status).toUpperCase() === 'INACTIF' || String(s.status).toUpperCase() === 'SUSPENDU') && (
                                    <button className="btn" type="button" onClick={() => setSupplierStatus(sid, 'ACTIF')} title="Réactiver">
                                      <ShieldCheck size={16} /> Réactiver
                                    </button>
                                  )}
                                  {String(s.status).toUpperCase() === 'A_VERIFIER' && (
                                    <button className="btn" type="button" onClick={() => setSupplierStatus(sid, 'ACTIF')} title="Valider et activer">
                                      <ShieldCheck size={16} /> Activer
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}

                  <div className="orders-toolbar" style={{ marginTop: 12 }}>
                    <div className="muted">Page {suppliersPage} / {supplierPageCount}</div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button type="button" className="btn" disabled={!canPrev} onClick={() => setSuppliersPage((p) => Math.max(1, p - 1))}>Précédent</button>
                      <button type="button" className="btn" disabled={!canNext} onClick={() => setSuppliersPage((p) => p + 1)}>Suivant</button>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {supplierModalOpen && (
        <div className="resp-modal-backdrop" role="dialog" aria-modal="true">
          <div className="resp-modal" style={{ maxWidth: 860 }}>
            <div className="resp-modal-title">
              <strong>{supplierModalMode === 'edit' ? 'Modifier fournisseur' : 'Nouveau fournisseur'}</strong>
              <span className="muted">{supplierModalMode === 'edit' ? 'Mise à jour fiche fournisseur' : 'Création fiche fournisseur'}</span>
            </div>
            <div className="resp-modal-body">
              <div className="resp-form-grid">
                <label className="resp-field">
                  <span>Nom *</span>
                  <input value={supplierDraft.name} onChange={(e) => setSupplierDraft((p) => ({ ...p, name: e.target.value }))} maxLength={80} />
                </label>
                <label className="resp-field">
                  <span>Email *</span>
                  <input value={supplierDraft.email} onChange={(e) => setSupplierDraft((p) => ({ ...p, email: e.target.value }))} maxLength={120} />
                </label>
                <label className="resp-field">
                  <span>Téléphone *</span>
                  <input value={supplierDraft.phone} onChange={(e) => setSupplierDraft((p) => ({ ...p, phone: e.target.value }))} maxLength={22} />
                </label>
                <label className="resp-field">
                  <span>Statut *</span>
                  <select value={supplierDraft.status} onChange={(e) => setSupplierDraft((p) => ({ ...p, status: e.target.value }))}>
                    <option value="ACTIF">Actif</option>
                    <option value="INACTIF">Inactif</option>
                    <option value="SUSPENDU">Suspendu</option>
                    <option value="A_VERIFIER">À vérifier</option>
                  </select>
                </label>

                <label className="resp-field resp-field-wide">
                  <span>Adresse</span>
                  <input value={supplierDraft.address} onChange={(e) => setSupplierDraft((p) => ({ ...p, address: e.target.value }))} maxLength={240} />
                </label>
                <label className="resp-field">
                  <span>Domaine / spécialité</span>
                  <input value={supplierDraft.domain} onChange={(e) => setSupplierDraft((p) => ({ ...p, domain: e.target.value }))} maxLength={80} />
                </label>
                <label className="resp-field">
                  <span>Contact principal</span>
                  <input value={supplierDraft.main_contact} onChange={(e) => setSupplierDraft((p) => ({ ...p, main_contact: e.target.value }))} maxLength={80} />
                </label>
                <label className="resp-field">
                  <span>Niveau de fiabilité</span>
                  <select value={supplierDraft.reliability_level} onChange={(e) => setSupplierDraft((p) => ({ ...p, reliability_level: e.target.value }))}>
                    <option value="FIABLE">Fiable</option>
                    <option value="MOYEN">Moyen</option>
                    <option value="A_SURVEILLER">À surveiller</option>
                    <option value="NON_EVALUE">Non évalué</option>
                  </select>
                </label>
                <label className="resp-field">
                  <span>Date dernière vérification</span>
                  <input type="date" value={supplierDraft.last_verification_date} onChange={(e) => setSupplierDraft((p) => ({ ...p, last_verification_date: e.target.value }))} />
                </label>
                <label className="resp-field resp-field-wide">
                  <span>Note interne</span>
                  <input value={supplierDraft.internal_note} onChange={(e) => setSupplierDraft((p) => ({ ...p, internal_note: e.target.value }))} maxLength={800} />
                </label>
              </div>
              <div className="resp-hint">
                Le système détecte les doublons et journalise les actions (création, modification, statut, alertes).
              </div>
            </div>
            <div className="resp-modal-footer" style={{ justifyContent: 'space-between' }}>
              <button className="btn" type="button" onClick={() => setSupplierModalOpen(false)} disabled={savingSupplier}>Annuler</button>
              <button className="btn primary" type="button" onClick={saveSupplier} disabled={savingSupplier}>
                {supplierModalMode === 'edit' ? 'Enregistrer' : 'Créer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {duplicateModalOpen && (
        <div className="resp-modal-backdrop" role="dialog" aria-modal="true">
          <div className="resp-modal" style={{ maxWidth: 860 }}>
            <div className="resp-modal-title">
              <strong>Doublon potentiel détecté</strong>
              <span className="muted">Vérifiez avant de continuer</span>
            </div>
            <div className="resp-modal-body">
              <div className="resp-empty" style={{ marginTop: 0 }}>
                Un fournisseur similaire existe déjà. Voulez-vous continuer l’enregistrement ?
              </div>
              {duplicateList.length > 0 && (
                <table className="orders-table" style={{ marginTop: 12 }}>
                  <thead>
                    <tr>
                      <th>Nom</th>
                      <th>Email</th>
                      <th>Téléphone</th>
                      <th>Statut</th>
                    </tr>
                  </thead>
                  <tbody>
                    {duplicateList.slice(0, 8).map((d) => (
                      <tr key={d.id || d._id}>
                        <td>{d.name}</td>
                        <td>{d.email || '-'}</td>
                        <td>{d.phone || '-'}</td>
                        <td>{statusLabel(d.status)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="resp-modal-footer" style={{ justifyContent: 'space-between' }}>
              <button className="btn" type="button" onClick={() => setDuplicateModalOpen(false)}>Annuler</button>
              <button className="btn primary" type="button" onClick={confirmDuplicateAndSave}>Continuer</button>
            </div>
          </div>
        </div>
      )}

      {detailOpen && (
        <div className="resp-modal-backdrop" role="dialog" aria-modal="true">
          <div className="resp-modal" style={{ maxWidth: 980 }}>
            <div className="resp-modal-title">
              <strong>Détail fournisseur</strong>
              <span className="muted">{detailSupplier?.name || ''}</span>
            </div>
            <div className="resp-modal-body">
              {detailLoading && <LoadingSpinner />}
              {!detailLoading && detailSupplier && (
                <>
                  <div className="resp-mini-grid">
                    <div className="resp-mini">
                      <div className="resp-mini-name">Informations</div>
                      <div className="risk-meta"><strong>Email:</strong> {detailSupplier.email || '-'}</div>
                      <div className="risk-meta"><strong>Tél:</strong> {detailSupplier.phone || '-'}</div>
                      <div className="risk-meta"><strong>Adresse:</strong> {detailSupplier.address || '-'}</div>
                      <div className="risk-meta"><strong>Domaine:</strong> {detailSupplier.domain || '-'}</div>
                      <div className="risk-meta"><strong>Contact:</strong> {detailSupplier.main_contact || '-'}</div>
                    </div>
                    <div className="resp-mini">
                      <div className="resp-mini-name">Statut & qualité</div>
                      <div className="risk-meta"><strong>Statut:</strong> {statusLabel(detailSupplier.status)}</div>
                      <div className="risk-meta"><strong>Fiabilité:</strong> {reliabilityLabel(detailSupplier.reliability_level)}</div>
                      <div className="risk-meta"><strong>État fiche:</strong> {profileStateLabel(detailSupplier.profile_state)}</div>
                      <div className="risk-meta"><strong>Création:</strong> {formatDateTime(detailSupplier.createdAt)}</div>
                      <div className="risk-meta"><strong>Dernière modif.:</strong> {formatDateTime(detailSupplier.updatedAt)}</div>
                      <div className="risk-meta"><strong>Dernière vérif.:</strong> {detailSupplier.last_verification_date ? formatDate(detailSupplier.last_verification_date) : '-'}</div>
                    </div>
                    <div className="resp-mini">
                      <div className="resp-mini-name">Note interne</div>
                      <div className="risk-meta" style={{ whiteSpace: 'pre-wrap' }}>{detailSupplier.internal_note || '-'}</div>
                    </div>
                  </div>

                  <div className="resp-section-head" style={{ marginTop: 14 }}>
                    <h3 style={{ margin: 0 }}><ShieldAlert size={16} /> Alertes</h3>
                  </div>
                  {detailAlerts.length === 0 && <div className="resp-empty">Aucune alerte.</div>}
                  {detailAlerts.length > 0 && (
                    <table className="orders-table">
                      <thead>
                        <tr>
                          <th>Type</th>
                          <th>Priorité</th>
                          <th>Statut</th>
                          <th>Message</th>
                          <th>Créée</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detailAlerts.slice(0, 15).map((a) => {
                          const pill = priorityPill(a.priority);
                          return (
                            <tr key={a._id}>
                              <td>{a.type}</td>
                              <td><span className={pill.className}>{pill.text}</span></td>
                              <td>{a.status}</td>
                              <td title={a.message}>{a.message || '-'}</td>
                              <td>{formatDateTime(a.createdAt)}</td>
                              <td>
                                {(a.status === 'NON_TRAITEE' || a.status === 'EN_COURS') ? (
                                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                    <button type="button" className="btn" onClick={() => markAlertTreated(a._id)}>Traiter</button>
                                    <button type="button" className="btn" onClick={() => ignoreAlert(a._id)}>Ignorer</button>
                                  </div>
                                ) : (
                                  <span className="muted">—</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}

                  <div className="resp-section-head" style={{ marginTop: 14 }}>
                    <h3 style={{ margin: 0 }}><ShieldCheck size={16} /> Historique</h3>
                  </div>
                  {detailHistory.length === 0 && <div className="resp-empty">Aucune action enregistrée.</div>}
                  {detailHistory.length > 0 && (
                    <table className="orders-table">
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Utilisateur</th>
                          <th>Action</th>
                          <th>Avant</th>
                          <th>Après</th>
                          <th>Commentaire</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detailHistory.map((h) => (
                          <tr key={h._id}>
                            <td>{formatDateTime(h.createdAt)}</td>
                            <td>{h?.user?.username || '-'}</td>
                            <td>{h.action || '-'}</td>
                            <td><span className="muted">{h.old_value ? JSON.stringify(h.old_value).slice(0, 120) : '-'}</span></td>
                            <td><span className="muted">{h.new_value ? JSON.stringify(h.new_value).slice(0, 120) : '-'}</span></td>
                            <td>{h.comment || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </>
              )}
            </div>
            <div className="resp-modal-footer">
              <button className="btn" type="button" onClick={() => setDetailOpen(false)}>Fermer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FournisseursResp;
