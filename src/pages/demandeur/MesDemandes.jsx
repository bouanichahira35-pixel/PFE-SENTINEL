import { useState, useEffect, useMemo, useCallback } from 'react';
import { Clock, CheckCircle, XCircle, Package, Calendar, Truck, Pencil, X } from 'lucide-react';
import SidebarDem from '../../components/demandeur/SidebarDem';
import HeaderPage from '../../components/shared/HeaderPage';
import LoadingSpinner from '../../components/shared/LoadingSpinner';
import { useToast } from '../../components/shared/Toast';
import { get, patch } from '../../services/api';
import { normalizeRequestStatus } from '../../utils/requestStatus';
import { asPositiveInt, isSafeText, sanitizeText } from '../../utils/formGuards';
import './MesDemandes.css';

const MesDemandes = ({ userName, onLogout }) => {
  const toast = useToast();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => (typeof window !== 'undefined' ? window.innerWidth <= 768 : false));
  const [searchQuery, setSearchQuery] = useState('');
  const [demandes, setDemandes] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [editDraft, setEditDraft] = useState({ quantite: '', directionLaboratoire: '', priority: 'normal', note: '' });
  const [editErrors, setEditErrors] = useState({});

  const loadDemandes = useCallback(async (showLoader = true, silent = false) => {
    if (showLoader) setIsLoading(true);
    try {
      const items = await get('/requests');
      const mapped = (items || []).map((r) => ({
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
      if (!silent) toast.error(err.message || 'Impossible de charger mes demandes');
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

  const getStatutInfo = (statut) => {
    switch (statut) {
      case 'pending':
        return { label: 'En attente', className: 'statut-attente', icon: Clock };
      case 'validated':
      case 'accepted':
        return { label: 'Validée', className: 'statut-validee', icon: CheckCircle };
      case 'preparing':
        return { label: 'En préparation', className: 'statut-validee', icon: Package };
      case 'served':
        return { label: 'Servie', className: 'statut-servie', icon: Truck };
      case 'received':
        return { label: 'Clôturée', className: 'statut-validee', icon: CheckCircle };
      case 'rejected':
      case 'refused':
        return { label: 'Rejetée', className: 'statut-rejetee', icon: XCircle };
      case 'cancelled':
        return { label: 'Annulée', className: 'statut-rejetee', icon: XCircle };
      default:
        return { label: statut, className: '', icon: Clock };
    }
  };

  const openEdit = useCallback((demande) => {
    if (!demande?.id) return;
    if (demande.statut !== 'pending') {
      toast.error('Modification possible uniquement tant que la demande est en attente');
      return;
    }
    setEditErrors({});
    setEditTarget(demande);
    setEditDraft({
      quantite: String(Number.isFinite(Number(demande.quantite)) ? Number(demande.quantite) : ''),
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

  const validateEdit = useCallback(() => {
    const next = {};
    const qty = asPositiveInt(editDraft.quantite, { min: 1, max: 1000000000 });
    if (!Number.isFinite(qty) || Number.isNaN(qty)) next.quantite = 'Quantité valide requise';

    if (!isSafeText(editDraft.directionLaboratoire, { min: 2, max: 80 })) {
      next.directionLaboratoire = 'Direction / laboratoire obligatoire (2-80, sans < >)';
    }

    if (editDraft.note && !isSafeText(editDraft.note, { min: 0, max: 600 })) {
      next.note = 'Texte trop long (max 600)';
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
    if (!editTarget?.id) return;
    if (!validateEdit()) {
      toast.error('Veuillez corriger les erreurs');
      return;
    }

    setIsSubmitting(true);
    try {
      const qty = asPositiveInt(editDraft.quantite, { min: 1, max: 1000000000 });
      await patch(`/requests/${encodeURIComponent(editTarget.id)}/update`, {
        quantity_requested: qty,
        direction_laboratory: sanitizeText(editDraft.directionLaboratoire, { maxLen: 80 }),
        priority: String(editDraft.priority || 'normal').trim().toLowerCase(),
        note: sanitizeText(editDraft.note || '', { maxLen: 600 }) || undefined,
      });
      toast.success('Demande modifiée');
      setEditTarget(null);
      await loadDemandes(false, true);
    } catch (err) {
      toast.error(err.message || 'Impossible de modifier la demande');
    } finally {
      setIsSubmitting(false);
    }
  }, [editDraft, editTarget, loadDemandes, toast, validateEdit]);

  const confirmReceipt = useCallback(async (demande) => {
    if (!demande?.id) return;
    setIsSubmitting(true);
    try {
      await patch(`/requests/${encodeURIComponent(demande.id)}/confirm-receipt`, {
        receipt_token: demande.receiptToken || undefined,
      });
      toast.success('Reception confirmee');
      await loadDemandes(false, true);
    } catch (err) {
      toast.error(err.message || 'Impossible de confirmer la reception');
    } finally {
      setIsSubmitting(false);
    }
  }, [loadDemandes, toast]);

  const filteredDemandes = useMemo(() => (
    demandes.filter((demande) =>
      demande.produit.toLowerCase().includes(searchQuery.toLowerCase()) ||
      demande.reference.toLowerCase().includes(searchQuery.toLowerCase())
    )
  ), [demandes, searchQuery]);

  return (
    <div className="app-layout">
      <div
        className={`sidebar-backdrop ${sidebarCollapsed ? 'hidden' : ''}`}
        onClick={() => setSidebarCollapsed(true)}
      />
      <SidebarDem 
        collapsed={sidebarCollapsed} 
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        onLogout={onLogout}
        userName={userName}
      />
      
      <div className="main-container">
        <HeaderPage 
          userName={userName}
          title="Mes Demandes"
          searchValue={searchQuery}
          onSearchChange={setSearchQuery}
          onRefresh={loadDemandes}
          onMenuClick={() => setSidebarCollapsed((prev) => !prev)}
        />
        
        <main className="main-content">
          {isLoading && <LoadingSpinner overlay text="Chargement de mes demandes..." />}
          <div className="mes-demandes-page">
            <div className="demandes-table-container">
              <table className="demandes-table">
                <thead>
                  <tr>
                    <th>Reference</th>
                    <th>Produit</th>
                    <th>Quantite</th>
                    <th>Date</th>
                    <th>Statut</th>
                    <th className="actions-col">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDemandes.map((demande, index) => {
                    const statutInfo = getStatutInfo(demande.statut);
                    const StatutIcon = statutInfo.icon;
                    return (
                      <tr key={demande.id} style={{ animationDelay: `${index * 50}ms` }}>
                        <td className="ref-cell">{demande.reference}</td>
                        <td className="product-cell">
                          <Package size={16} />
                          <div>
                            <span className="product-name">{demande.produit}</span>
                            <span className="product-code">{demande.codeProduit}</span>
                          </div>
                        </td>
                        <td className="quantity-cell">{demande.quantite}</td>
                        <td className="date-cell">
                          <Calendar size={14} />
                          {demande.date}
                        </td>
                        <td>
                          <span className={`statut-badge ${statutInfo.className}`}>
                            <StatutIcon size={14} />
                            {statutInfo.label}
                          </span>
                          {demande.statut === 'served' && (
                            <div className="receipt-row">
                              <button
                                type="button"
                                className="btn-confirm-receipt"
                                onClick={() => confirmReceipt(demande)}
                                disabled={isSubmitting}
                              >
                                Confirmer reception
                              </button>
                              {demande.receiptToken ? (
                                <small className="receipt-code">
                                  Code: <strong>{demande.receiptToken}</strong>
                                </small>
                              ) : null}
                            </div>
                          )}
                        </td>
                        <td className="actions-cell">
                          {demande.statut === 'pending' ? (
                            <button
                              type="button"
                              className="btn-edit-request"
                              onClick={() => openEdit(demande)}
                              disabled={isSubmitting}
                              aria-label={`Modifier ${demande.reference}`}
                            >
                              <Pencil size={14} />
                              Modifier
                            </button>
                          ) : (
                            <span className="actions-muted">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="demandes-footer">
              <p>{filteredDemandes.length} demande{filteredDemandes.length > 1 ? 's' : ''}</p>
            </div>
          </div>
        </main>
      </div>

      {editTarget && (
        <div
          className="dem-edit-overlay"
          onClick={closeEdit}
          role="dialog"
          aria-modal="true"
          aria-labelledby="dem-edit-title"
        >
          <div className="dem-edit-content" onClick={(e) => e.stopPropagation()}>
            {isSubmitting && <LoadingSpinner overlay text="Mise à jour en cours..." />}

            <div className="dem-edit-head">
              <h2 id="dem-edit-title">Modifier la demande</h2>
              <button type="button" className="dem-edit-close" onClick={closeEdit} disabled={isSubmitting} aria-label="Fermer">
                <X size={20} />
              </button>
            </div>

            <div className="dem-edit-meta">
              <div><strong>{editTarget.reference}</strong> • {editTarget.produit}</div>
              <div className="dem-edit-hint">
                Modification possible uniquement tant que le statut est <strong>En attente</strong>.
              </div>
            </div>

            <form className="dem-edit-form" onSubmit={submitEdit} noValidate>
              <div className="dem-edit-grid">
                <div className="form-group">
                  <label htmlFor="edit-quantite">Quantité demandée</label>
                  <input
                    id="edit-quantite"
                    type="number"
                    min="1"
                    max="1000000000"
                    step="1"
                    value={editDraft.quantite}
                    onChange={(e) => setEditDraft((p) => ({ ...p, quantite: e.target.value }))}
                    className={editErrors.quantite ? 'error' : ''}
                    aria-invalid={editErrors.quantite ? 'true' : 'false'}
                    disabled={isSubmitting}
                  />
                  {editErrors.quantite && <span className="error-text" role="alert">{editErrors.quantite}</span>}
                </div>

                <div className="form-group">
                  <label htmlFor="edit-priority">Urgence</label>
                  <select
                    id="edit-priority"
                    value={editDraft.priority}
                    onChange={(e) => setEditDraft((p) => ({ ...p, priority: e.target.value }))}
                    disabled={isSubmitting}
                    className={editErrors.priority ? 'error' : ''}
                    aria-invalid={editErrors.priority ? 'true' : 'false'}
                  >
                    <option value="normal">Normale</option>
                    <option value="urgent">Urgente</option>
                    <option value="critical">Très urgente</option>
                  </select>
                  {editErrors.priority && <span className="error-text" role="alert">{editErrors.priority}</span>}
                </div>

                <div className="form-group dem-edit-span2">
                  <label htmlFor="edit-direction">Direction / Laboratoire</label>
                  <input
                    id="edit-direction"
                    type="text"
                    maxLength={80}
                    value={editDraft.directionLaboratoire}
                    onChange={(e) => setEditDraft((p) => ({ ...p, directionLaboratoire: e.target.value }))}
                    placeholder="Ex: DSP"
                    className={editErrors.directionLaboratoire ? 'error' : ''}
                    aria-invalid={editErrors.directionLaboratoire ? 'true' : 'false'}
                    disabled={isSubmitting}
                  />
                  {editErrors.directionLaboratoire && <span className="error-text" role="alert">{editErrors.directionLaboratoire}</span>}
                </div>

                <div className="form-group dem-edit-span2">
                  <label htmlFor="edit-note">Détails / commentaire (optionnel)</label>
                  <textarea
                    id="edit-note"
                    rows={3}
                    maxLength={600}
                    value={editDraft.note}
                    onChange={(e) => setEditDraft((p) => ({ ...p, note: e.target.value }))}
                    placeholder="Informations supplémentaires..."
                    disabled={isSubmitting}
                    className={editErrors.note ? 'error' : ''}
                    aria-invalid={editErrors.note ? 'true' : 'false'}
                  />
                  {editErrors.note && <span className="error-text" role="alert">{editErrors.note}</span>}
                </div>
              </div>

              <div className="dem-edit-actions">
                <button type="button" className="btn-cancel-edit" onClick={closeEdit} disabled={isSubmitting}>
                  Annuler
                </button>
                <button type="submit" className="btn-save-edit" disabled={isSubmitting}>
                  Enregistrer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default MesDemandes;

