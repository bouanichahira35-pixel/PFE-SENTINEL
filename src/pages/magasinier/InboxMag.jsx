import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RefreshCw, CheckCircle, Truck, Package, AlertTriangle, ScanLine } from 'lucide-react';
import SidebarMag from '../../components/magasinier/SidebarMag';
import HeaderPage from '../../components/shared/HeaderPage';
import ProtectedPage from '../../components/shared/ProtectedPage';
import LoadingSpinner from '../../components/shared/LoadingSpinner';
import InlineQrScanner from '../../components/shared/InlineQrScanner';
import { useToast } from '../../components/shared/Toast';
import { get, patch, post } from '../../services/api';
import { normalizeRequestStatus } from '../../utils/requestStatus';
import { sanitizeText } from '../../utils/formGuards';
import './InboxMag.css';

function priorityPill(priority) {
  const p = String(priority || 'normal').toLowerCase();
  if (p === 'critical') return { label: 'TRES URGENT', className: 'critique' };
  if (p === 'urgent') return { label: 'URGENT', className: 'moyen' };
  return { label: 'NORMAL', className: 'faible' };
}

function requestRef(id) {
  const raw = String(id || '').trim();
  if (!raw) return '-';
  return `DEM-${raw.slice(-6).toUpperCase()}`;
}

function requestStatusInfo(status) {
  const st = normalizeRequestStatus(status);
  if (st === 'validated') return { label: 'Validee', className: 'validated' };
  if (st === 'preparing') return { label: 'En preparation', className: 'preparing' };
  if (st === 'served') return { label: 'Servie', className: 'served' };
  if (st === 'received') return { label: 'Cloturee', className: 'served' };
  return { label: st || '-', className: 'default' };
}

