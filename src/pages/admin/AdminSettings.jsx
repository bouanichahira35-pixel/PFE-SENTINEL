import { useCallback, useEffect, useMemo, useState } from 'react';
import { Settings, Save, RefreshCw, Wrench, ShieldAlert, Mail } from 'lucide-react';
import SidebarAdmin from '../../components/admin/SidebarAdmin';
import HeaderPage from '../../components/shared/HeaderPage';
import LoadingSpinner from '../../components/shared/LoadingSpinner';
import { get, patch } from '../../services/api';
import { useToast } from '../../components/shared/Toast';
import { asNonNegativeInt, isSafeText, sanitizeText } from '../../utils/formGuards';
import './AdminSettings.css';

const AdminSettings = ({ userName, onLogout }) => {
  const toast = useToast();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => (typeof window !== 'undefined' ? window.innerWidth <= 768 : false));
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [profileData, setProfileData] = useState({ nom: userName || 'Admin', email: '', telephone: '' });
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [maintenance, setMaintenance] = useState({ enabled: false, message: '' });
  const [aiGovernance, setAiGovernance] = useState({
    min_training_interval_minutes: 360,
    auto_training_enabled: true,
    auto_training_every_minutes: 360,
    max_versions_kept: 20,
  });
  const [runtimeLimits, setRuntimeLimits] = useState({
    auth_max_per_15min: 100,
    ai_max_per_min: 60,
    chat_max_per_min: 180,
    note: '',
  });
  const [supplierEmailPolicy, setSupplierEmailPolicy] = useState({
    enabled: true,
    send_on_create_ordered: true,
    send_on_update_to_ordered: true,
    include_lines: true,
    reminders_enabled: true,
    reminder_j1_enabled: true,
    overdue_enabled: true,
    reminder_j1_window_hours: 24,
    overdue_repeat_hours: 24,
    ack_reminders_enabled: true,
    ack_sla_hours: 24,
    ack_repeat_hours: 24,
  });

  const loadSettings = useCallback(async () => {
    setIsLoading(true);
    try {
      const profileRes = await get('/settings/me');
      if (profileRes?.user) {
        setProfileData({
          nom: profileRes.user.username || userName || 'Admin',
          email: profileRes.user.email || '',
          telephone: profileRes.user.telephone || '',
        });
      }
      const res = await get('/admin/settings');
      if (res?.maintenance) setMaintenance(res.maintenance);
      if (res?.ai_governance) setAiGovernance(res.ai_governance);
      if (res?.runtime_limits_hint) setRuntimeLimits(res.runtime_limits_hint);
      if (res?.supplier_email_policy) setSupplierEmailPolicy(res.supplier_email_policy);
    } catch (err) {
      toast.error(err.message || 'Erreur chargement paramètres admin');
    } finally {
      setIsLoading(false);
    }
  }, [toast, userName]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const save = useCallback(async () => {
    setIsSaving(true);
    try {
      const maintenancePayload = {
        enabled: Boolean(maintenance.enabled),
        message: sanitizeText(maintenance.message, { maxLen: 160 }),
      };
      if (maintenancePayload.message && !isSafeText(maintenancePayload.message, { min: 0, max: 160 })) {
        toast.error('Message maintenance invalide (max 160, sans < >).');
        return;
      }

      const aiGovernancePayload = {
        min_training_interval_minutes: asNonNegativeInt(aiGovernance.min_training_interval_minutes, { min: 5, max: 20000 }),
        auto_training_enabled: Boolean(aiGovernance.auto_training_enabled),
        auto_training_every_minutes: asNonNegativeInt(aiGovernance.auto_training_every_minutes, { min: 30, max: 20000 }),
        max_versions_kept: asNonNegativeInt(aiGovernance.max_versions_kept, { min: 5, max: 200 }),
      };

      const runtimeLimitsPayload = {
        auth_max_per_15min: asNonNegativeInt(runtimeLimits.auth_max_per_15min, { min: 10, max: 5000 }),
        ai_max_per_min: asNonNegativeInt(runtimeLimits.ai_max_per_min, { min: 5, max: 5000 }),
        chat_max_per_min: asNonNegativeInt(runtimeLimits.chat_max_per_min, { min: 10, max: 5000 }),
        note: sanitizeText(runtimeLimits.note, { maxLen: 240 }),
      };

      await patch('/admin/settings', {
        maintenance: maintenancePayload,
        ai_governance: aiGovernancePayload,
        runtime_limits_hint: runtimeLimitsPayload,
        supplier_email_policy: supplierEmailPolicy,
      });
      toast.success('Paramètres enregistrés.');
      await loadSettings();
    } catch (err) {
      toast.error(err.message || 'Enregistrement échoué');
    } finally {
      setIsSaving(false);
    }
  }, [aiGovernance, loadSettings, maintenance, runtimeLimits, supplierEmailPolicy, toast]);

  const saveProfile = useCallback(async () => {
    setIsSavingProfile(true);
    try {
      if (!isSafeText(profileData.nom, { min: 2, max: 60 })) {
        toast.error('Nom invalide (2-60).');
        return;
      }
      if (profileData.email && !isSafeText(profileData.email, { min: 3, max: 120 })) {
        toast.error('Email invalide.');
        return;
      }
      if (profileData.telephone && !isSafeText(profileData.telephone, { min: 6, max: 18 })) {
        toast.error('Téléphone invalide.');
        return;
      }
      const updated = await patch('/settings/me/profile', {
        username: profileData.nom,
        email: profileData.email,
        telephone: profileData.telephone,
      });
      if (updated?.user?.username) {
        setProfileData((p) => ({ ...p, nom: updated.user.username }));
      }
      toast.success('Profil admin mis à jour.');
    } catch (err) {
      toast.error(err.message || 'Erreur mise à jour profil');
    } finally {
      setIsSavingProfile(false);
    }
  }, [profileData, toast]);

  const note = useMemo(
    () =>
      "Ces paramètres sont réservés à l'informatique. Les modules métier (stock, demandes, validation) ne sont pas modifiables ici.",
    []
  );

  return (
    <div className="admin-layout">
      <SidebarAdmin
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((p) => !p)}
        onLogout={onLogout}
        userName={userName}
      />
      <div className={`admin-main ${sidebarCollapsed ? 'collapsed' : ''}`}>
        <HeaderPage title="Parametres Admin" subtitle="Configuration technique (optionnelle)" icon={<Settings size={24} />} />
        {(isLoading || isSaving) && <LoadingSpinner overlay text={isSaving ? 'Enregistrement...' : 'Chargement...'} />}
        <div className="admin-page">
          <div className="admin-toolbar">
            <button className="admin-btn" type="button" onClick={loadSettings} disabled={isLoading || isSaving}>
              <RefreshCw size={16} />
              <span>Actualiser</span>
            </button>
            <button className="admin-btn primary" type="button" onClick={save} disabled={isLoading || isSaving}>
              <Save size={16} />
              <span>Enregistrer</span>
            </button>
          </div>

          <div className="admin-grid">
            <div className="admin-card">
              <div className="admin-card-title"><Settings size={18} /> Profil personnel</div>
              <div className="admin-note">Données personnelles de l’administrateur IT.</div>
              <div className="grid-2">
                <label className="field">
                  <span>Nom</span>
                  <input
                    value={profileData.nom}
                    onChange={(e) => setProfileData((p) => ({ ...p, nom: e.target.value }))}
                    placeholder="Nom complet"
                  />
                </label>
                <label className="field">
                  <span>Email</span>
                  <input
                    type="email"
                    value={profileData.email}
                    onChange={(e) => setProfileData((p) => ({ ...p, email: e.target.value }))}
                    placeholder="admin@etap.tn"
                  />
                </label>
                <label className="field">
                  <span>Téléphone</span>
                  <input
                    value={profileData.telephone}
                    onChange={(e) => setProfileData((p) => ({ ...p, telephone: e.target.value }))}
                    placeholder="+216..."
                  />
                </label>
              </div>
              <button className="admin-btn primary" type="button" onClick={saveProfile} disabled={isSavingProfile || isLoading || isSaving}>
                <Save size={16} />
                <span>Enregistrer profil</span>
              </button>
            </div>
            <div className="admin-card">
              <div className="admin-card-title"><ShieldAlert size={18} /> Mode maintenance</div>
              <div className="admin-note">
                Active un bandeau d'information (healthcheck + console). Utile lors d'une intervention planifiée.
              </div>
              <label className="toggle-row">
                <span>Maintenance activée</span>
                <input
                  type="checkbox"
                  checked={Boolean(maintenance.enabled)}
                  onChange={(e) => setMaintenance((p) => ({ ...p, enabled: e.target.checked }))}
                />
              </label>
              <label className="field">
                <span>Message</span>
                <input
                  value={maintenance.message || ''}
                  onChange={(e) => setMaintenance((p) => ({ ...p, message: e.target.value }))}
                  placeholder="Ex: Intervention planifiée 22:00-22:30"
                />
              </label>
            </div>

            <div className="admin-card">
              <div className="admin-card-title"><Wrench size={18} /> Gouvernance IA</div>
              <div className="admin-note">Règles de supervision (auto-training, rétention des versions).</div>
              <div className="grid-2">
                <label className="field">
                  <span>Intervalle min (min)</span>
                  <input
                    type="number"
                    min="5"
                    max="20000"
                    value={aiGovernance.min_training_interval_minutes}
                    onChange={(e) => setAiGovernance((p) => ({ ...p, min_training_interval_minutes: Number(e.target.value || 360) }))}
                  />
                </label>
                <label className="field">
                  <span>Auto-training (min)</span>
                  <input
                    type="number"
                    min="30"
                    max="20000"
                    value={aiGovernance.auto_training_every_minutes}
                    onChange={(e) => setAiGovernance((p) => ({ ...p, auto_training_every_minutes: Number(e.target.value || 360) }))}
                  />
                </label>
                <label className="toggle-row">
                  <span>Auto-training activé</span>
                  <input
                    type="checkbox"
                    checked={Boolean(aiGovernance.auto_training_enabled)}
                    onChange={(e) => setAiGovernance((p) => ({ ...p, auto_training_enabled: e.target.checked }))}
                  />
                </label>
                <label className="field">
                  <span>Versions max</span>
                  <input
                    type="number"
                    min="5"
                    max="200"
                    value={aiGovernance.max_versions_kept}
                    onChange={(e) => setAiGovernance((p) => ({ ...p, max_versions_kept: Number(e.target.value || 20) }))}
                  />
                </label>
              </div>
            </div>

            <div className="admin-card">
              <div className="admin-card-title"><Wrench size={18} /> Limites (indication)</div>
              <div className="admin-note">
                Ces champs servent de référence/documentation. Les limites actives sont lues depuis l'environnement au démarrage.
              </div>
              <div className="grid-2">
                <label className="field">
                  <span>Auth / 15min</span>
                  <input
                    type="number"
                    min="10"
                    max="5000"
                    value={runtimeLimits.auth_max_per_15min}
                    onChange={(e) => setRuntimeLimits((p) => ({ ...p, auth_max_per_15min: Number(e.target.value || 100) }))}
                  />
                </label>
                <label className="field">
                  <span>IA / min</span>
                  <input
                    type="number"
                    min="5"
                    max="5000"
                    value={runtimeLimits.ai_max_per_min}
                    onChange={(e) => setRuntimeLimits((p) => ({ ...p, ai_max_per_min: Number(e.target.value || 60) }))}
                  />
                </label>
                <label className="field">
                  <span>Chat / min</span>
                  <input
                    type="number"
                    min="10"
                    max="5000"
                    value={runtimeLimits.chat_max_per_min}
                    onChange={(e) => setRuntimeLimits((p) => ({ ...p, chat_max_per_min: Number(e.target.value || 180) }))}
                  />
                </label>
              </div>
            </div>

            <div className="admin-card">
              <div className="admin-card-title"><Mail size={18} /> Emails fournisseurs</div>
              <div className="admin-note">
                Envoi automatique vers le fournisseur (si email renseigne) lors d'une commande.
              </div>
              <label className="toggle-row">
                <span>Activer l'envoi</span>
                <input
                  type="checkbox"
                  checked={Boolean(supplierEmailPolicy.enabled)}
                  onChange={(e) => setSupplierEmailPolicy((p) => ({ ...p, enabled: e.target.checked }))}
                />
              </label>
              <label className="toggle-row">
                <span>Envoi a la creation (ordered)</span>
                <input
                  type="checkbox"
                  checked={Boolean(supplierEmailPolicy.send_on_create_ordered)}
                  onChange={(e) => setSupplierEmailPolicy((p) => ({ ...p, send_on_create_ordered: e.target.checked }))}
                  disabled={!supplierEmailPolicy.enabled}
                />
              </label>
              <label className="toggle-row">
                <span>Envoi si draft -&gt; ordered</span>
                <input
                  type="checkbox"
                  checked={Boolean(supplierEmailPolicy.send_on_update_to_ordered)}
                  onChange={(e) => setSupplierEmailPolicy((p) => ({ ...p, send_on_update_to_ordered: e.target.checked }))}
                  disabled={!supplierEmailPolicy.enabled}
                />
              </label>
              <label className="toggle-row">
                <span>Inclure lignes (produits/qte)</span>
                <input
                  type="checkbox"
                  checked={Boolean(supplierEmailPolicy.include_lines)}
                  onChange={(e) => setSupplierEmailPolicy((p) => ({ ...p, include_lines: e.target.checked }))}
                  disabled={!supplierEmailPolicy.enabled}
                />
              </label>
              <div className="admin-note" style={{ marginTop: 10 }}>
                Relances automatiques (J-1 et retard) selon la date prévue.
              </div>
              <label className="toggle-row">
                <span>Activer relances</span>
                <input
                  type="checkbox"
                  checked={Boolean(supplierEmailPolicy.reminders_enabled)}
                  onChange={(e) => setSupplierEmailPolicy((p) => ({ ...p, reminders_enabled: e.target.checked }))}
                  disabled={!supplierEmailPolicy.enabled}
                />
              </label>
              <label className="toggle-row">
                <span>Relance J-1</span>
                <input
                  type="checkbox"
                  checked={Boolean(supplierEmailPolicy.reminder_j1_enabled)}
                  onChange={(e) => setSupplierEmailPolicy((p) => ({ ...p, reminder_j1_enabled: e.target.checked }))}
                  disabled={!supplierEmailPolicy.enabled || !supplierEmailPolicy.reminders_enabled}
                />
              </label>
              <label className="toggle-row">
                <span>Relance retard</span>
                <input
                  type="checkbox"
                  checked={Boolean(supplierEmailPolicy.overdue_enabled)}
                  onChange={(e) => setSupplierEmailPolicy((p) => ({ ...p, overdue_enabled: e.target.checked }))}
                  disabled={!supplierEmailPolicy.enabled || !supplierEmailPolicy.reminders_enabled}
                />
              </label>
              <div className="grid-2" style={{ marginTop: 8 }}>
                <label className="field">
                  <span>Fenêtre J-1 (h)</span>
                  <input
                    type="number"
                    min="6"
                    max="168"
                    value={Number(supplierEmailPolicy.reminder_j1_window_hours || 24)}
                    onChange={(e) => setSupplierEmailPolicy((p) => ({ ...p, reminder_j1_window_hours: Number(e.target.value || 24) }))}
                    disabled={!supplierEmailPolicy.enabled || !supplierEmailPolicy.reminders_enabled}
                  />
                </label>
                <label className="field">
                  <span>Répétition retard (h)</span>
                  <input
                    type="number"
                    min="6"
                    max="168"
                    value={Number(supplierEmailPolicy.overdue_repeat_hours || 24)}
                    onChange={(e) => setSupplierEmailPolicy((p) => ({ ...p, overdue_repeat_hours: Number(e.target.value || 24) }))}
                    disabled={!supplierEmailPolicy.enabled || !supplierEmailPolicy.reminders_enabled}
                  />
                </label>
              </div>
            </div>

            <div className="admin-card">
              <div className="admin-card-title"><Mail size={18} /> Fournisseur: confirmation ETA</div>
              <div className="admin-note">
                Relance automatique si le fournisseur ne confirme pas l'ETA via le portail (accusé de prise en charge).
              </div>
              <label className="toggle-row">
                <span>Relance ETA activée</span>
                <input
                  type="checkbox"
                  checked={Boolean(supplierEmailPolicy.ack_reminders_enabled)}
                  onChange={(e) => setSupplierEmailPolicy((p) => ({ ...p, ack_reminders_enabled: e.target.checked }))}
                  disabled={!supplierEmailPolicy.enabled}
                />
              </label>
              <div className="grid-2" style={{ marginTop: 8 }}>
                <label className="field">
                  <span>Délai SLA (h)</span>
                  <input
                    type="number"
                    min="6"
                    max="168"
                    value={Number(supplierEmailPolicy.ack_sla_hours || 24)}
                    onChange={(e) => setSupplierEmailPolicy((p) => ({ ...p, ack_sla_hours: Number(e.target.value || 24) }))}
                    disabled={!supplierEmailPolicy.enabled || !supplierEmailPolicy.ack_reminders_enabled}
                  />
                </label>
                <label className="field">
                  <span>Répétition (h)</span>
                  <input
                    type="number"
                    min="6"
                    max="168"
                    value={Number(supplierEmailPolicy.ack_repeat_hours || 24)}
                    onChange={(e) => setSupplierEmailPolicy((p) => ({ ...p, ack_repeat_hours: Number(e.target.value || 24) }))}
                    disabled={!supplierEmailPolicy.enabled || !supplierEmailPolicy.ack_reminders_enabled}
                  />
                </label>
              </div>
            </div>

            <div className="admin-card">
              <div className="admin-card-title">Note</div>
              <div className="admin-note">{note}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminSettings;
