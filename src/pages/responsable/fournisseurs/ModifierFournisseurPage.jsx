// BLOC 1 - Role du fichier.
// Ce fichier affiche une page du module fournisseurs responsable pour ModifierFournisseurPage.
// Point de vigilance: garder les props, appels API et classes CSS synchronises avec les ecrans existants.

import { useEffect, useState } from 'react';
import { Truck } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';

import SidebarResp from '../../../components/responsable/SidebarResp';
import HeaderPage from '../../../components/shared/HeaderPage';
import LoadingSpinner from '../../../components/shared/LoadingSpinner';
import { useToast } from '../../../components/shared/Toast';
import { useConfirm } from '../../../components/shared/ConfirmDialog';
import FournisseurForm from '../../../components/fournisseurs/FournisseurForm';
import { getFournisseur, updateFournisseur } from '../../../services/fournisseurService';

import '../FournisseursResp.css';

const ModifierFournisseurPage = ({ userName, onLogout }) => {
  const toast = useToast();
  const confirmAction = useConfirm();
  const { id } = useParams();
  const navigate = useNavigate();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => (typeof window !== 'undefined' ? window.innerWidth <= 768 : false));
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [supplier, setSupplier] = useState(null);

  useEffect(() => {
    const sid = String(id || '').trim();
    if (!sid) return;
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const res = await getFournisseur(sid);
        if (!alive) return;
        setSupplier(res?.supplier || null);
      } catch (e) {
        toast.error(e.message || 'Chargement fournisseur échoué');
        navigate('/responsable/fournisseurs');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [id, navigate, toast]);

  const submit = async (draft) => {
    const sid = String(id || '').trim();
    if (!sid || saving) return;
    setSaving(true);
    const payload = {
      name: String(draft?.name || '').trim(),
      email: String(draft?.email || '').trim(),
      phone: String(draft?.phone || '').trim(),
      address: String(draft?.address || '').trim(),
      domain: String(draft?.domain || '').trim(),
      main_contact: String(draft?.main_contact || '').trim(),
      internal_note: String(draft?.internal_note || '').trim(),
      status: String(draft?.status || 'ACTIF'),
      reliability_level: String(draft?.reliability_level || 'NON_EVALUE'),
      last_verification_date: draft?.last_verification_date ? String(draft.last_verification_date) : null,
      default_lead_time_days: Number(draft?.default_lead_time_days || 7),
    };
    try {
      await updateFournisseur(sid, payload);
      toast.success('Fournisseur mis à jour.');
      navigate(`/responsable/fournisseurs/${sid}`);
    } catch (err) {
      const code = err?.data?.code;
      if (code === 'DUPLICATE_WARNING') {
        const list = Array.isArray(err?.data?.potential_duplicates) ? err.data.potential_duplicates : [];
        const details = list.slice(0, 5).map((d) => `${d.name} (${d.similarity ?? '?'})`);
        const ok = await confirmAction({
          title: 'Doublon potentiel detecte',
          badge: 'Verification requise',
          message: 'Des fiches fournisseurs proches existent deja. Voulez-vous mettre a jour quand meme ?',
          details,
          confirmLabel: 'Mettre a jour',
          variant: 'warning',
        });
        if (ok) {
          await updateFournisseur(sid, { ...payload, confirm_duplicate: true });
          toast.success('Fournisseur mis à jour.');
          navigate(`/responsable/fournisseurs/${sid}`);
          return;
        }
      }
      toast.error(err.message || 'Modification fournisseur échouée');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="resp-suppliers">
      <SidebarResp collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed((p) => !p)} onLogout={onLogout} userName={userName} />
      <div className={`resp-suppliers-main ${sidebarCollapsed ? 'collapsed' : ''}`}>
        <HeaderPage
          userName={userName}
          title="Modifier fournisseur"
          subtitle={supplier?.name ? supplier.name : 'Chargement...'}
          icon={<Truck size={22} />}
          showSearch={false}
          onMenuClick={() => setSidebarCollapsed((p) => !p)}
        />
        <div className="resp-suppliers-page">
          {loading && <LoadingSpinner overlay text="Chargement fournisseur..." />}
          <FournisseurForm
            initialValue={supplier || {}}
            submitLabel="Enregistrer"
            onSubmit={submit}
            onCancel={() => navigate(`/responsable/fournisseurs/${String(id || '').trim()}`)}
            disabled={saving || loading}
          />
        </div>
      </div>
    </div>
  );
};

export default ModifierFournisseurPage;
