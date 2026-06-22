// BLOC 1 - Role du fichier.
// Ce fichier affiche une page du module fournisseurs responsable pour FournisseurDocumentsPage.
// Point de vigilance: garder les props, appels API et classes CSS synchronises avec les ecrans existants.

import { useEffect, useMemo, useState } from 'react';
import { FileText, Plus, Trash2, Truck } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';

import SidebarResp from '../../../components/responsable/SidebarResp';
import HeaderPage from '../../../components/shared/HeaderPage';
import LoadingSpinner from '../../../components/shared/LoadingSpinner';
import { useToast } from '../../../components/shared/Toast';
import { useConfirm } from '../../../components/shared/ConfirmDialog';
import FournisseurDetailsHeader from '../../../components/fournisseurs/FournisseurDetailsHeader';
import FournisseurTabs from '../../../components/fournisseurs/FournisseurTabs';

import { getFournisseur, getFournisseurMetrics, updateFournisseurStatus } from '../../../services/fournisseurService';
import { addSupplierDocument, getSupplierDocuments, removeSupplierDocument } from '../../../services/fournisseurLocalStore';
import { appendLocalAudit } from '../../../services/fournisseurAuditService';

import '../FournisseursResp.css';

const DOCUMENT_KINDS = [
  'Registre de commerce',
  'Matricule fiscal',
  'Attestation bancaire',
  'Contrat fournisseur',
  'Certificat qualité',
  'Autre pièce',
];

const FournisseurDocumentsPage = ({ userName, onLogout }) => {
  const toast = useToast();
  const confirmAction = useConfirm();
  const { id } = useParams();
  const navigate = useNavigate();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => (typeof window !== 'undefined' ? window.innerWidth <= 768 : false));
  const [loading, setLoading] = useState(false);
  const [supplier, setSupplier] = useState(null);
  const [score, setScore] = useState(null);

  const sid = String(supplier?._id || id || '').trim();
  const documents = getSupplierDocuments(sid);

  const [draftKind, setDraftKind] = useState(DOCUMENT_KINDS[0]);
  const [draftExpiry, setDraftExpiry] = useState('');
  const docStatus = useMemo(() => {
    if (!draftExpiry) return 'Déposé';
    const d = new Date(draftExpiry);
    if (Number.isNaN(d.getTime())) return 'Déposé';
    if (d.getTime() < Date.now()) return 'Expiré';
    return 'Déposé';
  }, [draftExpiry]);

  useEffect(() => {
    const supplierId = String(id || '').trim();
    if (!supplierId) return;
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const [detail, metrics] = await Promise.all([
          getFournisseur(supplierId),
          getFournisseurMetrics(supplierId).catch(() => ({ score: null })),
        ]);
        if (!alive) return;
        setSupplier(detail?.supplier || null);
        setScore(typeof metrics?.score === 'number' ? metrics.score : null);
      } catch (e) {
        toast.error(e.message || 'Chargement documents échoué');
        navigate('/responsable/fournisseurs');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [id, navigate, toast]);

  const toggleStatus = async () => {
    if (!supplier?._id) return;
    const isSuspended = String(supplier?.status || '').toUpperCase() === 'SUSPENDU';
    const nextStatus = isSuspended ? 'ACTIF' : 'SUSPENDU';
    const ok = await confirmAction({
      title: isSuspended ? 'Reactiver le fournisseur' : 'Suspendre le fournisseur',
      badge: 'Referentiel fournisseurs',
      message: isSuspended ? 'Ce fournisseur redeviendra disponible.' : 'Ce fournisseur sera suspendu.',
      confirmLabel: isSuspended ? 'Reactiver' : 'Suspendre',
      variant: isSuspended ? 'success' : 'warning',
    });
    if (!ok) return;
    try {
      await updateFournisseurStatus(supplier._id, nextStatus);
      toast.success('Statut fournisseur mis à jour.');
      const detail = await getFournisseur(supplier._id);
      setSupplier(detail?.supplier || null);
    } catch (e) {
      toast.error(e.message || 'Changement statut échoué');
    }
  };

  const add = () => {
    if (!sid) return;
    const next = addSupplierDocument(sid, { kind: draftKind, expiresAt: draftExpiry ? new Date(draftExpiry).toISOString() : null, status: docStatus });
    appendLocalAudit(sid, { action: 'DOCUMENT_AJOUTE', comment: `Document ajouté: ${draftKind}` });
    toast.success('Document ajouté.');
    return next;
  };

  const remove = (docId) => {
    if (!sid) return;
    removeSupplierDocument(sid, docId);
    appendLocalAudit(sid, { action: 'DOCUMENT_SUPPRIME', comment: 'Document supprimé.' });
    toast.success('Document supprimé.');
  };

  return (
    <div className="resp-suppliers">
      <SidebarResp collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed((p) => !p)} onLogout={onLogout} userName={userName} />
      <div className={`resp-suppliers-main ${sidebarCollapsed ? 'collapsed' : ''}`}>
        <HeaderPage
          userName={userName}
          title="Documents fournisseur"
          subtitle="Centraliser les documents administratifs"
          icon={<FileText size={22} />}
          showSearch={false}
          onMenuClick={() => setSidebarCollapsed((p) => !p)}
        />
        <div className="resp-suppliers-page">
          {loading && <LoadingSpinner overlay text="Chargement documents..." />}
          <FournisseurDetailsHeader
            fournisseur={supplier}
            score={score}
            onEdit={() => navigate(`/responsable/fournisseurs/${sid}/modifier`)}
            onCreateOrder={() => navigate(`/responsable/commandes/nouvelle?fournisseurId=${encodeURIComponent(sid)}`)}
            onNotify={() => navigate(`/responsable/fournisseurs/${sid}`)}
            onToggleStatus={toggleStatus}
          />
          <FournisseurTabs supplierId={sid} />

          <div className="resp-card" style={{ marginTop: 14 }}>
            <div className="f360-toolbar">
              <h3 style={{ margin: 0, display: 'flex', gap: 8, alignItems: 'center' }}><Truck size={18} />Documents</h3>
              <div className="f360-actions">
                <button className="f360-btn primary" type="button" onClick={add} disabled={!sid}><Plus size={16} />Ajouter</button>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 0.8fr', gap: 10, marginTop: 12 }}>
              <select value={draftKind} onChange={(e) => setDraftKind(e.target.value)}>
                {DOCUMENT_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
              </select>
              <input type="date" value={draftExpiry} onChange={(e) => setDraftExpiry(e.target.value)} />
            </div>

            {!documents.length ? (
              <div className="resp-empty">Aucun document enregistré.</div>
            ) : (
              <table className="f360-table" style={{ marginTop: 10 }}>
                <thead>
                  <tr>
                    <th>Document</th>
                    <th>Statut</th>
                    <th>Expiration</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {documents.map((d) => (
                    <tr key={String(d?.id)}>
                      <td>{d?.kind || 'Document'}</td>
                      <td>{d?.status || '-'}</td>
                      <td>{d?.expiresAt ? new Date(d.expiresAt).toLocaleDateString('fr-FR') : '-'}</td>
                      <td>
                        <button className="f360-btn danger" type="button" onClick={() => remove(d.id)}><Trash2 size={16} />Supprimer</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default FournisseurDocumentsPage;
