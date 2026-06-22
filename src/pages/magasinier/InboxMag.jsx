// BLOC 1 - Role du fichier.
// Ce fichier affiche une page de l'espace magasinier pour InboxMag.
// Point de vigilance: garder les props, appels API et classes CSS synchronises avec les ecrans existants.

/**
 * SENTINEL – Centre de préparation (Magasinier)
 *
 * Fidèle au rapport Sprint 4 :
 *   Consulter demandes validées → Préparer → Servir → (Demandeur confirme réception)
 *
 * Diagramme de séquence Sprint 4 :
 *   Demandeur crée → Responsable valide → MAGASINIER prépare → MAGASINIER sert
 *   → Demandeur confirme réception → Demande clôturée
 *
 * Règles métier (Sprint 3) :
 *   - Rotation automatique FIFO / FEFO selon disponibilité date péremption
 *   - Blocage sortie si stock insuffisant
 *   - Mouvement de stock créé à la confirmation du service
 *   - Traçabilité complète (historique, audit)
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  RefreshCw, Package, Inbox, X, ScanLine,
  CheckCircle, Truck, AlertTriangle,
  ClipboardList, Zap, Clock, CheckCheck,
  ShieldCheck, Hash
} from 'lucide-react';
import SidebarMag       from '../../components/magasinier/SidebarMag';
import HeaderPage       from '../../components/shared/HeaderPage';
import ProtectedPage    from '../../components/shared/ProtectedPage';
import LoadingSpinner   from '../../components/shared/LoadingSpinner';
import InlineQrScanner  from '../../components/shared/InlineQrScanner';
import { useToast }     from '../../components/shared/Toast';
import { get, patch, post } from '../../services/api';
import { normalizeRequestStatus } from '../../utils/requestStatus';
import { sanitizeText }           from '../../utils/formGuards';
import './InboxMag.css';

/* ═══════════════════════════════════════
   Helpers
═══════════════════════════════════════ */
const PRIORITY = {
  critical: { label: 'TRÈS URGENT', cls: 'critical', stripeCls: 'critical' },
  urgent:   { label: 'URGENT',      cls: 'urgent',   stripeCls: 'urgent'   },
  normal:   { label: 'NORMAL',      cls: 'normal',   stripeCls: 'normal'   },
};
function pInfo(p) { return PRIORITY[String(p||'normal').toLowerCase()] || PRIORITY.normal; }

const STATUS_MAP = {
  validated: { label: 'Validée',         cls: 'validated' },
  preparing: { label: 'En préparation',  cls: 'preparing' },
  served:    { label: 'Servie',          cls: 'served'    },
  received:  { label: 'Clôturée',        cls: 'served'    },
};
function sInfo(s) {
  const st = normalizeRequestStatus(s);
  return STATUS_MAP[st] || { label: st || '—', cls: 'warn' };
}

function demRef(id) {
  const r = String(id || '').trim();
  return r ? `DEM-${r.slice(-6).toUpperCase()}` : '—';
}