const InboxMag = ({ userName, onLogout }) => {
  const toast = useToast();

  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => (typeof window !== 'undefined' ? window.innerWidth <= 768 : false));
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [scanTarget, setScanTarget] = useState('');

  const [inbox, setInbox] = useState(() => ({
    requests: [],
    generated_at: null,
  }));

  const [prepareModalOpen, setPrepareModalOpen] = useState(false);
  const [prepareTarget, setPrepareTarget] = useState(null);
  const [prepareNote, setPrepareNote] = useState('');
  const [prepareLotQr, setPrepareLotQr] = useState('');
  const [prepareLotInfo, setPrepareLotInfo] = useState(null);
  const [prepareLotLoading, setPrepareLotLoading] = useState(false);

  const [serveModalOpen, setServeModalOpen] = useState(false);
  const [serveTarget, setServeTarget] = useState(null);
  const [serveNote, setServeNote] = useState('');
  const [serveLotQr, setServeLotQr] = useState('');
  const [serveLotInfo, setServeLotInfo] = useState(null);
  const [serveLotLoading, setServeLotLoading] = useState(false);
  const serveOpenedAtRef = useRef(0);

  const isInsufficientStock = useCallback((reqItem) => {
    const stock = Number(reqItem?.product?.stock || 0);
    const qty = Number(reqItem?.quantity_requested || 0);
    return stock < qty;
  }, []);

  const loadInbox = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await get('/ai/magasinier-inbox');
      setInbox({
        requests: Array.isArray(data?.requests) ? data.requests : [],
        generated_at: data?.generated_at || null,
      });
    } catch (err) {
      toast.error(err.message || 'Impossible de charger la boite de reception');
      setInbox({ requests: [], generated_at: null });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadInbox();
  }, [loadInbox]);

  const loadLotProposal = useCallback(async (productId, options = {}) => {
    const id = String(productId || '').trim();
    if (!id) return null;
    try {
      const fifo = await get(`/stock/fifo/next-lot/${encodeURIComponent(id)}`);
      if (options.target === 'prepare') setPrepareLotInfo(fifo || null);
      if (options.target === 'serve') setServeLotInfo(fifo || null);
      return fifo || null;
    } catch {
      if (options.target === 'prepare') setPrepareLotInfo(null);
      if (options.target === 'serve') setServeLotInfo(null);
      return null;
    } finally {
      if (options.target === 'prepare') setPrepareLotLoading(false);
      if (options.target === 'serve') setServeLotLoading(false);
    }
  }, []);

  const openPrepareModal = useCallback(async (reqItem) => {
    if (!reqItem?.id || !reqItem?.product?.id) return;
    setPrepareTarget(reqItem);
    setPrepareNote(reqItem?.note || '');
    setPrepareLotQr('');
    setPrepareLotInfo(null);
    setPrepareModalOpen(true);

    setPrepareLotLoading(true);
    const fifo = await loadLotProposal(reqItem.product.id, { target: 'prepare' });
    const suggestedQr = String(fifo?.next_fifo_lot?.qr_code_value || '').trim();
    if (suggestedQr) setPrepareLotQr(suggestedQr);
  }, [loadLotProposal]);

  const closePrepareModal = useCallback(() => {
    setPrepareModalOpen(false);
    setPrepareTarget(null);
    setPrepareNote('');
    setPrepareLotQr('');
    setPrepareLotInfo(null);
    setPrepareLotLoading(false);
    if (scanTarget === 'prepare') setScanTarget('');
  }, [scanTarget]);

  const confirmPrepare = useCallback(async () => {
    if (!prepareTarget?.id) return;
    const note = sanitizeText(prepareNote, { maxLen: 600 }) || undefined;
    const expected = String(prepareLotInfo?.next_fifo_lot?.qr_code_value || '').trim();
    const scanned = String(prepareLotQr || '').trim();
    if (expected && scanned && expected !== scanned) {
      toast.error('QR lot invalide: scannez le lot propose');
      return;
    }

    setIsSubmitting(true);
    try {
      await patch(`/requests/${encodeURIComponent(prepareTarget.id)}/prepare`, { note });
      toast.success('Demande mise en preparation');
      closePrepareModal();
      await loadInbox();
    } catch (err) {
      toast.error(err.message || 'Echec preparation demande');
    } finally {
      setIsSubmitting(false);
    }
  }, [closePrepareModal, loadInbox, prepareLotInfo, prepareLotQr, prepareNote, prepareTarget, toast]);

  const openServeModal = useCallback(async (reqItem) => {
    if (!reqItem?.id || !reqItem?.product?.id) return;
    setServeTarget(reqItem);
    setServeNote('');
    setServeLotQr('');
    setServeLotInfo(null);
    setServeModalOpen(true);
    serveOpenedAtRef.current = Date.now();

    setServeLotLoading(true);
    const fifo = await loadLotProposal(reqItem.product.id, { target: 'serve' });
    const suggestedQr = String(fifo?.next_fifo_lot?.qr_code_value || '').trim();
    if (suggestedQr) setServeLotQr(suggestedQr);
  }, [loadLotProposal]);

  const closeServeModal = useCallback(() => {
    setServeModalOpen(false);
    setServeTarget(null);
    setServeNote('');
    setServeLotQr('');
    setServeLotInfo(null);
    setServeLotLoading(false);
    if (scanTarget === 'serve') setScanTarget('');
  }, [scanTarget]);

  const confirmServe = useCallback(async () => {
    if (!serveTarget?.id || !serveTarget?.product?.id) return;
    if (isInsufficientStock(serveTarget)) {
      toast.error('Stock insuffisant pour servir cette demande');
      return;
    }

    const note = sanitizeText(serveNote, { maxLen: 600 }) || undefined;
    const scannedLot = sanitizeText(serveLotQr, { maxLen: 180 }) || undefined;
    const expected = String(serveLotInfo?.next_fifo_lot?.qr_code_value || '').trim();
    if (expected && scannedLot && expected !== scannedLot) {
      toast.error('Lot scanne invalide: veuillez scanner le lot attendu');
      return;
    }

    setIsSubmitting(true);
    try {
      const demandeurId = String(serveTarget.demandeur_id || '').trim();
      const createdExit = await post('/stock/exits', {
        product: serveTarget.product.id,
        quantity: Number(serveTarget.quantity_requested || 0),
        submission_duration_ms: Math.max(0, Date.now() - (serveOpenedAtRef.current || Date.now())),
        date_exit: new Date().toISOString().split('T')[0],
        direction_laboratory: serveTarget.direction_laboratory || undefined,
        beneficiary: serveTarget.demandeur || undefined,
        demandeur: demandeurId || undefined,
        request: serveTarget.id,
        scanned_lot_qr: scannedLot,
        exit_mode: scannedLot ? 'fifo_qr' : 'manual',
        note,
      });

      await patch(`/requests/${encodeURIComponent(serveTarget.id)}/serve`, {
        stock_exit_id: createdExit?._id,
        note,
      });

      toast.success('Demande servie: stock mis a jour');
      closeServeModal();
      await loadInbox();
    } catch (err) {
      toast.error(err.message || 'Echec service demande');
    } finally {
      setIsSubmitting(false);
    }
  }, [closeServeModal, isInsufficientStock, loadInbox, serveLotInfo, serveLotQr, serveNote, serveTarget, toast]);

  const requestsSorted = useMemo(() => {
    const weight = (p) => (p === 'critical' ? 2 : p === 'urgent' ? 1 : 0);
    return [...(inbox.requests || [])].sort((a, b) => {
      const d = weight(b.priority) - weight(a.priority);
      if (d !== 0) return d;
      const bDate = b.validated_at || b.created_at || 0;
      const aDate = a.validated_at || a.created_at || 0;
      return new Date(bDate).getTime() - new Date(aDate).getTime();
    });
  }, [inbox.requests]);

  const filteredRequests = useMemo(() => {
    const q = String(searchQuery || '').trim().toLowerCase();
    if (!q) return requestsSorted;
    return requestsSorted.filter((r) => {
      const parts = [
        requestRef(r.id),
        r?.product?.name,
        r?.product?.code,
        r?.demandeur,
        r?.direction_laboratory,
        r?.status,
        r?.priority_label,
      ].filter(Boolean).map((x) => String(x).toLowerCase());
      return parts.some((p) => p.includes(q));
    });
  }, [requestsSorted, searchQuery]);

  const kpis = useMemo(() => {
    const items = inbox.requests || [];
    const toPrepare = items.filter((r) => normalizeRequestStatus(r.status) === 'validated').length;
    const critical = items.filter((r) => ['validated', 'preparing'].includes(normalizeRequestStatus(r.status)) && String(r.priority) === 'critical').length;
    const preparing = items.filter((r) => normalizeRequestStatus(r.status) === 'preparing').length;
    const readyToServe = items.filter((r) => normalizeRequestStatus(r.status) === 'preparing' && !isInsufficientStock(r)).length;
    return { toPrepare, critical, preparing, readyToServe };
  }, [inbox.requests, isInsufficientStock]);

  const onDetectedQr = useCallback((value) => {
    const v = String(value || '').trim();
    if (!v) return;
    if (scanTarget === 'prepare') setPrepareLotQr(v);
    if (scanTarget === 'serve') setServeLotQr(v);
  }, [scanTarget]);

  const prepareStrategyLabel = String(prepareLotInfo?.strategy || 'fifo').toUpperCase();
  const serveStrategyLabel = String(serveLotInfo?.strategy || 'fifo').toUpperCase();

  return (
    <ProtectedPage userName={userName}>
      <div className="inboxmag-root">
        <SidebarMag
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed((p) => !p)}
          onLogout={onLogout}
          userName={userName}
        />

        <div className={`inboxmag-main ${sidebarCollapsed ? 'collapsed' : ''}`}>
          <HeaderPage
            userName={userName}
            title="Centre de préparation"
            subtitle="Demandes validees, preparation et service des articles"
            showSearch={false}
            onMenuClick={() => setSidebarCollapsed((p) => !p)}
            onRefresh={loadInbox}
            onLogout={onLogout}
          />

          <main className="inboxmag-page">
            <div className="inboxmag-top">
              <div className="inboxmag-toolbar">
                <div className="inboxmag-search">
                  <Package size={18} aria-hidden="true" />
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Rechercher une demande, produit, code, demandeur..."
                    aria-label="Rechercher"
                  />
                </div>
                <button className="inboxmag-refresh" type="button" onClick={loadInbox} disabled={isLoading || isSubmitting}>
                  <RefreshCw size={16} /> Actualiser
                </button>
              </div>

              <div className="inboxmag-kpis">
                <div className="inboxmag-kpi">
                  <span>Demandes a preparer</span>
                  <strong>{kpis.toPrepare}</strong>
                </div>
                <div className="inboxmag-kpi">
                  <span>Tres urgentes</span>
                  <strong>{kpis.critical}</strong>
                </div>
                <div className="inboxmag-kpi">
                  <span>En preparation</span>
                  <strong>{kpis.preparing}</strong>
                </div>
                <div className="inboxmag-kpi">
                  <span>Pretes a servir</span>
                  <strong>{kpis.readyToServe}</strong>
                </div>
              </div>
            </div>

            {isLoading ? (
              <LoadingSpinner message="Chargement..." />
            ) : (
              <section className="inboxmag-card inboxmag-requests">
                <div className="inboxmag-card-head">
                  <h3><Package size={18} /> Demandes validees</h3>
                  <small>Preparation et service</small>
                </div>

                {!filteredRequests.length ? (
                  <div className="inboxmag-empty inboxmag-empty-card">
                    <div className="inboxmag-empty-title">Toutes les demandes validees sont traitees.</div>
                    <div className="inboxmag-empty-sub">Les nouvelles demandes validees par le responsable apparaitront ici.</div>
                    <button className="inboxmag-btn primary" type="button" onClick={loadInbox} disabled={isSubmitting}>
                      <RefreshCw size={15} /> Actualiser
                    </button>
                  </div>
                ) : (
                  <div className="inboxmag-list">
                    {filteredRequests.map((r) => {
                      const insufficient = isInsufficientStock(r);
                      const pill = priorityPill(r.priority);
                      const st = requestStatusInfo(r.status);
                      const validatedAt = r.validated_at ? new Date(r.validated_at).toLocaleString('fr-FR') : null;

                      return (
                        <div key={r.id} className={`inboxmag-item inboxmag-request ${insufficient ? 'insufficient' : ''}`}>
                          <div className="inboxmag-item-top">
                            <div className="inboxmag-title">
                              <strong>{r.product?.name || 'Produit'}</strong>
                              <span>{requestRef(r.id)}</span>
                              <span className={`inboxmag-pill ${pill.className}`}>{pill.label}</span>
                              <span className={`inboxmag-status ${st.className}`}>{st.label}</span>
                              {insufficient ? <span className="inboxmag-status insufficient">Stock insuffisant</span> : null}
                            </div>
                            <span className="inboxmag-meta">
                              {validatedAt ? `Validee: ${validatedAt}` : (r.created_at ? `Date: ${new Date(r.created_at).toLocaleString('fr-FR')}` : '-')}
                              {insufficient ? <span className="inboxmag-warn" title="Stock insuffisant"><AlertTriangle size={14} /></span> : null}
                            </span>
                          </div>

                          <div className="inboxmag-sub inboxmag-request-grid">
                            {[
                              { key: 'qty', label: 'Quantité', value: r.quantity_requested },
                              { key: 'dem', label: 'Demandeur', value: r.demandeur },
                              { key: 'dir', label: 'Direction', value: r.direction_laboratory },
                              { key: 'code', label: 'Code produit', value: r.product?.code },
                              { key: 'stock', label: 'Stock', value: Number.isFinite(Number(r.product?.stock)) ? r.product.stock : null },
                            ]
                              .filter((f) => f.value !== undefined && f.value !== null && String(f.value).trim() !== '')
                              .map((f) => (
                                <span key={f.key}>{f.label}: <strong>{f.value}</strong></span>
                              ))}
                          </div>

                          <div className="inboxmag-actions">
                            {normalizeRequestStatus(r.status) === 'validated' ? (
                              <button className="inboxmag-btn ok" type="button" onClick={() => openPrepareModal(r)} disabled={isSubmitting}>
                                <CheckCircle size={15} /> Preparer
                              </button>
                            ) : normalizeRequestStatus(r.status) === 'preparing' ? (
                              <button className="inboxmag-btn primary" type="button" onClick={() => openServeModal(r)} disabled={isSubmitting || insufficient}>
                                <Truck size={15} /> Servir
                              </button>
                            ) : (
                              null
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            )}

            {prepareModalOpen && prepareTarget && (
              <div className="inboxmag-modal-backdrop" role="dialog" aria-modal="true">
                <div className="inboxmag-modal">
                  <div className="inboxmag-modal-title">
                    <strong>Preparer la demande</strong>
                    <span className="inboxmag-muted">{prepareTarget.product?.name || 'Produit'} | {requestRef(prepareTarget.id)}</span>
                  </div>

                  <div className="inboxmag-modal-grid">
                    <div className="inboxmag-field">
                      <span>Quantite demandee</span>
                      <div className="inboxmag-field-read">{prepareTarget.quantity_requested}</div>
                    </div>
                    <div className="inboxmag-field">
                      <span>Stock disponible</span>
                      <div className="inboxmag-field-read">{prepareTarget.product?.stock ?? '-'}</div>
                    </div>
                    <div className="inboxmag-field">
                      <span>Lot propose automatiquement</span>
                      <div className="inboxmag-field-read">
                        {prepareLotLoading ? 'Chargement...' : (
                          prepareLotInfo?.next_fifo_lot?.lot_number
                            ? `${prepareLotInfo.next_fifo_lot.lot_number}${prepareLotInfo.next_fifo_lot.qr_code_value ? ` | QR ${prepareLotInfo.next_fifo_lot.qr_code_value}` : ''}`
                            : 'Aucun lot disponible'
                        )}
                      </div>
                    </div>
                    <div className="inboxmag-field">
                      <span>Regle appliquee</span>
                      <div className="inboxmag-field-read">{prepareStrategyLabel}</div>
                    </div>

                    <label className="inboxmag-field" style={{ gridColumn: '1 / -1' }}>
                      <span>Scanner QR / Code lot</span>
                      <div className="inboxmag-inline-input">
                        <input
                          value={prepareLotQr}
                          onChange={(e) => setPrepareLotQr(e.target.value)}
                          placeholder="Scanner ou saisir le QR du lot..."
                          maxLength={220}
                        />
                        <button className="inboxmag-btn" type="button" onClick={() => setScanTarget('prepare')} disabled={isSubmitting}>
                          <ScanLine size={15} /> Scanner
                        </button>
                      </div>
                      {String(prepareLotInfo?.next_fifo_lot?.qr_code_value || '').trim()
                        && String(prepareLotQr || '').trim()
                        && String(prepareLotInfo?.next_fifo_lot?.qr_code_value || '').trim() !== String(prepareLotQr || '').trim()
                        ? <div className="inboxmag-hint error">QR different du lot propose (bloque)</div>
                        : <div className="inboxmag-hint">Optionnel: confirme le lot propose (FIFO/FEFO).</div>}
                    </label>

                    <label className="inboxmag-field" style={{ gridColumn: '1 / -1' }}>
                      <span>Observation (optionnel)</span>
                      <textarea
                        rows={3}
                        value={prepareNote}
                        onChange={(e) => setPrepareNote(e.target.value)}
                        placeholder="Ex: preparation effectuee, remarque..."
                        maxLength={600}
                      />
                    </label>
                  </div>

                  {scanTarget === 'prepare' && (
                    <InlineQrScanner
                      onDetected={onDetectedQr}
                      onClose={() => setScanTarget('')}
                    />
                  )}

                  <div className="inboxmag-modal-actions">
                    <button className="inboxmag-btn" type="button" onClick={closePrepareModal} disabled={isSubmitting}>
                      Annuler
                    </button>
                    <button className="inboxmag-btn ok" type="button" onClick={confirmPrepare} disabled={isSubmitting}>
                      Confirmer preparation
                    </button>
                  </div>
                </div>
              </div>
            )}

            {serveModalOpen && serveTarget && (
              <div className="inboxmag-modal-backdrop" role="dialog" aria-modal="true">
                <div className="inboxmag-modal">
                  <div className="inboxmag-modal-title">
                    <strong>Servir la demande</strong>
                    <span className="inboxmag-muted">{serveTarget.product?.name || 'Produit'} | {requestRef(serveTarget.id)}</span>
                  </div>

                  <div className="inboxmag-modal-grid">
                    <div className="inboxmag-field">
                      <span>Quantite servie</span>
                      <div className="inboxmag-field-read">{serveTarget.quantity_requested}</div>
                    </div>
                    <div className="inboxmag-field">
                      <span>Regle appliquee</span>
                      <div className="inboxmag-field-read">{serveStrategyLabel}</div>
                    </div>
                    <div className="inboxmag-field">
                      <span>Demandeur</span>
                      <div className="inboxmag-field-read">{serveTarget.demandeur || '-'}</div>
                    </div>
                    <div className="inboxmag-field">
                      <span>Direction</span>
                      <div className="inboxmag-field-read">{serveTarget.direction_laboratory || '-'}</div>
                    </div>
                    <div className="inboxmag-field" style={{ gridColumn: '1 / -1' }}>
                      <span>Lot utilise</span>
                      <div className="inboxmag-field-read">
                        {String(serveLotQr || '').trim()
                          ? String(serveLotQr).trim()
                          : (serveLotLoading
                            ? 'Chargement...'
                            : (serveLotInfo?.next_fifo_lot?.lot_number
                              ? `${serveLotInfo.next_fifo_lot.lot_number}${serveLotInfo.next_fifo_lot.qr_code_value ? ` | QR ${serveLotInfo.next_fifo_lot.qr_code_value}` : ''}`
                              : 'Lot non disponible'))}
                      </div>
                    </div>

                    <label className="inboxmag-field" style={{ gridColumn: '1 / -1' }}>
                      <span>Scanner QR / Code lot</span>
                      <div className="inboxmag-inline-input">
                        <input
                          value={serveLotQr}
                          onChange={(e) => setServeLotQr(e.target.value)}
                          placeholder="Scanner ou saisir le QR du lot..."
                          maxLength={220}
                        />
                        <button className="inboxmag-btn" type="button" onClick={() => setScanTarget('serve')} disabled={isSubmitting}>
                          <ScanLine size={15} /> Scanner
                        </button>
                      </div>
                      {String(serveLotInfo?.next_fifo_lot?.qr_code_value || '').trim()
                        && String(serveLotQr || '').trim()
                        && String(serveLotInfo?.next_fifo_lot?.qr_code_value || '').trim() !== String(serveLotQr || '').trim()
                        ? <div className="inboxmag-hint error">Lot scanne different du lot attendu (bloque)</div>
                        : <div className="inboxmag-hint">Recommande: scanner le lot attendu pour securiser FIFO/FEFO.</div>}
                    </label>

                    <label className="inboxmag-field" style={{ gridColumn: '1 / -1' }}>
                      <span>Observation (optionnel)</span>
                      <textarea
                        rows={3}
                        value={serveNote}
                        onChange={(e) => setServeNote(e.target.value)}
                        placeholder="Ex: service effectue, remarque..."
                        maxLength={600}
                      />
                    </label>
                  </div>

                  <div className="inboxmag-serve-warning" role="note">
                    <AlertTriangle size={16} />
                    <span>Cette action mettra a jour le stock.</span>
                  </div>

                  {scanTarget === 'serve' && (
                    <InlineQrScanner
                      onDetected={onDetectedQr}
                      onClose={() => setScanTarget('')}
                    />
                  )}

                  <div className="inboxmag-modal-actions">
                    <button className="inboxmag-btn" type="button" onClick={closeServeModal} disabled={isSubmitting}>
                      Annuler
                    </button>
                    <button className="inboxmag-btn primary" type="button" onClick={confirmServe} disabled={isSubmitting || isInsufficientStock(serveTarget)}>
                      Confirmer service
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
};

export default InboxMag;
