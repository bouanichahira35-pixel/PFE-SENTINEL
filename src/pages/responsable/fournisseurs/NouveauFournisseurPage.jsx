// BLOC 1 - Role du fichier.
// Ce fichier affiche une page du module fournisseurs responsable pour NouveauFournisseurPage.
// Point de vigilance: garder les props, appels API et classes CSS synchronises avec les ecrans existants.

import { useState } from 'react';
import { Truck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import SidebarResp from '../../../components/responsable/SidebarResp';
import HeaderPage from '../../../components/shared/HeaderPage';
import { useToast } from '../../../components/shared/Toast';
import { useConfirm } from '../../../components/shared/ConfirmDialog';
import FournisseurForm from '../../../components/fournisseurs/FournisseurForm';
import { createFournisseur } from '../../../services/fournisseurService';

import '../FournisseursResp.css';

const NouveauFournisseurPage = ({ userName, onLogout }) => {
  const toast = useToast();
  const confirmAction = useConfirm();
  const navigate = useNavigate();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => (typeof window !== 'undefined' ? window.innerWidth <= 768 : false));
  const [saving, setSaving] = useState(false);

  const submit = async (draft) => {
    if (saving) return;
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
      const res = await createFournisseur(payload);
      const id = String(res?.supplier?._id || res?.supplier?.id || '').trim();
      toast.success('Fournisseur créé avec succès. Fiche fournisseur ouverte.');
      if (id) navigate(`/responsable/fournisseurs/${id}`);
      else navigate('/responsable/fournisseurs');
    } catch (err) {
      const code = err?.data?.code;
      if (code === 'DUPLICATE_WARNING') {
        const list = Array.isArray(err?.data?.potential_duplicates) ? err.data.potential_duplicates : [];
        const details = list.slice(0, 5).map((d) => `${d.name} (${d.similarity ?? '?'})`);
        const ok = await confirmAction({
          title: 'Doublon potentiel detecte',
          badge: 'Verification requise',
          message: 'Des fiches fournisseurs proches existent deja. Voulez-vous creer quand meme ?',
          details,
          confirmLabel: 'Creer quand meme',
          variant: 'warning',
        });
        if (ok) {
          const confirmed = await createFournisseur({ ...payload, confirm_duplicate: true });
          const sid = String(confirmed?.supplier?._id || confirmed?.supplier?.id || '').trim();
          toast.success('Fournisseur créé avec succès. Fiche fournisseur ouverte.');
          if (sid) navigate(`/responsable/fournisseurs/${sid}`);
          else navigate('/responsable/fournisseurs');
          return;
        }
      }
      toast.error(err.message || 'Création fournisseur échouée');
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
          title="Nouveau fournisseur"
          subtitle="Création d’une fiche fournisseur"
          icon={<Truck size={22} />}
          showSearch={false}
          onMenuClick={() => setSidebarCollapsed((p) => !p)}
        />
        <div className="resp-suppliers-page">
          <FournisseurForm
            submitLabel="Créer"
            onSubmit={submit}
            onCancel={() => navigate('/responsable/fournisseurs')}
            disabled={saving}
          />
        </div>
      </div>
    </div>
  );
};

export default NouveauFournisseurPage;
