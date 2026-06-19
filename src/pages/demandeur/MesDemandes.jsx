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
import './MesDemandes.css';

const MesDemandes = ({ userName, onLogout, onCreateRequest }) => {
  const toast = useToast();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => (typeof window !== 'undefined' ? window.innerWidth <= 768 : false));
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('tous');
  const [demandes, setDemandes] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [editDraft, setEditDraft] = useState({ quantite: '', directionLaboratoire: '', priority: 'normal', note: '' });
  const [editErrors, setEditErrors] = useState({});

  // 📊 Statistiques
  const stats = useMemo(() => {
    const pending = demandes.filter(d => d.statut === 'pending').length;
    const validated = demandes.filter(d => d.statut === 'validated' || d.statut === 'accepted').length;
    const served = demandes.filter(d => d.statut === 'served').length;
    const rejected = demandes.filter(d => d.statut === 'rejected').length;
    return { pending, validated, served, rejected, total: demandes.length };
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
          produit: r.product?.name || 'Produit',
          codeProduit: r.product?.code_product || '-',
          quantite: Number(r.quantity_requested || 0),
          directionLaboratoire: r.direction_laboratory || '',
          priority: r.priority || 'normal',
          note: r.note || '',
          date: r.date_request ? new Date(r.date_request).toLocaleString('fr-FR') : '-',
          statut: normalizeRequestStatus(r.status),
          receiptToken: r.receipt_token || '',
        }));

      mapped.sort((a, b) => String(b.id).localeCompare(String(a.id)));
      setDemandes(mapped);
    } catch (err) {
      if (!silent) toast.error(getUiErrorMessage(err, 'Impossible de charger mes demandes'));
    } finally {
      if (showLoader) setIsLoading(false);
    }
  }, [toast]);

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
      pending: { label: 'En attente', icon: Clock, step: 1, color: 'warning' },
      validated: { label: 'Validée', icon: CheckCircle, step: 2, color: 'info' },
      accepted: { label: 'Validée', icon: CheckCircle, step: 2, color: 'info' },
      preparing: { label: 'Préparation', icon: Package, step: 3, color: 'processing' },
      served: { label: 'Servie', icon: Package, step: 4, color: 'success' },
      received: { label: 'Clôturée', icon: CheckCircle, step: 5, color: 'success' },
      rejected: { label: 'Rejetée', icon: XCircle, step: 0, color: 'danger' },
    };
    return configs[statut] || { label: statut, icon: Clock, step: 0, color: 'default' };
  };

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
      toast.error('Modification possible uniquement si la demande est en attente');
      return;
    }
    setEditErrors({});
    setDeleteTarget(null);
    setEditTarget(demande);
    setEditDraft({
      quantite: String(demande.quantite || ''),
      directionLaboratoire: String(demande.directionLaboratoire || ''),
      priority: String(demande.priority || 'normal'),
      note: String(demande.note || ''),
    });
  }, [toast]);

  const closeEdit = useCallback(() => {
    if (isSubmitting) return;
    setEditTarget(null);
    setEditErrors({});
  }, [isSubmitting]);

  const openDelete = useCallback((demande) => {
    if (!demande?.id || demande.statut !== 'pending') {
      toast.error('Suppression possible uniquement si la demande est en attente');
      return;
    }
    setEditTarget(null);
    setDeleteTarget(demande);
  }, [toast]);

  const closeDelete = useCallback(() => {
    if (isSubmitting) return;
    setDeleteTarget(null);
  }, [isSubmitting]);

  const validateEdit = useCallback(() => {
    const next = {};
    const qty = asPositiveInt(editDraft.quantite, { min: 1, max: 1000000000 });
    if (!Number.isFinite(qty)) next.quantite = 'Quantité valide requise (min: 1)';

    if (!isSafeText(editDraft.directionLaboratoire, { min: 2, max: 80 })) {
      next.directionLaboratoire = 'Direction requise (2-80 caractères)';
    }

    if (editDraft.note && !isSafeText(editDraft.note, { min: 0, max: 600 })) {
      next.note = 'Commentaire trop long (max 600 caractères)';
    }

    const pr = String(editDraft.priority || '').trim().toLowerCase();
    if (!['normal', 'urgent', 'critical'].includes(pr)) {
      next.priority = 'Urgence invalide';
    }

    setEditErrors(next);
    return Object.keys(next).length === 0;
  }, [editDraft]);

  const submitEdit = useCallback(async (e) => {
    e.preventDefault();
    if (!editTarget?.id || !validateEdit()) {
      toast.error('Veuillez corriger les erreurs');
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
      toast.success('Demande modifiée avec succès');
      setEditTarget(null);
      await loadDemandes(false, true);
    } catch (err) {
      toast.error(getUiErrorMessage(err, 'Erreur lors de la modification'));
    } finally {
      setIsSubmitting(false);
    }
  }, [editDraft, editTarget, loadDemandes, toast, validateEdit]);

  const deleteRequest = useCallback(async () => {
    if (!deleteTarget?.id) return;
    setIsSubmitting(true);
    try {
      await patch(`/requests/${encodeURIComponent(deleteTarget.id)}/cancel`, {});
      toast.success('Demande supprimée');
      setDemandes(prev => prev.filter(d => d.id !== deleteTarget.id));
      setDeleteTarget(null);
      await loadDemandes(false, true);
    } catch (err) {
      toast.error(getUiErrorMessage(err, 'Erreur lors de la suppression'));
    } finally {
      setIsSubmitting(false);
    }
  }, [deleteTarget, loadDemandes, toast]);

  const confirmReceipt = useCallback(async (demande) => {
    if (!demande?.id) return;
    setIsSubmitting(true);
    try {
      await patch(`/requests/${encodeURIComponent(demande.id)}/confirm-receipt`, {});
      toast.success('Réception confirmée');
      setDemandes(prev =>
        prev.map(d => d.id === demande.id ? { ...d, statut: 'received' } : d)
      );
      await loadDemandes(false, true);
    } catch (err) {
      toast.error(getUiErrorMessage(err, 'Erreur lors de la confirmation'));
    } finally {
      setIsSubmitting(false);
    }
  }, [loadDemandes, toast]);

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
          <HeaderPage title="Mes Demandes" userName={userName} onLogout={onLogout} />
          <main className="dem-content">
            <LoadingSpinner text="Chargement..." />
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="dem-layout">
      <SidebarDem collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} />
      <div className="dem-main">
        <HeaderPage title="Mes Demandes" userName={userName} onLogout={onLogout} />
        <main className="dem-content">
          {/* STATS */}
          <div className="dem-header">
            <div className="dem-stats">
              <div className="stat-item stat-total">
                <div className="stat-num">{stats.total}</div>
                <div className="stat-label">Total</div>
              </div>
              <div className="stat-item stat-pending">
                <div className="stat-num">{stats.pending}</div>
                <div className="stat-label">En attente</div>
              </div>
              <div className="stat-item stat-valid">
                <div className="stat-num">{stats.validated}</div>
                <div className="stat-label">Validées</div>
              </div>
              <div className="stat-item stat-served">
                <div className="stat-num">{stats.served}</div>
                <div className="stat-label">Servies</div>
              </div>
            </div>

            <button className="dem-btn-create" onClick={onCreateRequest}>
              <Plus size={18} />
              Nouvelle demande
            </button>
          </div>

          {/* FILTERS */}
          <div className="dem-controls">
            <div className="dem-search">
              <input
                type="text"
                placeholder="Chercher une demande..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="dem-input-search"
              />
            </div>

            <div className="dem-filters">
              {[
                { val: 'tous', label: 'Tous', count: stats.total },
                { val: 'pending', label: 'Attente', count: stats.pending },
                { val: 'validated', label: 'Validées', count: stats.validated },
                { val: 'served', label: 'Servies', count: stats.served },
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
              <h3>Aucune demande</h3>
              <p>{activeFilter !== 'tous' ? 'Aucune demande avec ce filtre' : 'Créez votre première demande'}</p>
            </div>
          ) : (
            <div className="dem-cards">
              {filteredDemandes.map(demande => {
                const config = getStatutConfig(demande.statut);
                const Icon = config.icon;
                const priorityLabels = { normal: 'Normal', urgent: 'Urgent', critical: 'Très urgent' };

                return (
                  <div key={demande.id} className={`dem-card dem-card-${config.color}`}>
                    <div className="dem-card-header">
                      <div className="dem-card-ref">
                        <span className="dem-ref-badge">{demande.reference}</span>
                        <span className="dem-product">{demande.produit}</span>
                      </div>
                      <div className={`dem-status dem-status-${config.color}`}>
                        <Icon size={16} />
                        <span>{config.label}</span>
                      </div>
                    </div>

                    <div className="dem-card-body">
                      <div className="dem-row">
                        <div className="dem-col">
                          <span className="dem-label">Quantité</span>
                          <span className="dem-value">{demande.quantite}</span>
                        </div>
                        <div className="dem-col">
                          <span className="dem-label">Urgence</span>
                          <span className={`dem-priority dem-priority-${demande.priority}`}>
                            {priorityLabels[demande.priority]}
                          </span>
                        </div>
                        <div className="dem-col">
                          <span className="dem-label">Direction</span>
                          <span className="dem-value">{demande.directionLaboratoire}</span>
                        </div>
                      </div>

                      {demande.note && (
                        <div className="dem-note">
                          <span className="dem-note-label">Note:</span>
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
                            title="Modifier"
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            className="dem-action-btn dem-delete"
                            onClick={() => openDelete(demande)}
                            disabled={isSubmitting}
                            title="Supprimer"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      )}
                      {demande.statut === 'served' && (
                        <button
                          className="dem-action-btn dem-confirm"
                          onClick={() => confirmReceipt(demande)}
                          disabled={isSubmitting}
                        >
                          Confirmer réception
                        </button>
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
            {isSubmitting && <LoadingSpinner overlay text="Mise à jour..." />}

            <div className="dem-modal-header">
              <h2>Modifier la demande</h2>
              <button className="dem-modal-close" onClick={closeEdit} disabled={isSubmitting}>
                <X size={20} />
              </button>
            </div>

            <div className="dem-modal-body">
              <form onSubmit={submitEdit} noValidate>
                {/* SECTION 1: QUANTITÉ & URGENCE */}
                <div style={{ marginBottom: '1.75rem', paddingBottom: '1.25rem', borderBottom: '1px solid #f3f4f6' }}>
                  <h3 style={{ fontSize: '0.9rem', fontWeight: '600', color: '#374151', marginBottom: '1rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Demande
                  </h3>
                  
                  <div className="dem-form-group">
                    <label className="required">Quantité</label>
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
                    <label className="required">Urgence</label>
                    <select
                      value={editDraft.priority}
                      onChange={(e) => setEditDraft(p => ({ ...p, priority: e.target.value }))}
                      className={editErrors.priority ? 'error' : ''}
                      disabled={isSubmitting}
                    >
                      <option value="normal">Normal</option>
                      <option value="urgent">Urgent</option>
                      <option value="critical">Très urgent</option>
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
                    Destination
                  </h3>
                  
                  <div className="dem-form-group">
                    <label className="required">Direction / Laboratoire</label>
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
                    <label>Commentaire <span style={{ color: '#9ca3af', fontWeight: '400' }}>(optionnel)</span></label>
                    <textarea
                      maxLength={600}
                      rows={3}
                      value={editDraft.note}
                      onChange={(e) => setEditDraft(p => ({ ...p, note: e.target.value }))}
                      className={editErrors.note ? 'error' : ''}
                      disabled={isSubmitting}
                      placeholder="Informations supplémentaires..."
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
                    Annuler
                  </button>
                  <button type="submit" className="dem-btn-primary" disabled={isSubmitting}>
                    Enregistrer
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
            {isSubmitting && <LoadingSpinner overlay text="Suppression..." />}

            <div className="dem-confirm-icon">
              <AlertCircle size={48} />
            </div>
            <h2>Supprimer la demande ?</h2>
            <p>Cette action est irréversible.</p>

            <div className="dem-confirm-details">
              <div><strong>{deleteTarget.reference}</strong></div>
              <div>{deleteTarget.produit} • Qté: {deleteTarget.quantite}</div>
            </div>

            <div className="dem-modal-actions">
              <button className="dem-btn-secondary" onClick={closeDelete} disabled={isSubmitting}>
                Annuler
              </button>
              <button className="dem-btn-danger" onClick={deleteRequest} disabled={isSubmitting}>
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MesDemandes;