function fmt(d) {
  if (!d) return null;
  return new Date(d).toLocaleString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

/* ═══════════════════════════════════════
   Component
═══════════════════════════════════════ */
const TABS = [
  { key: 'all',       label: 'Toutes' },
  { key: 'validated', label: 'À préparer' },
  { key: 'preparing', label: 'À servir' },
];

export default function InboxMag({ userName, onLogout }) {
  const toast = useToast();

  /* layout */
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => typeof window !== 'undefined' && window.innerWidth <= 768
  );

  /* loading states */
  const [isLoading,    setIsLoading]    = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  /* filters */
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab,   setActiveTab]   = useState('all');

  /* data */
  const [inbox, setInbox] = useState({ requests: [] });

  /* scanner */
  const [scanTarget, setScanTarget] = useState('');   // 'prepare' | 'serve' | ''

  /* ── PREPARE modal state ── */
  const [prepareOpen,    setPrepareOpen]    = useState(false);
  const [prepareTarget,  setPrepareTarget]  = useState(null);
  const [prepareNote,    setPrepareNote]    = useState('');
  const [prepareLotQr,   setPrepareLotQr]   = useState('');
  const [prepareLotData, setPrepareLotData] = useState(null);   // FIFO/FEFO response
  const [prepareLotBusy, setPrepareLotBusy] = useState(false);

  /* ── SERVE modal state ── */
  const [serveOpen,    setServeOpen]    = useState(false);
  const [serveTarget,  setServeTarget]  = useState(null);
  const [serveNote,    setServeNote]    = useState('');
  const [serveLotQr,   setServeLotQr]   = useState('');
  const [serveLotData, setServeLotData] = useState(null);
  const [serveLotBusy, setServeLotBusy] = useState(false);
  const serveTs = useRef(0);

  /* ── Stock check ── */
  const insufficient = useCallback(r =>
    Number(r?.product?.stock ?? 0) < Number(r?.quantity_requested ?? 0), []);

  /* ═══ DATA ════════════════════════════════════════════════ */
  const loadInbox = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await get('/ai/magasinier-inbox');
      setInbox({ requests: Array.isArray(data?.requests) ? data.requests : [] });
    } catch (e) {
      toast.error(e.message || 'Impossible de charger les demandes');
      setInbox({ requests: [] });
    } finally { setIsLoading(false); }
  }, [toast]);

  useEffect(() => { loadInbox(); }, [loadInbox]);

  /* Fetch FIFO/FEFO lot proposal (Sprint 3 rule) */
  const fetchLot = useCallback(async (productId, target) => {
    const id = String(productId || '').trim();
    if (!id) return;
    if (target === 'prepare') setPrepareLotBusy(true);
    if (target === 'serve')   setServeLotBusy(true);
    try {
      const r = await get(`/stock/fifo/next-lot/${encodeURIComponent(id)}`);
      if (target === 'prepare') { setPrepareLotData(r || null); return r; }
      if (target === 'serve')   { setServeLotData(r || null);   return r; }
    } catch {
      if (target === 'prepare') setPrepareLotData(null);
      if (target === 'serve')   setServeLotData(null);
    } finally {
      if (target === 'prepare') setPrepareLotBusy(false);
      if (target === 'serve')   setServeLotBusy(false);
    }
  }, []);

  /* ═══ PREPARE ═════════════════════════════════════════════ */
  const openPrepare = useCallback(async r => {
    setPrepareTarget(r);
    setPrepareNote(r?.note || '');
    setPrepareLotQr('');
    setPrepareLotData(null);
    setPrepareOpen(true);
    const lot = await fetchLot(r?.product?.id, 'prepare');
    const qr  = String(lot?.next_fifo_lot?.qr_code_value || '').trim();
    if (qr) setPrepareLotQr(qr);
  }, [fetchLot]);

  const closePrepare = useCallback(() => {
    setPrepareOpen(false); setPrepareTarget(null);
    setPrepareNote(''); setPrepareLotQr(''); setPrepareLotData(null);
    if (scanTarget === 'prepare') setScanTarget('');
  }, [scanTarget]);

  /* Confirm prepare → PATCH /requests/:id/prepare */
  const confirmPrepare = useCallback(async () => {
    if (!prepareTarget?.id) return;
    const expected = String(prepareLotData?.next_fifo_lot?.qr_code_value || '').trim();
    const scanned  = String(prepareLotQr || '').trim();
    if (expected && scanned && expected !== scanned) {
      toast.error('QR lot invalide — scannez le lot proposé'); return;
    }
    setIsSubmitting(true);
    try {
      const note = sanitizeText(prepareNote, { maxLen: 600 }) || undefined;
      await patch(`/requests/${encodeURIComponent(prepareTarget.id)}/prepare`, { note });
      toast.success(`Demande ${demRef(prepareTarget.id)} mise en préparation ✓`);
      closePrepare();
      await loadInbox();
    } catch (e) { toast.error(e.message || 'Échec mise en préparation'); }
    finally { setIsSubmitting(false); }
  }, [closePrepare, loadInbox, prepareLotData, prepareLotQr, prepareNote, prepareTarget, toast]);

  /* ═══ SERVE ════════════════════════════════════════════════ */
  const openServe = useCallback(async r => {
    setServeTarget(r);
    setServeNote(''); setServeLotQr(''); setServeLotData(null);
    setServeOpen(true);
    serveTs.current = Date.now();
    const lot = await fetchLot(r?.product?.id, 'serve');
    const qr  = String(lot?.next_fifo_lot?.qr_code_value || '').trim();
    if (qr) setServeLotQr(qr);
  }, [fetchLot]);

  const closeServe = useCallback(() => {
    setServeOpen(false); setServeTarget(null);
    setServeNote(''); setServeLotQr(''); setServeLotData(null);
    if (scanTarget === 'serve') setScanTarget('');
  }, [scanTarget]);

  /**
   * Confirm serve:
   *  1. POST /stock/exits  → crée le mouvement de sortie (Sprint 3)
   *  2. PATCH /requests/:id/serve → met à jour le statut demande (Sprint 4)
   *  Notification automatique envoyée au demandeur (Sprint 4 US5)
   */
  const confirmServe = useCallback(async () => {
    if (!serveTarget?.id) return;
    if (insufficient(serveTarget)) {
      toast.error('Stock insuffisant — sortie bloquée'); return;
    }
    const expected = String(serveLotData?.next_fifo_lot?.qr_code_value || '').trim();
    const scanned  = String(serveLotQr || '').trim();
    if (expected && scanned && expected !== scanned) {
      toast.error('Lot scanné différent du lot attendu'); return;
    }
    setIsSubmitting(true);
    try {
      const note       = sanitizeText(serveNote,   { maxLen: 600 }) || undefined;
      const scannedLot = sanitizeText(serveLotQr,  { maxLen: 180 }) || undefined;
      const exit = await post('/stock/exits', {
        product:              serveTarget.product.id,
        quantity:             Number(serveTarget.quantity_requested || 0),
        submission_duration_ms: Math.max(0, Date.now() - serveTs.current),
        date_exit:            new Date().toISOString().split('T')[0],
        direction_laboratory: serveTarget.direction_laboratory || undefined,
        beneficiary:          serveTarget.demandeur            || undefined,
        demandeur:            String(serveTarget.demandeur_id  || '').trim() || undefined,
        request:              serveTarget.id,
        scanned_lot_qr:       scannedLot,
        exit_mode:            scannedLot ? 'fifo_qr' : 'manual',
        note,
      });
      await patch(`/requests/${encodeURIComponent(serveTarget.id)}/serve`, {
        stock_exit_id: exit?._id, note,
      });
      toast.success(`Demande ${demRef(serveTarget.id)} servie — stock mis à jour ✓`);
      closeServe();
      await loadInbox();
    } catch (e) { toast.error(e.message || 'Échec service demande'); }
    finally { setIsSubmitting(false); }
  }, [closeServe, insufficient, loadInbox, serveLotData, serveLotQr, serveNote, serveTarget, toast]);

  /* ═══ QR scanner ══════════════════════════════════════════ */
  const onQr = useCallback(v => {
    const val = String(v || '').trim(); if (!val) return;
    if (scanTarget === 'prepare') setPrepareLotQr(val);
    if (scanTarget === 'serve')   setServeLotQr(val);
  }, [scanTarget]);

  /* ═══ DERIVED DATA ════════════════════════════════════════ */
  const sorted = useMemo(() => {
    const w = p => p === 'critical' ? 2 : p === 'urgent' ? 1 : 0;
    return [...(inbox.requests || [])].sort((a, b) => {
      const d = w(b.priority) - w(a.priority);
      return d !== 0 ? d
        : new Date(b.validated_at || b.created_at || 0) -
          new Date(a.validated_at || a.created_at || 0);
    });
  }, [inbox.requests]);

  const filtered = useMemo(() => {
    let list = sorted;
    if (activeTab === 'validated') list = list.filter(r => normalizeRequestStatus(r.status) === 'validated');
    if (activeTab === 'preparing') list = list.filter(r => normalizeRequestStatus(r.status) === 'preparing');
    const q = searchQuery.trim().toLowerCase();
    if (!q) return list;
    return list.filter(r =>
      [demRef(r.id), r?.product?.name, r?.product?.code, r?.demandeur, r?.direction_laboratory]
        .filter(Boolean).some(x => String(x).toLowerCase().includes(q))
    );
  }, [sorted, searchQuery, activeTab]);

  const kpis = useMemo(() => {
    const items = inbox.requests || [];
    const toPrep   = items.filter(r => normalizeRequestStatus(r.status) === 'validated');
    const critical = toPrep.filter(r => String(r.priority) === 'critical').length;
    const inPrep   = items.filter(r => normalizeRequestStatus(r.status) === 'preparing');
    const ready    = inPrep.filter(r => !insufficient(r)).length;
    return {
      toPrep:  toPrep.length,
      critical,
      inPrep:  inPrep.length,
      ready,
    };
  }, [inbox.requests, insufficient]);

  /* tab counts */
  const tabCount = useMemo(() => {
    const items = inbox.requests || [];
    return {
      all:       items.length,
      validated: items.filter(r => normalizeRequestStatus(r.status) === 'validated').length,
      preparing: items.filter(r => normalizeRequestStatus(r.status) === 'preparing').length,
    };
  }, [inbox.requests]);

  /* lot display helpers */
  const lotLine = (data, busy, fallbackQr) => {
    if (busy) return { text: 'Chargement…', found: false };
    const qr = String(fallbackQr || '').trim();
    if (qr) return { text: qr, found: true };
    const lot = data?.next_fifo_lot;
    if (lot?.lot_number) return {
      text: `${lot.lot_number}${lot.qr_code_value ? ' · ' + lot.qr_code_value : ''}`,
      found: true,
      strategy: String(data?.strategy || 'FIFO').toUpperCase(),
    };
    return { text: 'Aucun lot disponible', found: false };
  };

  const prepLot = lotLine(prepareLotData, prepareLotBusy, '');
  const servLot = lotLine(serveLotData,   serveLotBusy,   serveLotQr);

  const prepMismatch =
    String(prepareLotData?.next_fifo_lot?.qr_code_value || '').trim() &&
    String(prepareLotQr  || '').trim() &&
    String(prepareLotData?.next_fifo_lot?.qr_code_value || '') !==
    String(prepareLotQr  || '');

  const servMismatch =
    String(serveLotData?.next_fifo_lot?.qr_code_value || '').trim() &&
    String(serveLotQr   || '').trim() &&
    String(serveLotData?.next_fifo_lot?.qr_code_value || '') !==
    String(serveLotQr   || '');

  /* ═══ RENDER ══════════════════════════════════════════════ */
  return (
    <ProtectedPage userName={userName}>
      <div className="cp-root">
        <SidebarMag
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed(p => !p)}
          onLogout={onLogout}
          userName={userName}
        />

        <div className={`cp-main ${sidebarCollapsed ? 'collapsed' : ''}`}>
          <HeaderPage
            userName={userName}
            title="Centre de préparation"
            subtitle="Flux de traitement des demandes internes validées"
            showSearch={false}
            onMenuClick={() => setSidebarCollapsed(p => !p)}
            onRefresh={loadInbox}
            onLogout={onLogout}
          />

          <main className="cp-page">

            {/* ══ Pipeline workflow banner (from Sprint 4 diagram) ══ */}
            <div className="cp-pipeline">
              <div className={`cp-step ${kpis.toPrep > 0 ? 'active' : ''}`}>
                <div className="cp-step-icon"><ClipboardList size={21} /></div>
                <div className="cp-step-body">
                  <span className="cp-step-count">{kpis.toPrep}</span>
                  <span className="cp-step-label">À préparer</span>
                  <span className="cp-step-sub">Demandes validées</span>
                </div>
                {kpis.critical > 0 && (
                  <span className="cp-step-crit">
                    <Zap size={11} /> {kpis.critical} critique{kpis.critical > 1 ? 's' : ''}
                  </span>
                )}
              </div>

              <div className={`cp-step ${kpis.inPrep > 0 ? 'active' : ''}`}>
                <div className="cp-step-icon"><Clock size={21} /></div>
                <div className="cp-step-body">
                  <span className="cp-step-count">{kpis.inPrep}</span>
                  <span className="cp-step-label">En préparation</span>
                  <span className="cp-step-sub">Articles en cours</span>
                </div>
              </div>

              <div className={`cp-step ${kpis.ready > 0 ? 'active' : ''}`}>
                <div className="cp-step-icon"><Truck size={21} /></div>
                <div className="cp-step-body">
                  <span className="cp-step-count">{kpis.ready}</span>
                  <span className="cp-step-label">Prêtes à servir</span>
                  <span className="cp-step-sub">Stock suffisant</span>
                </div>
              </div>

              <div className="cp-step">
                <div className="cp-step-icon"><CheckCheck size={21} /></div>
                <div className="cp-step-body">
                  <span className="cp-step-count">—</span>
                  <span className="cp-step-label">Confirmation</span>
                  <span className="cp-step-sub">En attente demandeur</span>
                </div>
              </div>
            </div>

            {/* ══ Toolbar ══ */}
            <div className="cp-toolbar">
              <div className="cp-search">
                <Package size={16} />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Rechercher demande, produit, code, demandeur…"
                />
              </div>

              <div className="cp-tabs">
                {TABS.map(t => (
                  <button
                    key={t.key}
                    className={`cp-tab ${activeTab === t.key ? 'active' : ''}`}
                    onClick={() => setActiveTab(t.key)}
                  >
                    {t.label}
                    <span className="cp-tab-badge">{tabCount[t.key] ?? 0}</span>
                  </button>
                ))}
              </div>

              <button className="cp-btn-refresh" onClick={loadInbox} disabled={isLoading || isSubmitting}>
                <span className={isLoading ? 'cp-spin' : ''}><RefreshCw size={14} /></span>
                Actualiser
              </button>
            </div>

            {/* ══ List ══ */}
            {isLoading ? (
              <LoadingSpinner message="Chargement des demandes…" />
            ) : (
              <>
                <div className="cp-section-row">
                  <span className="cp-section-title">
                    <Inbox size={16} />
                    Demandes
                  </span>
                  <span className="cp-section-count">
                    {filtered.length} résultat{filtered.length !== 1 ? 's' : ''}
                  </span>
                </div>

                {filtered.length === 0 ? (
                  <div className="cp-empty">
                    <div className="cp-empty-icon"><CheckCheck size={28} /></div>
                    <span className="cp-empty-title">Aucune demande en attente</span>
                    <span className="cp-empty-sub">
                      Les nouvelles demandes validées par le responsable apparaîtront ici pour préparation.
                    </span>
                    <button className="cp-btn cp-btn-ghost" onClick={loadInbox} disabled={isSubmitting}>
                      <RefreshCw size={14} /> Actualiser
                    </button>
                  </div>
                ) : (
                  <div className="cp-list">
                    {filtered.map(r => {
                      const st     = normalizeRequestStatus(r.status);
                      const insuff = insufficient(r);
                      const pri    = pInfo(r.priority);
                      const sta    = sInfo(r.status);
                      const stock  = Number(r.product?.stock ?? 0);
                      const qty    = Number(r.quantity_requested ?? 0);
                      const pct    = qty > 0 ? Math.min(100, Math.round((stock/qty)*100)) : 100;

                      return (
                        <div key={r.id} className="cp-card">
                          {/* Priority colour stripe (top) */}
                          <div className={`cp-card-stripe ${pri.stripeCls}`} />

                          <div className="cp-card-body">
                            {/* Row 1 */}
                            <div className="cp-card-r1">
                              <div className="cp-card-l">
                                <span className="cp-product">{r.product?.name || 'Produit'}</span>
                                <span className="cp-ref">
                                  {demRef(r.id)}
                                  {r.product?.code ? ` · ${r.product.code}` : ''}
                                </span>
                                <div className="cp-badges">
                                  <span className={`cp-prio ${pri.cls}`}>{pri.label}</span>
                                  <span className={`cp-chip ${sta.cls}`}>
                                    <span className="cp-chip-dot" />
                                    {sta.label}
                                  </span>
                                  {insuff && (
                                    <span className="cp-chip warn">
                                      <AlertTriangle size={11} /> Stock insuffisant
                                    </span>
                                  )}
                                </div>
                              </div>

                              <div className="cp-card-r">
                                <span className="cp-date">
                                  Validée : {fmt(r.validated_at) || fmt(r.created_at) || '—'}
                                </span>
                              </div>
                            </div>

                            {/* Row 2 – meta */}
                            <div className="cp-meta">
                              <div className="cp-meta-item">
                                <span className="cp-meta-lbl">Quantité</span>
                                <span className="cp-meta-val">{qty}</span>
                              </div>
                              {r.demandeur && (
                                <div className="cp-meta-item">
                                  <span className="cp-meta-lbl">Demandeur</span>
                                  <span className="cp-meta-val">{r.demandeur}</span>
                                </div>
                              )}
                              {r.direction_laboratory && (
                                <div className="cp-meta-item">
                                  <span className="cp-meta-lbl">Direction</span>
                                  <span className="cp-meta-val">{r.direction_laboratory}</span>
                                </div>
                              )}
                              <div className="cp-meta-item">
                                <span className="cp-meta-lbl">Stock disponible</span>
                                <span className={`cp-meta-val ${insuff ? 'low' : ''}`}>{stock}</span>
                                <div className="cp-sbar">
                                  <div className={`cp-sbar-fill ${insuff ? 'low' : 'ok'}`} style={{ width: `${pct}%` }} />
                                </div>
                              </div>
                            </div>

                            {/* Row 3 – actions */}
                            <div className="cp-actions">
                              {st === 'validated' && (
                                <button
                                  className="cp-btn cp-btn-prepare"
                                  onClick={() => openPrepare(r)}
                                  disabled={isSubmitting}
                                >
                                  <CheckCircle size={15} /> Préparer
                                </button>
                              )}
                              {st === 'preparing' && (
                                <button
                                  className="cp-btn cp-btn-serve"
                                  onClick={() => openServe(r)}
                                  disabled={isSubmitting || insuff}
                                >
                                  <Truck size={15} /> Servir
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}

            {/* ══════════════════════════════════════════════════
                MODAL – PRÉPARER LA DEMANDE
                Sprint 4 US4 : vérifier quantités, réserver lots,
                               préparer les produits
            ══════════════════════════════════════════════════ */}
            {prepareOpen && prepareTarget && (
              <div className="cp-backdrop" role="dialog" aria-modal="true">
                <div className="cp-modal">
                  <div className="cp-modal-bar prepare" />

                  <div className="cp-modal-head">
                    <div className="cp-modal-title-block">
                      <span className="cp-modal-title">Préparer la demande</span>
                      <span className="cp-modal-sub">
                        {prepareTarget.product?.name || 'Produit'} · {demRef(prepareTarget.id)}
                      </span>
                    </div>
                    <button className="cp-modal-close" onClick={closePrepare} disabled={isSubmitting}>
                      <X size={15} />
                    </button>
                  </div>

                  <div className="cp-modal-body">

                    {/* Workflow indicator */}
                    <div className="cp-wf-steps">
                      <span className="cp-wf-step done"><CheckCircle size={13} /> Validée</span>
                      <span className="cp-wf-arr">›</span>
                      <span className="cp-wf-step cur prepare"><ClipboardList size={13} /> Préparation</span>
                      <span className="cp-wf-arr">›</span>
                      <span className="cp-wf-step"><Truck size={13} /> Service</span>
                      <span className="cp-wf-arr">›</span>
                      <span className="cp-wf-step"><ShieldCheck size={13} /> Confirmation</span>
                    </div>

                    {/* Info grid */}
                    <div className="cp-info-grid">
                      <div className="cp-info-item">
                        <span className="cp-info-lbl">Quantité demandée</span>
                        <span className="cp-info-val">{prepareTarget.quantity_requested}</span>
                      </div>
                      <div className="cp-info-item">
                        <span className="cp-info-lbl">Stock disponible</span>
                        <span className={`cp-info-val ${insufficient(prepareTarget) ? '' : 'accent'}`}>
                          {prepareTarget.product?.stock ?? '—'}
                        </span>
                      </div>
                      <div className="cp-info-item">
                        <span className="cp-info-lbl">Règle de rotation</span>
                        <span className="cp-info-val accent">
                          {String(prepareLotData?.strategy || 'FIFO').toUpperCase()}
                        </span>
                      </div>
                      <div className="cp-info-item">
                        <span className="cp-info-lbl">Demandeur</span>
                        <span className="cp-info-val">{prepareTarget.demandeur || '—'}</span>
                      </div>
                    </div>

                    {/* Lot proposé automatiquement (FIFO/FEFO) */}
                    <div className="cp-lot-block">
                      <span className="cp-lot-title"><Hash size={14} /> Lot proposé automatiquement</span>
                      {prepareLotBusy ? (
                        <div className="cp-lot-miss"><RefreshCw size={14} className="cp-spin" /> Calcul FIFO/FEFO…</div>
                      ) : prepLot.found ? (
                        <div className="cp-lot-box">
                          <span className="cp-lot-val">{prepareLotData?.next_fifo_lot?.lot_number || prepareLotData?.next_fifo_lot?.qr_code_value}</span>
                          <span className="cp-lot-tag">{prepLot.strategy || String(prepareLotData?.strategy || 'FIFO').toUpperCase()}</span>
                        </div>
                      ) : (
                        <div className="cp-lot-miss"><AlertTriangle size={14} /> Aucun lot disponible</div>
                      )}
                    </div>

                    {/* Scanner QR lot */}
                    <div>
                      <span className="cp-field-label">
                        <ScanLine size={13} style={{ marginRight:'.3rem', verticalAlign:'middle' }} />
                        Scanner QR / Code lot
                      </span>
                      <div className="cp-qr-row">
                        <input
                          className={`cp-qr-input ${prepMismatch ? 'err' : ''}`}
                          value={prepareLotQr}
                          onChange={e => setPrepareLotQr(e.target.value)}
                          placeholder="Scanner ou saisir le QR du lot…"
                          maxLength={220}
                        />
                        <button className="cp-btn cp-btn-ghost" onClick={() => setScanTarget('prepare')} disabled={isSubmitting}>
                          <ScanLine size={14} /> Scanner
                        </button>
                      </div>
                      <p className={`cp-hint ${prepMismatch ? 'err' : ''}`}>
                        {prepMismatch
                          ? <><AlertTriangle size={12} /> QR différent du lot proposé — action bloquée</>
                          : 'Optionnel · confirme le lot proposé (FIFO/FEFO)'}
                      </p>
                    </div>

                    {scanTarget === 'prepare' && (
                      <InlineQrScanner onDetected={onQr} onClose={() => setScanTarget('')} />
                    )}

                    {/* Observation */}
                    <div>
                      <label className="cp-field-label">Observation (optionnel)</label>
                      <textarea
                        className="cp-textarea"
                        rows={3}
                        value={prepareNote}
                        onChange={e => setPrepareNote(e.target.value)}
                        placeholder="Ex : préparation effectuée, remarque particulière…"
                        maxLength={600}
                      />
                    </div>
                  </div>

                  <div className="cp-modal-foot">
                    <button className="cp-btn cp-btn-ghost" onClick={closePrepare} disabled={isSubmitting}>Annuler</button>
                    <button
                      className="cp-btn cp-btn-confirm"
                      onClick={confirmPrepare}
                      disabled={isSubmitting || !!prepMismatch}
                    >
                      <CheckCircle size={15} /> Confirmer préparation
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ══════════════════════════════════════════════════
                MODAL – SERVIR LA DEMANDE
                Sprint 4 US5 : appliquer FIFO/FEFO, créer mouvement,
                               mettre à jour le stock, notifier demandeur
            ══════════════════════════════════════════════════ */}
            {serveOpen && serveTarget && (
              <div className="cp-backdrop" role="dialog" aria-modal="true">
                <div className="cp-modal">
                  <div className="cp-modal-bar serve" />

                  <div className="cp-modal-head">
                    <div className="cp-modal-title-block">
                      <span className="cp-modal-title">Servir la demande</span>
                      <span className="cp-modal-sub">
                        {serveTarget.product?.name || 'Produit'} · {demRef(serveTarget.id)}
                      </span>
                    </div>
                    <button className="cp-modal-close" onClick={closeServe} disabled={isSubmitting}>
                      <X size={15} />
                    </button>
                  </div>

                  <div className="cp-modal-body">

                    {/* Workflow indicator */}
                    <div className="cp-wf-steps">
                      <span className="cp-wf-step done"><CheckCircle size={13} /> Validée</span>
                      <span className="cp-wf-arr">›</span>
                      <span className="cp-wf-step done"><ClipboardList size={13} /> Préparée</span>
                      <span className="cp-wf-arr">›</span>
                      <span className="cp-wf-step cur serve"><Truck size={13} /> Service</span>
                      <span className="cp-wf-arr">›</span>
                      <span className="cp-wf-step"><ShieldCheck size={13} /> Confirmation</span>
                    </div>

                    {/* Info grid */}
                    <div className="cp-info-grid">
                      <div className="cp-info-item">
                        <span className="cp-info-lbl">Quantité à servir</span>
                        <span className="cp-info-val">{serveTarget.quantity_requested}</span>
                      </div>
                      <div className="cp-info-item">
                        <span className="cp-info-lbl">Règle de rotation</span>
                        <span className="cp-info-val purple">
                          {String(serveLotData?.strategy || 'FIFO').toUpperCase()}
                        </span>
                      </div>
                      <div className="cp-info-item">
                        <span className="cp-info-lbl">Demandeur</span>
                        <span className="cp-info-val">{serveTarget.demandeur || '—'}</span>
                      </div>
                      <div className="cp-info-item">
                        <span className="cp-info-lbl">Direction / Laboratoire</span>
                        <span className="cp-info-val">{serveTarget.direction_laboratory || '—'}</span>
                      </div>
                    </div>

                    {/* Lot utilisé */}
                    <div className="cp-lot-block">
                      <span className="cp-lot-title"><Hash size={14} /> Lot utilisé</span>
                      {serveLotBusy ? (
                        <div className="cp-lot-miss"><RefreshCw size={14} className="cp-spin" /> Calcul FIFO/FEFO…</div>
                      ) : servLot.found ? (
                        <div className="cp-lot-box">
                          <span className="cp-lot-val">{serveLotData?.next_fifo_lot?.lot_number || serveLotQr || '—'}</span>
                          <span className="cp-lot-tag">{servLot.strategy || String(serveLotData?.strategy || 'FIFO').toUpperCase()}</span>
                        </div>
                      ) : (
                        <div className="cp-lot-miss"><AlertTriangle size={14} /> Aucun lot disponible</div>
                      )}
                    </div>

                    {/* Scanner QR */}
                    <div>
                      <span className="cp-field-label">
                        <ScanLine size={13} style={{ marginRight:'.3rem', verticalAlign:'middle' }} />
                        Scanner QR / Code lot
                      </span>
                      <div className="cp-qr-row">
                        <input
                          className={`cp-qr-input ${servMismatch ? 'err' : ''}`}
                          value={serveLotQr}
                          onChange={e => setServeLotQr(e.target.value)}
                          placeholder="Scanner ou saisir le QR du lot…"
                          maxLength={220}
                        />
                        <button className="cp-btn cp-btn-ghost" onClick={() => setScanTarget('serve')} disabled={isSubmitting}>
                          <ScanLine size={14} /> Scanner
                        </button>
                      </div>
                      <p className={`cp-hint ${servMismatch ? 'err' : ''}`}>
                        {servMismatch
                          ? <><AlertTriangle size={12} /> Lot scanné différent du lot attendu — action bloquée</>
                          : 'Recommandé · sécurise la traçabilité FIFO/FEFO (Sprint 3)'}
                      </p>
                    </div>

                    {scanTarget === 'serve' && (
                      <InlineQrScanner onDetected={onQr} onClose={() => setScanTarget('')} />
                    )}

                    {/* Note */}
                    <div>
                      <label className="cp-field-label">Observation (optionnel)</label>
                      <textarea
                        className="cp-textarea"
                        rows={3}
                        value={serveNote}
                        onChange={e => setServeNote(e.target.value)}
                        placeholder="Ex : service effectué, remarque de livraison…"
                        maxLength={600}
                      />
                    </div>

                    {/* Warning: stock update */}
                    <div className="cp-warn">
                      <AlertTriangle size={15} />
                      <span>
                        Cette action crée un <strong>mouvement de sortie</strong> et met à jour le stock en temps réel.
                        Une notification sera envoyée au demandeur.
                      </span>
                    </div>

                    {insufficient(serveTarget) && (
                      <div className="cp-warn danger">
                        <AlertTriangle size={15} />
                        <span>Stock insuffisant — la sortie est <strong>bloquée</strong> jusqu'à réapprovisionnement.</span>
                      </div>
                    )}
                  </div>

                  <div className="cp-modal-foot">
                    <button className="cp-btn cp-btn-ghost" onClick={closeServe} disabled={isSubmitting}>Annuler</button>
                    <button
                      className="cp-btn cp-btn-confirm"
                      onClick={confirmServe}
                      disabled={isSubmitting || insufficient(serveTarget) || !!servMismatch}
                    >
                      <Truck size={15} /> Confirmer service
                    </button>
                  </div>
                </div>
              </div>
            )}

          </main>
        </div>
      </div>
    </ProtectedPage>
  );
}
