// BLOC 1 - Role du fichier.
// Ce fichier affiche une page de l'espace demandeur pour MesDemandes.
// Point de vigilance: garder les props, appels API et classes CSS synchronises avec les ecrans existants.

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Clock, CheckCircle, XCircle, Package, Calendar, Plus, Pencil, Trash2, X,
  AlertCircle
} from 'lucide-react';
import SidebarDem from '../../components/demandeur/SidebarDem';
import HeaderPage from '../../components/shared/HeaderPage';
import LoadingSpinner from '../../components/shared/LoadingSpinner';
import { useToast } from '../../components/shared/Toast';
import { get, patch } from '../../services/api';
import { getUiErrorMessage } from '../../services/uiError';
import { normalizeRequestStatus } from '../../utils/requestStatus';
import { asPositiveInt, isSafeText, sanitizeText } from '../../utils/formGuards';
import { useUiLanguage } from '../../utils/uiLanguage';
import { formatDemandeurText, getDemandeurI18n } from '../../utils/demandeurI18n';
import './MesDemandes.css';

const MesDemandes = ({ userName, onLogout, onCreateRequest }) => {
  const toast = useToast();
  const language = useUiLanguage();
  const i18n = useMemo(() => getDemandeurI18n(language), [language]);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => (typeof window !== 'undefined' ? window.innerWidth <= 768 : false));
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('tous');
  const [demandes, setDemandes] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [receiptTarget, setReceiptTarget] = useState(null);
  const [editDraft, setEditDraft] = useState({ quantite: '', directionLaboratoire: '', priority: 'normal', note: '' });
  const [editErrors, setEditErrors] = useState({});

  // 📊 Statistiques
  const stats = useMemo(() => {
    const pending = demandes.filter(d => d.statut === 'pending').length;
    const validated = demandes.filter(d => d.statut === 'validated' || d.statut === 'accepted').length;
    const preparing = demandes.filter(d => d.statut === 'preparing').length;
    const served = demandes.filter(d => d.statut === 'served').length;
    const received = demandes.filter(d => d.statut === 'received').length;
    const rejected = demandes.filter(d => d.statut === 'rejected').length;
    return { pending, validated, preparing, served, received, rejected, total: demandes.length };
  }, [demandes]);

  const loadDemandes = useCallback(async (showLoader = true, silent = false) => {
    if (showLoader) setIsLoading(true);
    try {
      const items = await get('/requests');
      const mapped = (items || [])
        .filter((r) => normalizeRequestStatus(r.status) !== 'cancelled')
        .map((r) => ({
          id: r._id,
          reference: `DEM-${String(r._id || '').slice(-6).toUpperCase()}`,
          produit: r.product?.name || i18n.products,
          codeProduit: r.product?.code_product || '-',
          quantite: Number(r.quantity_requested || 0),
          directionLaboratoire: r.direction_laboratory || '',
          priority: r.priority || 'normal',
          note: r.note || '',
          date: r.date_request ? new Date(r.date_request).toLocaleString(language === 'en' ? 'en-US' : language === 'ar' ? 'ar-TN' : 'fr-FR') : '-',
          statut: normalizeRequestStatus(r.status),
          receiptToken: r.receipt_token || '',
        }));

      mapped.sort((a, b) => String(b.id).localeCompare(String(a.id)));
      setDemandes(mapped);
    } catch (err) {
      if (!silent) toast.error(getUiErrorMessage(err, i18n.loadMyRequestsFail));
    } finally {
      if (showLoader) setIsLoading(false);
    }
  }, [i18n.loadMyRequestsFail, i18n.products, language, toast]);

  useEffect(() => {
    loadDemandes(true, false);
  }, [loadDemandes]);

  useEffect(() => {
    const intervalId = setInterval(() => {
      loadDemandes(false, true);
    }, 10000);
    return () => clearInterval(intervalId);
  }, [loadDemandes]);

  const getStatutConfig = (statut) => {
    const configs = {
      pending: { label: i18n.statusPending, icon: Clock, step: 1, color: 'warning' },
      validated: { label: i18n.statusValidated, icon: CheckCircle, step: 2, color: 'info' },
      accepted: { label: i18n.statusValidated, icon: CheckCircle, step: 2, color: 'info' },
      preparing: { label: i18n.statusPreparing, icon: Package, step: 3, color: 'processing' },
      served: { label: i18n.statusServed, icon: Package, step: 4, color: 'success' },
      received: { label: i18n.statusReceived, icon: CheckCircle, step: 5, color: 'success' },
      rejected: { label: i18n.statusRejected, icon: XCircle, step: 0, color: 'danger' },
    };
    return configs[statut] || { label: statut, icon: Clock, step: 0, color: 'default' };
  };

  const workflowSteps = useMemo(() => ([
    { key: 'pending', label: i18n.stepCreated, step: 1 },
    { key: 'validated', label: i18n.stepValidated, step: 2 },
    { key: 'preparing', label: i18n.stepPrepared, step: 3 },
    { key: 'served', label: i18n.stepServed, step: 4 },
    { key: 'received', label: i18n.stepReceived, step: 5 },
  ]), [i18n]);

  const getStatusDetail = useCallback((statut) => {
    const messages = {
      pending: i18n.pendingDetail,
      validated: i18n.validatedDetail,
      accepted: i18n.validatedDetail,
      preparing: i18n.preparingDetail,
      served: i18n.servedDetail,
      received: i18n.receivedDetail,
      rejected: i18n.rejectedDetail,
    };
    return messages[statut] || i18n.defaultRequestDetail;
  }, [i18n]);

  const getStepClass = useCallback((statut, currentStep, step) => {
    if (statut === 'rejected') return step === 1 ? 'done' : 'blocked';
    if (currentStep > step) return 'done';
    if (currentStep === step) return 'current';
    return 'next';
  }, []);

  const filteredDemandes = useMemo(() => {
    let result = demandes;

    if (activeFilter !== 'tous') {
      result = result.filter(d => {
        if (activeFilter === 'validated') return d.statut === 'validated' || d.statut === 'accepted';
        return d.statut === activeFilter;
      });
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(d =>
        d.reference.toLowerCase().includes(q) ||
        d.produit.toLowerCase().includes(q) ||
        d.codeProduit.toLowerCase().includes(q)
      );
    }

    return result;
  }, [demandes, activeFilter, searchQuery]);

  const openEdit = useCallback((demande) => {
    if (!demande?.id || demande.statut !== 'pending') {
      toast.error(i18n.editOnlyPending);
      return;
    }
    setEditErrors({});
    setDeleteTarget(null);
    setReceiptTarget(null);
    setEditTarget(demande);
    setEditDraft({
      quantite: String(demande.quantite || ''),
      directionLaboratoire: String(demande.directionLaboratoire || ''),
      priority: String(demande.priority || 'normal'),
      note: String(demande.note || ''),
    });
  }, [i18n.editOnlyPending, toast]);

  const closeEdit = useCallback(() => {
    if (isSubmitting) return;
    setEditTarget(null);
    setEditErrors({});
  }, [isSubmitting]);

  const openDelete = useCallback((demande) => {
    if (!demande?.id || demande.statut !== 'pending') {
      toast.error(i18n.deleteOnlyPending);
      return;
    }
    setEditTarget(null);
    setReceiptTarget(null);
    setDeleteTarget(demande);
  }, [i18n.deleteOnlyPending, toast]);

  const closeDelete = useCallback(() => {
    if (isSubmitting) return;
    setDeleteTarget(null);
  }, [isSubmitting]);

  const openReceipt = useCallback((demande) => {
    if (!demande?.id || demande.statut !== 'served') {
      toast.error(i18n.confirmOnlyServed);
      return;
    }
    setEditTarget(null);
    setDeleteTarget(null);
    setReceiptTarget(demande);
  }, [i18n.confirmOnlyServed, toast]);

  const closeReceipt = useCallback(() => {
    if (isSubmitting) return;
    setReceiptTarget(null);
  }, [isSubmitting]);

  const validateEdit = useCallback(() => {
    const next = {};
    const qty = asPositiveInt(editDraft.quantite, { min: 1, max: 1000000000 });
    if (!Number.isFinite(qty)) next.quantite = i18n.validQuantityRequired;

    if (!isSafeText(editDraft.directionLaboratoire, { min: 2, max: 80 })) {
      next.directionLaboratoire = i18n.directionRequired;
    }

    if (editDraft.note && !isSafeText(editDraft.note, { min: 0, max: 600 })) {
      next.note = i18n.noteTooLong;
    }

    const pr = String(editDraft.priority || '').trim().toLowerCase();
    if (!['normal', 'urgent', 'critical'].includes(pr)) {
      next.priority = i18n.invalidUrgency;
    }

    setEditErrors(next);
    return Object.keys(next).length === 0;
  }, [editDraft, i18n.directionRequired, i18n.invalidUrgency, i18n.noteTooLong, i18n.validQuantityRequired]);

  const submitEdit = useCallback(async (e) => {
    e.preventDefault();
    if (!editTarget?.id || !validateEdit()) {
      toast.error(i18n.fixErrors);
      return;
    }

    setIsSubmitting(true);
    try {
      const qty = asPositiveInt(editDraft.quantite, { min: 1 });
      await patch(`/requests/${encodeURIComponent(editTarget.id)}/update`, {
        quantity_requested: qty,
        direction_laboratory: sanitizeText(editDraft.directionLaboratoire),
        priority: editDraft.priority.toLowerCase(),
        note: editDraft.note || undefined,
      });
      toast.success(i18n.requestUpdated);
      setEditTarget(null);
      await loadDemandes(false, true);
    } catch (err) {
      toast.error(getUiErrorMessage(err, i18n.failUpdateRequest));
    } finally {
      setIsSubmitting(false);
    }
  }, [editDraft, editTarget, i18n.failUpdateRequest, i18n.fixErrors, i18n.requestUpdated, loadDemandes, toast, validateEdit]);

  const deleteRequest = useCallback(async () => {
    if (!deleteTarget?.id) return;
    setIsSubmitting(true);
    try {
      await patch(`/requests/${encodeURIComponent(deleteTarget.id)}/cancel`, {});
      toast.success(i18n.requestDeleted);
      setDemandes(prev => prev.filter(d => d.id !== deleteTarget.id));
      setDeleteTarget(null);
      await loadDemandes(false, true);
    } catch (err) {
      toast.error(getUiErrorMessage(err, i18n.failDeleteRequest));
    } finally {
      setIsSubmitting(false);
    }
  }, [deleteTarget, i18n.failDeleteRequest, i18n.requestDeleted, loadDemandes, toast]);

  const confirmReceipt = useCallback(async () => {
    if (!receiptTarget?.id) return;
    setIsSubmitting(true);
    try {
      const payload = receiptTarget.receiptToken
        ? { receipt_token: receiptTarget.receiptToken }
        : {};
      await patch(`/requests/${encodeURIComponent(receiptTarget.id)}/confirm-receipt`, payload);
      toast.success(i18n.receiptConfirmed);
      setDemandes(prev =>
        prev.map(d => d.id === receiptTarget.id ? { ...d, statut: 'received' } : d)
      );
      setReceiptTarget(null);
      await loadDemandes(false, true);
    } catch (err) {
      toast.error(getUiErrorMessage(err, i18n.failConfirmReceipt));
    } finally {
      setIsSubmitting(false);
    }
  }, [i18n.failConfirmReceipt, i18n.receiptConfirmed, loadDemandes, receiptTarget, toast]);

  const handleResize = useCallback(() => {
    setSidebarCollapsed(window.innerWidth <= 768);
  }, []);

  useEffect(() => {
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [handleResize]);

  if (isLoading) {
    return (
      <div className="dem-layout">
        <SidebarDem collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} />
        <div className="dem-main">
          <HeaderPage title={i18n.requestsTitle} userName={userName} onLogout={onLogout} />
          <main className="dem-content">
            <LoadingSpinner text={i18n.loading} />
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="dem-layout">
      <SidebarDem collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} />
      <div className="dem-main">
        <HeaderPage title={i18n.requestsTitle} userName={userName} onLogout={onLogout} />
        <main className="dem-content">
          {/* STATS */}
          <div className="dem-header">
            <div className="dem-stats">
              <div className="stat-item stat-total">
                <div className="stat-num">{stats.total}</div>
                <div className="stat-label">{i18n.total}</div>
              </div>
              <div className="stat-item stat-pending">
                <div className="stat-num">{stats.pending}</div>
                <div className="stat-label">{i18n.pendingStat}</div>
              </div>
              <div className="stat-item stat-valid">
                <div className="stat-num">{stats.validated}</div>
                <div className="stat-label">{i18n.validatedStat}</div>
              </div>
              <div className="stat-item stat-served">
                <div className="stat-num">{stats.served}</div>
                <div className="stat-label">{i18n.toConfirm}</div>
              </div>
              <div className="stat-item stat-received">
                <div className="stat-num">{stats.received}</div>
                <div className="stat-label">{i18n.closedStat}</div>
              </div>
            </div>

            <button className="dem-btn-create" onClick={onCreateRequest}>
              <Plus size={18} />
              {i18n.newRequest}
            </button>
          </div>

          {/* FILTERS */}
          <div className="dem-controls">
            <div className="dem-search">
              <input
                type="text"
                placeholder={i18n.searchRequest}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="dem-input-search"
              />
            </div>

            <div className="dem-filters">
              {[
                { val: 'tous', label: i18n.all, count: stats.total },
                { val: 'pending', label: i18n.waitingFilter, count: stats.pending },
                { val: 'validated', label: i18n.validatedStat, count: stats.validated },
                { val: 'preparing', label: i18n.preparingFilter, count: stats.preparing },
                { val: 'served', label: i18n.servedFilter, count: stats.served },
                { val: 'received', label: i18n.receivedFilter, count: stats.received },
                { val: 'rejected', label: i18n.rejectedFilter, count: stats.rejected },
              ].map(f => (
                <button
                  key={f.val}
                  className={`dem-filter-btn ${activeFilter === f.val ? 'active' : ''}`}
                  onClick={() => setActiveFilter(f.val)}
                >
                  {f.label} <span className="dem-badge">{f.count}</span>
                </button>
              ))}
            </div>
          </div>

          {/* CARDS */}
          {filteredDemandes.length === 0 ? (
            <div className="dem-empty">
              <Package size={48} strokeWidth={1} />
              <h3>{i18n.noRequest}</h3>
              <p>{activeFilter !== 'tous' ? i18n.noRequestWithFilter : i18n.createFirstRequest}</p>
            </div>
          ) : (
            <div className="dem-cards">
              {filteredDemandes.map(demande => {
                const config = getStatutConfig(demande.statut);
                const Icon = config.icon;
                const statusDetail = getStatusDetail(demande.statut);
                const priorityLabels = { normal: i18n.normal, urgent: i18n.urgent, critical: i18n.critical };

                return (
                  <div key={demande.id} className={`dem-card dem-card-${config.color}`}>
                    <div className="dem-card-header">
                      <div className="dem-card-ref">
                        <span className="dem-ref-badge">{demande.reference}</span>
                        <span className="dem-product">{demande.produit}</span>
                      </div>
                      <div className="dem-status-stack">
                        <div className={`dem-status dem-status-${config.color}`}>
                          <Icon size={16} />
                          <span>{config.label}</span>
                        </div>
                        {demande.statut === 'served' && (
                          <button
                            type="button"
                            className="dem-status-action"
                            onClick={() => openReceipt(demande)}
                            disabled={isSubmitting}
                          >
                            <CheckCircle size={14} />
                            {i18n.confirmService}
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="dem-card-body">
                      <div className={`dem-status-detail dem-status-detail-${config.color}`}>
                        {statusDetail}
                      </div>

                      <div className="dem-progress" aria-label={formatDemandeurText(i18n.stateOfRequest, { reference: demande.reference })}>
                        {workflowSteps.map((step) => (
                          <div
                            key={step.key}
                            className={`dem-progress-step ${getStepClass(demande.statut, config.step, step.step)}`}
                          >
                            <span className="dem-progress-dot" />
                            <span className="dem-progress-label">{step.label}</span>
                          </div>
                        ))}
                      </div>

                      <div className="dem-row">
                        <div className="dem-col">
                          <span className="dem-label">{i18n.quantity}</span>
                          <span className="dem-value">{demande.quantite}</span>
                        </div>
                        <div className="dem-col">
                          <span className="dem-label">{i18n.priority}</span>
                          <span className={`dem-priority dem-priority-${demande.priority}`}>
                            {priorityLabels[demande.priority]}
                          </span>
                        </div>
                        <div className="dem-col">
                          <span className="dem-label">{i18n.direction}</span>
                          <span className="dem-value">{demande.directionLaboratoire}</span>
                        </div>
                      </div>

                      {demande.note && (
                        <div className="dem-note">
                          <span className="dem-note-label">{i18n.note}</span>
                          <span className="dem-note-text">{demande.note}</span>
                        </div>
                      )}

                      <div className="dem-date">
                        <Calendar size={14} />
                        {demande.date}
                      </div>
                    </div>

                    <div className="dem-card-footer">
                      {demande.statut === 'pending' && (
                        <div className="dem-actions">
                          <button
                            className="dem-action-btn dem-edit"
                            onClick={() => openEdit(demande)}
                            disabled={isSubmitting}
                            title={i18n.edit}
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            className="dem-action-btn dem-delete"
                            onClick={() => openDelete(demande)}
                            disabled={isSubmitting}
                            title={i18n.delete}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </main>
      </div>

      {/* MODALS */}
      {editTarget && (
        <div className="dem-modal-overlay" onClick={closeEdit}>
          <div className="dem-modal" onClick={(e) => e.stopPropagation()}>
            {isSubmitting && <LoadingSpinner overlay text={i18n.updating} />}

            <div className="dem-modal-header">
              <h2>{i18n.editRequest}</h2>
              <button className="dem-modal-close" onClick={closeEdit} disabled={isSubmitting}>
                <X size={20} />
              </button>
            </div>

            <div className="dem-modal-body">
              <form onSubmit={submitEdit} noValidate>
                {/* SECTION 1: QUANTITÉ & URGENCE */}
                <div style={{ marginBottom: '1.75rem', paddingBottom: '1.25rem', borderBottom: '1px solid #f3f4f6' }}>
                  <h3 style={{ fontSize: '0.9rem', fontWeight: '600', color: '#374151', marginBottom: '1rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    {i18n.requestSection}
                  </h3>
                  
                  <div className="dem-form-group">
                    <label className="required">{i18n.quantity}</label>
                    <input
                      type="number"
                      min="1"
                      value={editDraft.quantite}
                      onChange={(e) => setEditDraft(p => ({ ...p, quantite: e.target.value }))}
                      className={editErrors.quantite ? 'error' : ''}
                      disabled={isSubmitting}
                    />
                    {editErrors.quantite && (
                      <span className="dem-error">
                        <AlertCircle size={14} />
                        {editErrors.quantite}
                      </span>
                    )}
                  </div>

                  <div className="dem-form-group">
                    <label className="required">{i18n.priority}</label>
                    <select
                      value={editDraft.priority}
                      onChange={(e) => setEditDraft(p => ({ ...p, priority: e.target.value }))}
                      className={editErrors.priority ? 'error' : ''}
                      disabled={isSubmitting}
                    >
                      <option value="normal">{i18n.normal}</option>
                      <option value="urgent">{i18n.urgent}</option>
                      <option value="critical">{i18n.critical}</option>
                    </select>
                    {editErrors.priority && (
                      <span className="dem-error">
                        <AlertCircle size={14} />
                        {editErrors.priority}
                      </span>
                    )}
                  </div>
                </div>

                {/* SECTION 2: DIRECTION & COMMENTAIRE */}
                <div style={{ marginBottom: '1.75rem' }}>
                  <h3 style={{ fontSize: '0.9rem', fontWeight: '600', color: '#374151', marginBottom: '1rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    {i18n.destinationSection}
                  </h3>
                  
                  <div className="dem-form-group">
                    <label className="required">{i18n.directionLab}</label>
                    <input
                      type="text"
                      maxLength={80}
                      value={editDraft.directionLaboratoire}
                      onChange={(e) => setEditDraft(p => ({ ...p, directionLaboratoire: e.target.value }))}
                      className={editErrors.directionLaboratoire ? 'error' : ''}
                      disabled={isSubmitting}
                    />
                    {editErrors.directionLaboratoire && (
                      <span className="dem-error">
                        <AlertCircle size={14} />
                        {editErrors.directionLaboratoire}
                      </span>
                    )}
                  </div>

                  <div className="dem-form-group">
                    <label>{i18n.commentOptional}</label>
                    <textarea
                      maxLength={600}
                      rows={3}
                      value={editDraft.note}
                      onChange={(e) => setEditDraft(p => ({ ...p, note: e.target.value }))}
                      className={editErrors.note ? 'error' : ''}
                      disabled={isSubmitting}
                      placeholder={i18n.commentPlaceholder}
                    />
                    {editErrors.note && (
                      <span className="dem-error">
                        <AlertCircle size={14} />
                        {editErrors.note}
                      </span>
                    )}
                  </div>
                </div>

                <div className="dem-modal-actions">
                  <button type="button" className="dem-btn-secondary" onClick={closeEdit} disabled={isSubmitting}>
                    {i18n.cancel}
                  </button>
                  <button type="submit" className="dem-btn-primary" disabled={isSubmitting}>
                    {i18n.save}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="dem-modal-overlay" onClick={closeDelete}>
          <div className="dem-modal dem-modal-confirm" onClick={(e) => e.stopPropagation()}>
            {isSubmitting && <LoadingSpinner overlay text={i18n.deleting} />}

            <div className="dem-confirm-icon">
              <AlertCircle size={48} />
            </div>
            <h2>{i18n.deleteRequestQuestion}</h2>
            <p>{i18n.irreversibleAction}</p>

            <div className="dem-confirm-details">
              <div><strong>{deleteTarget.reference}</strong></div>
              <div>{deleteTarget.produit} - {i18n.quantity}: {deleteTarget.quantite}</div>
            </div>

            <div className="dem-modal-actions">
              <button className="dem-btn-secondary" onClick={closeDelete} disabled={isSubmitting}>
                {i18n.cancel}
              </button>
              <button className="dem-btn-danger" onClick={deleteRequest} disabled={isSubmitting}>
                {i18n.delete}
              </button>
            </div>
          </div>
        </div>
      )}

      {receiptTarget && (
        <div className="dem-modal-overlay" onClick={closeReceipt}>
          <div className="dem-modal dem-modal-confirm" onClick={(e) => e.stopPropagation()}>
            {isSubmitting && <LoadingSpinner overlay text={i18n.confirmation} />}

            <div className="dem-confirm-icon dem-confirm-icon-success">
              <CheckCircle size={48} />
            </div>
            <h2>{i18n.confirmReceiptQuestion}</h2>
            <p>{i18n.confirmReceiptDesc}</p>

            <div className="dem-confirm-details">
              <div><strong>{receiptTarget.reference}</strong></div>
              <div>{receiptTarget.produit} - {i18n.quantity}: {receiptTarget.quantite}</div>
              <div>{i18n.currentStateServed}</div>
            </div>

            <div className="dem-modal-actions">
              <button className="dem-btn-secondary" onClick={closeReceipt} disabled={isSubmitting}>
                {i18n.cancel}
              </button>
              <button className="dem-btn-primary" onClick={confirmReceipt} disabled={isSubmitting}>
                {i18n.confirmService}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MesDemandes;
