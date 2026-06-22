// BLOC 1 - Role du fichier.
// Ce fichier affiche une page de l'espace responsable pour FournisseursResp.
// Point de vigilance: garder les props, appels API et classes CSS synchronises avec les ecrans existants.

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Truck, RefreshCw, Plus, Pencil, Eye, Power, ShieldAlert, ShieldCheck,
  AlertTriangle, XCircle, Send, Search, Filter, ChevronLeft,
  ChevronRight, BarChart3, Clock, Mail, Phone, MapPin, User, Building2,
  Activity,
} from 'lucide-react';
import SidebarResp from '../../components/responsable/SidebarResp';
import HeaderPage from '../../components/shared/HeaderPage';
import LoadingSpinner from '../../components/shared/LoadingSpinner';
import { get, post, patch } from '../../services/api';
import { useToast } from '../../components/shared/Toast';
import { useConfirm } from '../../components/shared/ConfirmDialog';
import { sanitizeText, isSafeText } from '../../utils/formGuards';
import './FournisseursResp.css';

/* ─── helpers ─── */
const fmt = (d) => { try { return d ? new Date(d).toLocaleDateString('fr-FR') : '-'; } catch { return '-'; } };
const fmtDT = (d) => { try { return d ? new Date(d).toLocaleString('fr-FR') : '-'; } catch { return '-'; } };
const statusLabel  = (s) => ({ ACTIF:'Actif', INACTIF:'Inactif', SUSPENDU:'Suspendu', A_VERIFIER:'À vérifier' }[String(s||'').toUpperCase()] || s || '-');
const reliabilityLabel = (l) => ({ FIABLE:'Fiable', MOYEN:'Moyen', A_SURVEILLER:'À surveiller', NON_EVALUE:'Non évalué' }[String(l||'').toUpperCase()] || l || '-');
const profileStateLabel = (s) => ({ complete:'Complète', incomplete:'Incomplète', a_verifier:'À vérifier' }[String(s||'').toLowerCase()] || s || '-');

const statusClass = (s) => ({ ACTIF:'badge-actif', INACTIF:'badge-inactif', SUSPENDU:'badge-suspendu', A_VERIFIER:'badge-averifier' }[String(s||'').toUpperCase()] || '');
const reliabilityClass = (l) => ({ FIABLE:'badge-fiable', MOYEN:'badge-moyen', A_SURVEILLER:'badge-surveiller', NON_EVALUE:'badge-nonevalue' }[String(l||'').toUpperCase()] || '');
const reliabilityScore = (l) => ({ FIABLE:85, MOYEN:50, A_SURVEILLER:30, NON_EVALUE:0 }[String(l||'').toUpperCase()] || 0);

const priorityPill = (p) => ({ ELEVEE:{text:'Élevée',cls:'pill-critique'}, MOYENNE:{text:'Moyenne',cls:'pill-moyen'}, FAIBLE:{text:'Faible',cls:'pill-faible'} }[String(p||'').toUpperCase()] || {text:p||'-',cls:'pill-default'});

const emptyDraft = { id:'', name:'', email:'', phone:'', address:'', domain:'', main_contact:'', internal_note:'', status:'ACTIF', reliability_level:'NON_EVALUE', last_verification_date:'' };

