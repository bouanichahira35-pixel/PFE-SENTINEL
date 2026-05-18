import { useCallback, useEffect, useState } from 'react';
import { Truck } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';

import SidebarResp from '../../../components/responsable/SidebarResp';
import HeaderPage from '../../../components/shared/HeaderPage';
import LoadingSpinner from '../../../components/shared/LoadingSpinner';
import { useToast } from '../../../components/shared/Toast';

import FournisseurDetailsHeader from '../../../components/fournisseurs/FournisseurDetailsHeader';
import FournisseurTabs from '../../../components/fournisseurs/FournisseurTabs';
import FournisseurOrdersPreview from '../../../components/fournisseurs/FournisseurOrdersPreview';
import FournisseurDocumentsPanel from '../../../components/fournisseurs/FournisseurDocumentsPanel';
import FournisseurEvaluationPanel from '../../../components/fournisseurs/FournisseurEvaluationPanel';
import FournisseurTimeline from '../../../components/fournisseurs/FournisseurTimeline';
import FournisseurNotificationModal from '../../../components/fournisseurs/FournisseurNotificationModal';

import { getFournisseur, getFournisseurMetrics, updateFournisseurStatus } from '../../../services/fournisseurService';
import { getMergedSupplierHistory } from '../../../services/fournisseurAuditService';
import { getSupplierDocuments } from '../../../services/fournisseurLocalStore';
import { getSupplierEvaluation } from '../../../services/fournisseurLocalStore';

import '../FournisseursResp.css';

const FicheFournisseurPage = ({ userName, onLogout }) => {
  const toast = useToast();
  const { id } = useParams();
  const navigate = useNavigate();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => (typeof window !== 'undefined' ? window.innerWidth <= 768 : false));
  const [loading, setLoading] = useState(false);
  const [supplier, setSupplier] = useState(null);
  const [score, setScore] = useState(null);
  const [history, setHistory] = useState([]);
  const [notifyOpen, setNotifyOpen] = useState(false);

  const load = useCallback(async () => {
    const sid = String(id || '').trim();
    if (!sid) return;
    setLoading(true);
    try {
      const [detail, metrics, merged] = await Promise.all([
        getFournisseur(sid),
        getFournisseurMetrics(sid).catch(() => ({ score: null })),
        getMergedSupplierHistory(sid, { limit: 40 }).catch(() => []),
      ]);
      setSupplier(detail?.supplier || null);
      setScore(typeof metrics?.score === 'number' ? metrics.score : null);
      setHistory(Array.isArray(merged) ? merged : []);
    } catch (e) {
      toast.error(e.message || 'Chargement fiche fournisseur échoué');
      navigate('/responsable/fournisseurs');
    } finally {
      setLoading(false);
    }
  }, [id, navigate, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const sid = String(supplier?._id || id || '').trim();
  const documents = getSupplierDocuments(sid);
  const evaluation = getSupplierEvaluation(sid);

  const toggleStatus = async () => {
    if (!supplier?._id) return;
    const isSuspended = String(supplier?.status || '').toUpperCase() === 'SUSPENDU';
    const nextStatus = isSuspended ? 'ACTIF' : 'SUSPENDU';
    // eslint-disable-next-line no-alert
    const ok = window.confirm(isSuspended ? 'Réactiver ce fournisseur ?' : 'Suspendre ce fournisseur ? Il ne pourra plus être utilisé pour une nouvelle commande.');
    if (!ok) return;
    try {
      await updateFournisseurStatus(supplier._id, nextStatus);
      toast.success('Statut fournisseur mis à jour.');
      await load();
    } catch (e) {
      toast.error(e.message || 'Changement statut échoué');
    }
  };

  return (
    <div className="resp-suppliers">
      <SidebarResp collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed((p) => !p)} onLogout={onLogout} userName={userName} />
      <div className={`resp-suppliers-main ${sidebarCollapsed ? 'collapsed' : ''}`}>
        <HeaderPage
          userName={userName}
          title="Fiche fournisseur 360°"
          subtitle="Vue détaillée fournisseur"
          icon={<Truck size={22} />}
          showSearch={false}
          onMenuClick={() => setSidebarCollapsed((p) => !p)}
          onRefresh={load}
        />
        <div className="resp-suppliers-page">
          {loading && <LoadingSpinner overlay text="Chargement fiche fournisseur..." />}

          <FournisseurDetailsHeader
            fournisseur={supplier}
            score={score}
            onEdit={() => navigate(`/responsable/fournisseurs/${sid}/modifier`)}
            onCreateOrder={() => navigate(`/responsable/commandes/nouvelle?fournisseurId=${encodeURIComponent(sid)}`)}
            onNotify={() => setNotifyOpen(true)}
            onToggleStatus={toggleStatus}
          />

          <FournisseurTabs supplierId={sid} />

          <div className="resp-suppliers-grid" style={{ gridTemplateColumns: '1fr 1fr', marginTop: 14 }}>
            <div className="resp-card">
              <h3 style={{ margin: 0 }}>Vue générale</h3>
              {!supplier ? (
                <div className="resp-empty">Fournisseur introuvable.</div>
              ) : (
                <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div className="resp-mini">
                    <div className="resp-mini-name">Informations</div>
                    <div className="f360-muted" style={{ marginTop: 6 }}>Adresse: {supplier.address || '-'}</div>
                    <div className="f360-muted">Contact: {supplier.main_contact || '-'}</div>
                    <div className="f360-muted">Notes: {supplier.internal_note || '-'}</div>
                  </div>
                  <div className="resp-mini">
                    <div className="resp-mini-name">Qualité fiche</div>
                    <div className="f360-muted" style={{ marginTop: 6 }}>État: {supplier.profile_state || '-'}</div>
                    <div className="f360-muted">Champs manquants: {Array.isArray(supplier.missing_fields) && supplier.missing_fields.length ? supplier.missing_fields.join(', ') : '—'}</div>
                  </div>
                </div>
              )}
            </div>
            <FournisseurOrdersPreview
              supplierId={sid}
              onOpenCommande={(po) => {
                const poId = String(po?._id || '').trim();
                if (poId) navigate(`/responsable/commandes/${poId}`);
              }}
            />
          </div>

          <div className="resp-suppliers-grid" style={{ gridTemplateColumns: '1fr 1fr', marginTop: 14 }}>
            <FournisseurDocumentsPanel
              documents={documents}
              onAdd={() => navigate(`/responsable/fournisseurs/${sid}/documents`)}
            />
            <FournisseurEvaluationPanel
              evaluation={evaluation}
              onOpen={() => navigate(`/responsable/fournisseurs/${sid}/evaluation`)}
            />
          </div>

          <div style={{ marginTop: 14 }}>
            <FournisseurTimeline items={history} />
          </div>
        </div>
      </div>

      <FournisseurNotificationModal
        open={notifyOpen}
        fournisseur={supplier}
        onClose={() => setNotifyOpen(false)}
        onSent={() => toast.success('Notification envoyée au fournisseur.')}
      />
    </div>
  );
};

export default FicheFournisseurPage;