/* ─── component ─── */
const FournisseursResp = ({ userName, onLogout }) => {
  const toast = useToast();
  const confirmAction = useConfirm();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => typeof window !== 'undefined' ? window.innerWidth <= 768 : false);
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
  const [domainFilter, setDomainFilter] = useState('all');

  const [supplierModalOpen, setSupplierModalOpen] = useState(false);
  const [supplierModalMode, setSupplierModalMode] = useState('create');
  const [supplierDraft, setSupplierDraft] = useState(emptyDraft);
  const [savingSupplier, setSavingSupplier] = useState(false);

  const [duplicateModalOpen, setDuplicateModalOpen] = useState(false);
  const [duplicatePayload, setDuplicatePayload] = useState(null);
  const [duplicateList, setDuplicateList] = useState([]);
  const [duplicateMode, setDuplicateMode] = useState('create');

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailSupplier, setDetailSupplier] = useState(null);
  const [detailAlerts, setDetailAlerts] = useState([]);
  const [detailHistory, setDetailHistory] = useState([]);
  const [detailTab, setDetailTab] = useState('info');

  const [aiProduct, setAiProduct] = useState('');
  const [aiCount, setAiCount] = useState(10);
  const [aiResult, setAiResult] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);

  const supplierQuery = useMemo(() => {
    const p = new URLSearchParams();
    p.set('page', String(suppliersPage));
    p.set('limit', String(suppliersLimit));
    if (search.trim()) p.set('q', search.trim());
    if (statusFilter !== 'all') p.set('status', statusFilter);
    if (reliabilityFilter !== 'all') p.set('reliability', reliabilityFilter);
    if (profileStateFilter !== 'all') p.set('profile_state', profileStateFilter);
    if (domainFilter !== 'all') p.set('domain', domainFilter);
    return p.toString();
  }, [suppliersPage, suppliersLimit, search, statusFilter, reliabilityFilter, profileStateFilter, domainFilter]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [statsRes, alertsRes, suppliersRes] = await Promise.all([
        get('/suppliers/stats').catch(() => null),
        get('/supplier-alerts?status=NON_TRAITEE&limit=8').catch(() => null),
        get(`/suppliers?${supplierQuery}`).catch(() => null),
      ]);
      setStats(statsRes?.stats || null);
      const ai = Array.isArray(alertsRes?.items) ? alertsRes.items : [];
      setAlerts(ai); setAlertsTotal(Number(alertsRes?.total || ai.length || 0));
      const si = Array.isArray(suppliersRes?.items) ? suppliersRes.items : (Array.isArray(suppliersRes?.suppliers) ? suppliersRes.suppliers : []);
      setSuppliers(si); setSuppliersTotal(Number(suppliersRes?.total || si.length || 0));
    } catch (err) { toast.error(err.message || 'Chargement fournisseurs échoué'); }
    finally { setLoading(false); }
  }, [supplierQuery, toast]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setSuppliersPage(1); }, [search, statusFilter, reliabilityFilter, profileStateFilter, domainFilter]);

  const openCreate = () => { setSupplierModalMode('create'); setSupplierDraft({...emptyDraft}); setSupplierModalOpen(true); };
  const openEdit = (s) => {
    setSupplierModalMode('edit');
    setSupplierDraft({ id:s?._id||s?.id||'', name:s?.name||'', email:s?.email||'', phone:s?.phone||'', address:s?.address||'', domain:s?.domain||'', main_contact:s?.main_contact||'', internal_note:s?.internal_note||'', status:s?.status||'ACTIF', reliability_level:s?.reliability_level||'NON_EVALUE', last_verification_date:s?.last_verification_date?String(s.last_verification_date).slice(0,10):'' });
    setSupplierModalOpen(true);
  };

  const openDetail = async (supplierId) => {
    const sid = String(supplierId||'').trim(); if (!sid) return;
    setDetailOpen(true); setDetailLoading(true); setDetailSupplier(null); setDetailAlerts([]); setDetailHistory([]); setDetailTab('info');
    try {
      const [detailRes, historyRes] = await Promise.all([
        get(`/suppliers/${encodeURIComponent(sid)}`),
        get(`/suppliers/${encodeURIComponent(sid)}/history?limit=25`).catch(() => ({items:[]})),
      ]);
      setDetailSupplier(detailRes?.supplier||null);
      setDetailAlerts(Array.isArray(detailRes?.alerts)?detailRes.alerts:[]);
      setDetailHistory(Array.isArray(historyRes?.items)?historyRes.items:[]);
    } catch (err) { toast.error(err.message||'Chargement fiche échoué'); setDetailOpen(false); }
    finally { setDetailLoading(false); }
  };

  const confirmDuplicateAndSave = async () => {
    if (!duplicatePayload) return;
    setDuplicateModalOpen(false);
    if (duplicateMode==='create') await doCreateSupplier({...duplicatePayload, confirm_duplicate:true});
    else await doUpdateSupplier(duplicatePayload.id, {...duplicatePayload.payload, confirm_duplicate:true});
  };

  const validateDraft = () => {
    const name = sanitizeText(supplierDraft.name||'');
    const email = sanitizeText(supplierDraft.email||'');
    const phone = sanitizeText(supplierDraft.phone||'');
    if (!name||name.length<2) return 'Le nom est obligatoire.';
    if (!email) return "L'email est obligatoire.";
    if (!phone) return 'Le téléphone est obligatoire.';
    if (!isSafeText(name,{min:2,max:80})) return 'Nom invalide.';
    return null;
  };

  const buildPayload = () => ({
    name: sanitizeText(supplierDraft.name||''),
    email: sanitizeText(supplierDraft.email||''),
    phone: sanitizeText(supplierDraft.phone||''),
    address: sanitizeText(supplierDraft.address||''),
    domain: sanitizeText(supplierDraft.domain||''),
    main_contact: sanitizeText(supplierDraft.main_contact||''),
    internal_note: sanitizeText(supplierDraft.internal_note||''),
    status: String(supplierDraft.status||'ACTIF'),
    reliability_level: String(supplierDraft.reliability_level||'NON_EVALUE'),
    last_verification_date: supplierDraft.last_verification_date||null,
  });

  const doCreateSupplier = async (payload) => {
    setSavingSupplier(true);
    try {
      await post('/suppliers', payload);
      toast.success('Fournisseur créé avec succès.'); setSupplierModalOpen(false); await load();
    } catch (err) {
      if (err?.data?.code==='DUPLICATE_WARNING') {
        setDuplicateMode('create'); setDuplicatePayload(payload);
        setDuplicateList(Array.isArray(err?.data?.potential_duplicates)?err.data.potential_duplicates:[]); setDuplicateModalOpen(true); return;
      }
      toast.error(err.message||'Création échouée');
    } finally { setSavingSupplier(false); }
  };

  const doUpdateSupplier = async (supplierId, payload) => {
    setSavingSupplier(true);
    try {
      await patch(`/suppliers/${encodeURIComponent(supplierId)}`, payload);
      toast.success('Fournisseur mis à jour.'); setSupplierModalOpen(false); await load();
    } catch (err) {
      if (err?.data?.code==='DUPLICATE_WARNING') {
        setDuplicateMode('edit'); setDuplicatePayload({id:supplierId,payload});
        setDuplicateList(Array.isArray(err?.data?.potential_duplicates)?err.data.potential_duplicates:[]); setDuplicateModalOpen(true); return;
      }
      toast.error(err.message||'Modification échouée');
    } finally { setSavingSupplier(false); }
  };

  const saveSupplier = async () => {
    const err = validateDraft(); if (err) return toast.error(err);
    const p = buildPayload();
    if (supplierModalMode==='edit') { const sid=String(supplierDraft.id||'').trim(); if (!sid) return toast.error('Fournisseur invalide'); await doUpdateSupplier(sid,p); return; }
    await doCreateSupplier(p);
  };

  const setSupplierStatus = async (supplierId, nextStatus) => {
    const sid = String(supplierId||'').trim(); if (!sid) return;
    const st = String(nextStatus||'').trim();
    const confirmText = st==='INACTIF' ? 'Ce fournisseur sera désactivé. Son historique sera conservé.' : st==='SUSPENDU' ? 'Ce fournisseur sera suspendu.' : null;
    if (confirmText) {
      const ok = await confirmAction({
        title: 'Changer le statut fournisseur',
        badge: 'Referentiel fournisseurs',
        message: confirmText,
        confirmLabel: 'Confirmer',
        variant: st === 'SUSPENDU' ? 'warning' : 'danger',
      });
      if (!ok) return;
    }
    try {
      await patch(`/suppliers/${encodeURIComponent(sid)}/status`, {status:st});
      toast.success(`Statut mis à jour : ${statusLabel(st)}`); await load();
    } catch (err) { toast.error(err.message||'Changement de statut échoué'); }
  };

  const markAlertTreated = async (alertId) => {
    const id = String(alertId||'').trim(); if (!id) return;
    try { await patch(`/supplier-alerts/${encodeURIComponent(id)}/status`,{status:'TRAITEE'}); toast.success('Alerte traitée.'); await load(); if (detailOpen) await openDetail(detailSupplier?._id||detailSupplier?.id); } catch (err) { toast.error(err.message); }
  };

  const ignoreAlert = async (alertId) => {
    const id = String(alertId||'').trim(); if (!id) return;
    try { await patch(`/supplier-alerts/${encodeURIComponent(id)}/status`,{status:'IGNOREE'}); toast.success('Alerte ignorée.'); await load(); if (detailOpen) await openDetail(detailSupplier?._id||detailSupplier?.id); } catch (err) { toast.error(err.message); }
  };

  const runAIRecommend = async () => {
    if (!aiProduct.trim()) return toast.error('Choisissez un produit.');
    setAiLoading(true); setAiResult(null);
    try {
      const res = await post('/suppliers/recommend', { product: aiProduct.trim(), limit: aiCount });
      setAiResult(res?.recommendations || []);
    } catch (err) { toast.error(err.message||'Analyse IA échouée'); }
    finally { setAiLoading(false); }
  };

  const supplierPageCount = useMemo(() => Math.max(1, Math.ceil((suppliersTotal||0)/(suppliersLimit||20))), [suppliersTotal, suppliersLimit]);

  /* unique domains for filter */
  const domains = useMemo(() => {
    const set = new Set(suppliers.map(s=>s.domain).filter(Boolean));
    return [...set];
  }, [suppliers]);

  /* ─── render ─── */
  return (
    <div className="resp-suppliers">
      <SidebarResp collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(p=>!p)} onLogout={onLogout} />

      <div className={`resp-suppliers-main ${sidebarCollapsed?'collapsed':''}`}>
        <HeaderPage
          userName={userName}
          title="Gestion des fournisseurs"
          subtitle="Centralisation, contrôle et suivi du référentiel fournisseurs"
          icon={<Truck size={18}/>}
          showSearch searchValue={search} onSearchChange={setSearch}
          onRefresh={load} onMenuClick={() => setSidebarCollapsed(p=>!p)}
        />

        <div className="resp-suppliers-page">
          {loading && <div className="fr-loading"><LoadingSpinner/></div>}

          {!loading && (
            <>
              {/* ─── KPI CARDS ─── */}
              <div className="fr-kpi-row">
                {[
                  { label:'Total fournisseurs', value:stats?.total_suppliers, icon:<User size={20}/>, color:'#2563eb' },
                  { label:'Fournisseurs actifs', value:stats?.active_suppliers, icon:<ShieldCheck size={20}/>, color:'#16a34a' },
                  { label:'Fournisseurs inactifs', value:stats?.inactive_suppliers, icon:<XCircle size={20}/>, color:'#9ca3af' },
                  { label:'Fournisseurs suspendus', value:stats?.suspended_suppliers, icon:<AlertTriangle size={20}/>, color:'#dc2626' },
                  { label:'Alertes non traitées', value:stats?.open_alerts, icon:<ShieldAlert size={20}/>, color:'#ea580c' },
                  { label:'Fiches incomplètes', value:stats?.incomplete_profiles, icon:<Activity size={20}/>, color:'#7c3aed' },
                  { label:'Fournisseurs à surveiller', value:stats?.watch_suppliers, icon:<BarChart3 size={20}/>, color:'#d97706' },
                  { label:'Fournisseurs à vérifier', value:stats?.to_verify_suppliers, icon:<Clock size={20}/>, color:'#0891b2' },
                ].map((k,i) => (
                  <div className="fr-kpi-card" key={i}>
                    <div className="fr-kpi-icon" style={{background:`${k.color}18`,color:k.color}}>{k.icon}</div>
                    <div className="fr-kpi-body">
                      <div className="fr-kpi-value">{k.value??'-'}</div>
                      <div className="fr-kpi-label">{k.label}</div>
                    </div>
                  </div>
                ))}
              </div>

              {/* ─── ALERTS + AI ROW ─── */}
              <div className="fr-panels-row">
                {/* Alert center */}
                <div className="fr-panel">
                  <div className="fr-panel-head">
                    <ShieldAlert size={16}/> Centre d'alertes fournisseurs
                  </div>
                  {alerts.length === 0
                    ? <div className="fr-empty">Aucune alerte prioritaire.</div>
                    : alerts.map(a => {
                        const pp = priorityPill(a.priority);
                        return (
                          <div className="fr-alert-item" key={a._id}>
                            <span className={`fr-pill ${pp.cls}`}>{pp.text}</span>
                            <div className="fr-alert-body">
                              <span className="fr-alert-type">{a.type||'ALERTE'}</span>
                              <span className="fr-alert-sup"> — {a?.supplier?.name||a?.supplier_name||''}</span>
                              <div className="fr-alert-msg">{a.message||'-'}</div>
                              <div className="fr-alert-actions">
                                <button type="button" className="fr-link" onClick={()=>openDetail(a?.supplier?._id||a?.supplier||'')}>Voir fournisseur</button>
                                <button type="button" className="fr-link" onClick={()=>markAlertTreated(a._id)}>Traiter</button>
                                <button type="button" className="fr-link" onClick={()=>ignoreAlert(a._id)}>Ignorer</button>
                              </div>
                            </div>
                          </div>
                        );
                      })
                  }
                  {alertsTotal > alerts.length && <div className="fr-empty">+{alertsTotal-alerts.length} autre(s) alerte(s)</div>}
                </div>

                {/* AI Recommend */}
                <div className="fr-panel">
                  <div className="fr-panel-head">
                    <BarChart3 size={16}/> Recommandation fournisseur (IA)
                  </div>
                  <div className="fr-ai-row">
                    <select className="fr-select" value={aiProduct} onChange={e=>setAiProduct(e.target.value)}>
                      <option value="">Choisir un produit...</option>
                      {suppliers.flatMap(s=>s.products||[]).filter((v,i,a)=>a.indexOf(v)===i).map(p=>(
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </select>
                    <input className="fr-input-small" type="number" min={1} max={50} value={aiCount} onChange={e=>setAiCount(Number(e.target.value))} />
                    <button type="button" className="fr-btn-primary" onClick={runAIRecommend} disabled={aiLoading}>
                      {aiLoading?'...':'Analyser'}
                    </button>
                  </div>
                  {aiResult && (
                    <div className="fr-ai-result">
                      {aiResult.length===0
                        ? <div className="fr-empty">Aucune recommandation.</div>
                        : aiResult.map((r,i) => (
                            <div className="fr-ai-rec" key={i}>
                              <span className="fr-ai-rank">#{i+1}</span>
                              <span>{r.name}</span>
                              <span className={`fr-badge ${reliabilityClass(r.reliability_level)}`}>{reliabilityLabel(r.reliability_level)}</span>
                            </div>
                          ))
                      }
                    </div>
                  )}
                </div>
              </div>

              {/* ─── FILTERS BAR ─── */}
              <div className="fr-filters-bar">
                <div className="fr-filters-left">
                  <div className="fr-search-wrap">
                    <Search size={15} className="fr-search-icon"/>
                    <input className="fr-search-input" placeholder="Nom, email, téléphone, domaine, produit..." value={search} onChange={e=>setSearch(e.target.value)}/>
                  </div>
                  <Filter size={15} style={{color:'#64748b'}}/>
                  <select className="fr-select" value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}>
                    <option value="all">Statut : Tous</option>
                    <option value="ACTIF">Actif</option>
                    <option value="INACTIF">Inactif</option>
                    <option value="SUSPENDU">Suspendu</option>
                    <option value="A_VERIFIER">À vérifier</option>
                  </select>
                  <select className="fr-select" value={reliabilityFilter} onChange={e=>setReliabilityFilter(e.target.value)}>
                    <option value="all">Fiabilité : Tous</option>
                    <option value="FIABLE">Fiable</option>
                    <option value="MOYEN">Moyen</option>
                    <option value="A_SURVEILLER">À surveiller</option>
                    <option value="NON_EVALUE">Non évalué</option>
                  </select>
                  <select className="fr-select" value={profileStateFilter} onChange={e=>setProfileStateFilter(e.target.value)}>
                    <option value="all">État fiche : Tous</option>
                    <option value="complete">Complète</option>
                    <option value="incomplete">Incomplète</option>
                    <option value="a_verifier">À vérifier</option>
                  </select>
                  <select className="fr-select" value={domainFilter} onChange={e=>setDomainFilter(e.target.value)}>
                    <option value="all">Domaine : Tous</option>
                    {domains.map(d=><option key={d} value={d}>{d}</option>)}
                  </select>
                  <select className="fr-select" value={String(suppliersLimit)} onChange={e=>setSuppliersLimit(Number(e.target.value))}>
                    {[10,20,50,100].map(n=><option key={n} value={n}>{n} / page</option>)}
                  </select>
                </div>
                <div className="fr-filters-right">
                  <button type="button" className="fr-btn-outline" onClick={load}><RefreshCw size={15}/> Actualiser</button>
                  <button type="button" className="fr-btn-primary" onClick={openCreate}><Plus size={15}/> Nouveau fournisseur</button>
                </div>
              </div>

              {/* ─── TABLE ─── */}
              <div className="fr-table-wrap">
                <div className="fr-table-header">
                  <span className="fr-table-title">Liste fournisseurs</span>
                  <span className="fr-table-meta">Total : {suppliersTotal} · Page {suppliersPage}/{supplierPageCount}</span>
                </div>

                {suppliers.length === 0
                  ? <div className="fr-empty" style={{padding:40}}>Aucun fournisseur trouvé avec les critères actuels.</div>
                  : (
                    <table className="fr-table">
                      <thead>
                        <tr>
                          <th>Fournisseur</th>
                          <th>Domaine</th>
                          <th>Contact</th>
                          <th>Statut</th>
                          <th>Fiabilité</th>
                          <th>Produits associés</th>
                          <th>Commandes ouvertes</th>
                          <th>Dernière vérification</th>
                          <th>Alertes</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {suppliers.map(s => {
                          const sid = s?._id||s?.id;
                          const score = reliabilityScore(s.reliability_level);
                          return (
                            <tr key={sid}>
                              <td>
                                <div className="fr-sup-name">{s.name}</div>
                                {s.address && <div className="fr-sup-sub"><MapPin size={11}/> {s.address}</div>}
                              </td>
                              <td><span className="fr-domain-tag">{s.domain||'-'}</span></td>
                              <td>
                                <div className="fr-contact-cell">
                                  <span><Mail size={12}/> {s.email||'—'}</span>
                                  <span><Phone size={12}/> {s.phone||'—'}</span>
                                </div>
                              </td>
                              <td><span className={`fr-badge ${statusClass(s.status)}`}>{statusLabel(s.status)}</span></td>
                              <td>
                                <div className="fr-reliability">
                                  <span className={`fr-badge ${reliabilityClass(s.reliability_level)}`}>{reliabilityLabel(s.reliability_level)} ({score})</span>
                                  <div className="fr-rel-bar"><div className="fr-rel-fill" style={{width:`${score}%`,background:score>=80?'#16a34a':score>=50?'#d97706':'#dc2626'}}/></div>
                                </div>
                              </td>
                              <td className="fr-center">{s.products_count||0}</td>
                              <td className="fr-center">{s.open_orders||0}</td>
                              <td>{s.last_verification_date?fmt(s.last_verification_date):'-'}</td>
                              <td className="fr-center">{s.alerts_count||0}</td>
                              <td>
                                <div className="fr-actions">
                                  <button className="fr-act-btn fr-act-view" type="button" onClick={()=>openDetail(sid)} title="Fiche"><Eye size={14}/> Fiche</button>
                                  <button className="fr-act-btn fr-act-edit" type="button" onClick={()=>openEdit(s)} title="Modifier"><Pencil size={14}/> Modifier</button>
                                  {String(s.status).toUpperCase()==='ACTIF' && (
                                    <>
                                      <button className="fr-act-btn fr-act-order" type="button" title="Commande"><Plus size={14}/> Commande</button>
                                      <button className="fr-act-btn fr-act-msg" type="button" title="Message"><Send size={14}/> Message</button>
                                      <button className="fr-act-btn fr-act-suspend" type="button" onClick={()=>setSupplierStatus(sid,'SUSPENDU')} title="Suspendre"><Power size={14}/> Suspendre</button>
                                    </>
                                  )}
                                  {(String(s.status).toUpperCase()==='INACTIF'||String(s.status).toUpperCase()==='SUSPENDU') && (
                                    <button className="fr-act-btn fr-act-activate" type="button" onClick={()=>setSupplierStatus(sid,'ACTIF')}><ShieldCheck size={14}/> Réactiver</button>
                                  )}
                                  {String(s.status).toUpperCase()==='A_VERIFIER' && (
                                    <button className="fr-act-btn fr-act-activate" type="button" onClick={()=>setSupplierStatus(sid,'ACTIF')}><ShieldCheck size={14}/> Activer</button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )
                }

                <div className="fr-pagination">
                  <span className="fr-page-info">Page {suppliersPage} / {supplierPageCount}</span>
                  <div className="fr-page-btns">
                    <button type="button" className="fr-page-btn" disabled={suppliersPage<=1} onClick={()=>setSuppliersPage(p=>Math.max(1,p-1))}><ChevronLeft size={16}/> Précédent</button>
                    <button type="button" className="fr-page-btn" disabled={suppliersPage>=supplierPageCount} onClick={()=>setSuppliersPage(p=>p+1)}>Suivant <ChevronRight size={16}/></button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ─── CREATE / EDIT MODAL ─── */}
      {supplierModalOpen && (
        <div className="fr-overlay" role="dialog" aria-modal="true">
          <div className="fr-modal">
            <div className="fr-modal-head">
              <div>
                <div className="fr-modal-title">{supplierModalMode==='edit'?'Modifier le fournisseur':'Nouveau fournisseur'}</div>
                <div className="fr-modal-sub">{supplierModalMode==='edit'?'Mise à jour de la fiche fournisseur':'Création d\'une nouvelle fiche fournisseur'}</div>
              </div>
              <button type="button" className="fr-close" onClick={()=>setSupplierModalOpen(false)}>✕</button>
            </div>
            <div className="fr-modal-body">
              <div className="fr-form-section">Informations principales *</div>
              <div className="fr-form-grid">
                {[
                  {label:'Nom *',key:'name',type:'text',max:80},
                  {label:'Email *',key:'email',type:'email',max:120},
                  {label:'Téléphone *',key:'phone',type:'text',max:22},
                  {label:'Contact principal',key:'main_contact',type:'text',max:80},
                ].map(f=>(
                  <label className="fr-field" key={f.key}>
                    <span>{f.label}</span>
                    <input type={f.type} value={supplierDraft[f.key]} maxLength={f.max} onChange={e=>setSupplierDraft(p=>({...p,[f.key]:e.target.value}))}/>
                  </label>
                ))}
                <label className="fr-field fr-field-wide">
                  <span>Adresse</span>
                  <input type="text" value={supplierDraft.address} maxLength={240} onChange={e=>setSupplierDraft(p=>({...p,address:e.target.value}))}/>
                </label>
                <label className="fr-field">
                  <span>Domaine / spécialité</span>
                  <input type="text" value={supplierDraft.domain} maxLength={80} onChange={e=>setSupplierDraft(p=>({...p,domain:e.target.value}))}/>
                </label>
              </div>
              <div className="fr-form-section">Qualification</div>
              <div className="fr-form-grid">
                <label className="fr-field">
                  <span>Statut *</span>
                  <select value={supplierDraft.status} onChange={e=>setSupplierDraft(p=>({...p,status:e.target.value}))}>
                    <option value="ACTIF">Actif</option>
                    <option value="INACTIF">Inactif</option>
                    <option value="SUSPENDU">Suspendu</option>
                    <option value="A_VERIFIER">À vérifier</option>
                  </select>
                </label>
                <label className="fr-field">
                  <span>Niveau de fiabilité</span>
                  <select value={supplierDraft.reliability_level} onChange={e=>setSupplierDraft(p=>({...p,reliability_level:e.target.value}))}>
                    <option value="FIABLE">Fiable</option>
                    <option value="MOYEN">Moyen</option>
                    <option value="A_SURVEILLER">À surveiller</option>
                    <option value="NON_EVALUE">Non évalué</option>
                  </select>
                </label>
                <label className="fr-field">
                  <span>Date dernière vérification</span>
                  <input type="date" value={supplierDraft.last_verification_date} onChange={e=>setSupplierDraft(p=>({...p,last_verification_date:e.target.value}))}/>
                </label>
                <label className="fr-field fr-field-wide">
                  <span>Note interne</span>
                  <textarea rows={3} value={supplierDraft.internal_note} maxLength={800} onChange={e=>setSupplierDraft(p=>({...p,internal_note:e.target.value}))} style={{resize:'vertical'}}/>
                </label>
              </div>
              <div className="fr-form-hint">Le système détecte les doublons et journalise toutes les actions (création, modification, statut).</div>
            </div>
            <div className="fr-modal-foot">
              <button type="button" className="fr-btn-outline" onClick={()=>setSupplierModalOpen(false)} disabled={savingSupplier}>Annuler</button>
              <button type="button" className="fr-btn-primary" onClick={saveSupplier} disabled={savingSupplier}>
                {savingSupplier?'Enregistrement...':(supplierModalMode==='edit'?'Enregistrer':'Créer le fournisseur')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── DUPLICATE MODAL ─── */}
      {duplicateModalOpen && (
        <div className="fr-overlay" role="dialog" aria-modal="true">
          <div className="fr-modal">
            <div className="fr-modal-head">
              <div>
                <div className="fr-modal-title">⚠ Doublon potentiel détecté</div>
                <div className="fr-modal-sub">Vérifiez avant de continuer</div>
              </div>
            </div>
            <div className="fr-modal-body">
              <p style={{margin:'0 0 12px',color:'#64748b'}}>Un fournisseur similaire existe déjà dans le système. Souhaitez-vous continuer l'enregistrement ?</p>
              {duplicateList.length > 0 && (
                <table className="fr-table">
                  <thead><tr><th>Nom</th><th>Email</th><th>Téléphone</th><th>Statut</th></tr></thead>
                  <tbody>
                    {duplicateList.slice(0,8).map(d=>(
                      <tr key={d.id||d._id}><td>{d.name}</td><td>{d.email||'-'}</td><td>{d.phone||'-'}</td><td><span className={`fr-badge ${statusClass(d.status)}`}>{statusLabel(d.status)}</span></td></tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="fr-modal-foot">
              <button type="button" className="fr-btn-outline" onClick={()=>setDuplicateModalOpen(false)}>Annuler</button>
              <button type="button" className="fr-btn-primary" onClick={confirmDuplicateAndSave}>Continuer malgré tout</button>
            </div>
          </div>
        </div>
      )}

      {/* ─── DETAIL MODAL ─── */}
      {detailOpen && (
        <div className="fr-overlay" role="dialog" aria-modal="true">
          <div className="fr-modal fr-modal-xl">
            <div className="fr-modal-head">
              <div>
                <div className="fr-modal-title">Fiche fournisseur</div>
                <div className="fr-modal-sub">{detailSupplier?.name||'Chargement...'}</div>
              </div>
              <button type="button" className="fr-close" onClick={()=>setDetailOpen(false)}>✕</button>
            </div>
            <div className="fr-modal-tabs">
              {['info','alertes','historique'].map(t=>(
                <button key={t} type="button" className={`fr-tab ${detailTab===t?'active':''}`} onClick={()=>setDetailTab(t)}>
                  {t==='info'?'Informations':t==='alertes'?`Alertes (${detailAlerts.length})`:`Historique (${detailHistory.length})`}
                </button>
              ))}
            </div>
            <div className="fr-modal-body">
              {detailLoading && <div style={{padding:40,textAlign:'center'}}><LoadingSpinner/></div>}
              {!detailLoading && detailSupplier && (
                <>
                  {detailTab==='info' && (
                    <div className="fr-detail-grid">
                      <div className="fr-detail-card">
                        <div className="fr-detail-card-title"><Building2 size={15}/> Coordonnées</div>
                        <div className="fr-detail-row"><Mail size={13}/><span>{detailSupplier.email||'-'}</span></div>
                        <div className="fr-detail-row"><Phone size={13}/><span>{detailSupplier.phone||'-'}</span></div>
                        <div className="fr-detail-row"><MapPin size={13}/><span>{detailSupplier.address||'-'}</span></div>
                        <div className="fr-detail-row"><Building2 size={13}/><span>{detailSupplier.domain||'-'}</span></div>
                        <div className="fr-detail-row"><User size={13}/><span>{detailSupplier.main_contact||'-'}</span></div>
                      </div>
                      <div className="fr-detail-card">
                        <div className="fr-detail-card-title"><ShieldCheck size={15}/> Qualification</div>
                        <div className="fr-detail-row"><span className="fr-detail-lbl">Statut</span><span className={`fr-badge ${statusClass(detailSupplier.status)}`}>{statusLabel(detailSupplier.status)}</span></div>
                        <div className="fr-detail-row"><span className="fr-detail-lbl">Fiabilité</span><span className={`fr-badge ${reliabilityClass(detailSupplier.reliability_level)}`}>{reliabilityLabel(detailSupplier.reliability_level)}</span></div>
                        <div className="fr-detail-row"><span className="fr-detail-lbl">État fiche</span><span>{profileStateLabel(detailSupplier.profile_state)}</span></div>
                        <div className="fr-detail-row"><span className="fr-detail-lbl">Dernière vérif.</span><span>{detailSupplier.last_verification_date?fmt(detailSupplier.last_verification_date):'-'}</span></div>
                        <div className="fr-detail-row"><span className="fr-detail-lbl">Créé le</span><span>{fmtDT(detailSupplier.createdAt)}</span></div>
                        <div className="fr-detail-row"><span className="fr-detail-lbl">Modifié le</span><span>{fmtDT(detailSupplier.updatedAt)}</span></div>
                      </div>
                      <div className="fr-detail-card fr-detail-card-wide">
                        <div className="fr-detail-card-title">Note interne</div>
                        <p style={{margin:0,whiteSpace:'pre-wrap',color:'#374151',lineHeight:1.6}}>{detailSupplier.internal_note||'Aucune note.'}</p>
                      </div>
                    </div>
                  )}

                  {detailTab==='alertes' && (
                    detailAlerts.length===0
                      ? <div className="fr-empty" style={{padding:40}}>Aucune alerte pour ce fournisseur.</div>
                      : <table className="fr-table">
                          <thead><tr><th>Type</th><th>Priorité</th><th>Statut</th><th>Message</th><th>Date</th><th>Action</th></tr></thead>
                          <tbody>
                            {detailAlerts.slice(0,15).map(a=>{
                              const pp=priorityPill(a.priority);
                              return (
                                <tr key={a._id}>
                                  <td>{a.type}</td>
                                  <td><span className={`fr-pill ${pp.cls}`}>{pp.text}</span></td>
                                  <td>{a.status}</td>
                                  <td title={a.message}>{a.message||'-'}</td>
                                  <td>{fmtDT(a.createdAt)}</td>
                                  <td>
                                    {(a.status==='NON_TRAITEE'||a.status==='EN_COURS')
                                      ? <div style={{display:'flex',gap:6}}>
                                          <button type="button" className="fr-btn-outline" style={{padding:'2px 8px',fontSize:12}} onClick={()=>markAlertTreated(a._id)}>Traiter</button>
                                          <button type="button" className="fr-btn-outline" style={{padding:'2px 8px',fontSize:12}} onClick={()=>ignoreAlert(a._id)}>Ignorer</button>
                                        </div>
                                      : <span style={{color:'#9ca3af'}}>—</span>
                                    }
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                  )}

                  {detailTab==='historique' && (
                    detailHistory.length===0
                      ? <div className="fr-empty" style={{padding:40}}>Aucune action enregistrée.</div>
                      : <table className="fr-table">
                          <thead><tr><th>Date</th><th>Utilisateur</th><th>Action</th><th>Avant</th><th>Après</th><th>Commentaire</th></tr></thead>
                          <tbody>
                            {detailHistory.map(h=>(
                              <tr key={h._id}>
                                <td style={{whiteSpace:'nowrap'}}>{fmtDT(h.createdAt)}</td>
                                <td>{h?.user?.username||'-'}</td>
                                <td><span className="fr-domain-tag">{h.action||'-'}</span></td>
                                <td><span style={{color:'#9ca3af',fontSize:12}}>{h.old_value?JSON.stringify(h.old_value).slice(0,100):'-'}</span></td>
                                <td><span style={{color:'#374151',fontSize:12}}>{h.new_value?JSON.stringify(h.new_value).slice(0,100):'-'}</span></td>
                                <td>{h.comment||'-'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                  )}
                </>
              )}
            </div>
            <div className="fr-modal-foot">
              <button type="button" className="fr-btn-outline" onClick={()=>setDetailOpen(false)}>Fermer</button>
              {detailSupplier && <button type="button" className="fr-btn-primary" onClick={()=>{setDetailOpen(false);openEdit(detailSupplier);}}><Pencil size={14}/> Modifier</button>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FournisseursResp;
