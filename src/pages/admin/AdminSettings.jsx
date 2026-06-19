import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Bell,
  Info,
  Mail,
  RefreshCw,
  Save,
  Settings,
  ShieldAlert,
  SlidersHorizontal,
  UserRound,
  Wrench,
} from 'lucide-react';
import SidebarAdmin from '../../components/admin/SidebarAdmin';
import HeaderPage from '../../components/shared/HeaderPage';
import LoadingSpinner from '../../components/shared/LoadingSpinner';
import { get, patch } from '../../services/api';
import { useToast } from '../../components/shared/Toast';
import { getUiErrorMessage } from '../../services/uiError';
import { asNonNegativeInt, isSafeText, sanitizeText } from '../../utils/formGuards';
import './AdminDashboard.css';
import './AdminSettings.css';

const DEFAULT_AI_GOVERNANCE = {
  min_training_interval_minutes: 360,
  auto_training_enabled: true,
  auto_training_every_minutes: 360,
  max_versions_kept: 20,
};

const DEFAULT_RUNTIME_LIMITS = {
  auth_max_per_15min: 100,
  ai_max_per_min: 60,
  chat_max_per_min: 180,
  note: '',
};

const DEFAULT_SUPPLIER_EMAIL_POLICY = {
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
};

const AdminSettings = ({ userName, onLogout }) => {
  const toast = useToast();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => (typeof window !== 'undefined' ? window.innerWidth <= 768 : false));
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  const [profileData, setProfileData] = useState({ nom: userName || 'Admin', email: '', telephone: '' });
  const [maintenance, setMaintenance] = useState({ enabled: false, message: '' });
  const [aiGovernance, setAiGovernance] = useState(DEFAULT_AI_GOVERNANCE);
  const [runtimeLimits, setRuntimeLimits] = useState(DEFAULT_RUNTIME_LIMITS);
  const [supplierEmailPolicy, setSupplierEmailPolicy] = useState(DEFAULT_SUPPLIER_EMAIL_POLICY);

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
      toast.error(getUiErrorMessage(err, 'Erreur chargement parametres admin'));
    } finally {
      setIsLoading(false);
    }
  }, [toast, userName]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const saveTechnicalSettings = useCallback(async () => {
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

      toast.success('Parametres admin enregistres.');
      await loadSettings();
    } catch (err) {
      toast.error(getUiErrorMessage(err, 'Enregistrement echoue'));
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
        toast.error('Telephone invalide.');
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
      toast.success('Profil admin mis a jour.');
    } catch (err) {
      toast.error(getUiErrorMessage(err, 'Erreur mise a jour profil'));
    } finally {
      setIsSavingProfile(false);
    }
  }, [profileData, toast]);

  const settingsSummary = useMemo(
    () => [
      {
        label: 'Maintenance',
        value: maintenance.enabled ? 'Activee' : 'Desactivee',
        tone: maintenance.enabled ? 'danger' : 'ok',
      },
      {
        label: 'Gouvernance IA',
        value: aiGovernance.auto_training_enabled ? 'Auto-training actif' : 'Auto-training stoppe',
        tone: aiGovernance.auto_training_enabled ? 'ok' : 'warn',
      },
      {
        label: 'Emails fournisseurs',
        value: supplierEmailPolicy.enabled ? 'Envoi actif' : 'Envoi coupe',
        tone: supplierEmailPolicy.enabled ? 'ok' : 'warn',
      },
    ],
    [aiGovernance.auto_training_enabled, maintenance.enabled, supplierEmailPolicy.enabled]
  );

  const updateSupplierPolicy = (patchValues) => {
    setSupplierEmailPolicy((prev) => ({ ...prev, ...patchValues }));
  };

  const disabled = isLoading || isSaving;

  return (
    <div className="admin-layout">
      <SidebarAdmin
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((p) => !p)}
        onLogout={onLogout}
        userName={userName}
      />
      <div className={`admin-main ${sidebarCollapsed ? 'collapsed' : ''}`}>
        <HeaderPage
          title="Parametres admin"
          subtitle="Console technique reservee a l'administrateur"
          icon={<Settings size={24} />}
        />

        {(isLoading || isSaving) && <LoadingSpinner overlay text={isSaving ? 'Enregistrement...' : 'Chargement...'} />}

        <main className="admin-page admin-settings-page">
          <section className="admin-settings-hero">
            <div>
              <p className="admin-settings-eyebrow">Administration systeme</p>
              <h1>Parametres operationnels</h1>
              <p>
                Cette page ne reprend pas les parametres utilisateur des responsables. Elle centralise les reglages
                techniques qui impactent la plateforme.
              </p>
            </div>

            <div className="admin-settings-actions">
              <button className="admin-settings-btn" type="button" onClick={loadSettings} disabled={disabled}>
                <RefreshCw size={16} />
                Actualiser
              </button>
              <button className="admin-settings-btn primary" type="button" onClick={saveTechnicalSettings} disabled={disabled}>
                <Save size={16} />
                Enregistrer
              </button>
            </div>
          </section>

          <section className="admin-settings-summary" aria-label="Resume des reglages admin">
            {settingsSummary.map((item) => (
              <div className={`admin-settings-status ${item.tone}`} key={item.label}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </div>
            ))}
          </section>

          <div className="admin-settings-grid">
            <section className="admin-settings-card compact">
              <div className="admin-settings-card-head">
                <UserRound size={18} />
                <div>
                  <h2>Identite admin</h2>
                  <p>Informations visibles dans l'en-tete et les journaux d'audit.</p>
                </div>
              </div>

              <div className="admin-settings-form-grid">
                <label className="admin-settings-field">
                  <span>Nom</span>
                  <input
                    value={profileData.nom}
                    onChange={(e) => setProfileData((p) => ({ ...p, nom: e.target.value }))}
                    placeholder="Nom complet"
                  />
                </label>
                <label className="admin-settings-field">
                  <span>Email</span>
                  <input
                    type="email"
                    value={profileData.email}
                    onChange={(e) => setProfileData((p) => ({ ...p, email: e.target.value }))}
                    placeholder="admin@etap.tn"
                  />
                </label>
                <label className="admin-settings-field">
                  <span>Telephone</span>
                  <input
                    value={profileData.telephone}
                    onChange={(e) => setProfileData((p) => ({ ...p, telephone: e.target.value }))}
                    placeholder="+216..."
                  />
                </label>
              </div>

              <button
                className="admin-settings-btn primary inline"
                type="button"
                onClick={saveProfile}
                disabled={isSavingProfile || disabled}
              >
                <Save size={16} />
                Enregistrer le profil
              </button>
            </section>

            <section className="admin-settings-card compact">
              <div className="admin-settings-card-head">
                <ShieldAlert size={18} />
                <div>
                  <h2>Mode maintenance</h2>
                  <p>Bandeau d'intervention pour prevenir les utilisateurs.</p>
                </div>
              </div>

              <label className="admin-settings-toggle">
                <span>
                  <strong>Maintenance activee</strong>
                  <small>Utiliser seulement pendant une intervention planifiee.</small>
                </span>
                <input
                  type="checkbox"
                  checked={Boolean(maintenance.enabled)}
                  onChange={(e) => setMaintenance((p) => ({ ...p, enabled: e.target.checked }))}
                />
              </label>

              <label className="admin-settings-field">
                <span>Message affiche</span>
                <input
                  value={maintenance.message || ''}
                  onChange={(e) => setMaintenance((p) => ({ ...p, message: e.target.value }))}
                  placeholder="Ex: Intervention planifiee 22:00-22:30"
                />
              </label>
            </section>

            <section className="admin-settings-card">
              <div className="admin-settings-card-head">
                <Wrench size={18} />
                <div>
                  <h2>Gouvernance IA</h2>
                  <p>Cadre technique de l'entrainement et de la retention des versions.</p>
                </div>
              </div>

              <div className="admin-settings-form-grid">
                <label className="admin-settings-field">
                  <span>Intervalle minimum (min)</span>
                  <input
                    type="number"
                    min="5"
                    max="20000"
                    value={aiGovernance.min_training_interval_minutes}
                    onChange={(e) => setAiGovernance((p) => ({ ...p, min_training_interval_minutes: Number(e.target.value || 360) }))}
                  />
                </label>
                <label className="admin-settings-field">
                  <span>Auto-training toutes les (min)</span>
                  <input
                    type="number"
                    min="30"
                    max="20000"
                    value={aiGovernance.auto_training_every_minutes}
                    onChange={(e) => setAiGovernance((p) => ({ ...p, auto_training_every_minutes: Number(e.target.value || 360) }))}
                  />
                </label>
                <label className="admin-settings-field">
                  <span>Versions conservees</span>
                  <input
                    type="number"
                    min="5"
                    max="200"
                    value={aiGovernance.max_versions_kept}
                    onChange={(e) => setAiGovernance((p) => ({ ...p, max_versions_kept: Number(e.target.value || 20) }))}
                  />
                </label>
              </div>

              <label className="admin-settings-toggle separated">
                <span>
                  <strong>Auto-training active</strong>
                  <small>Desactiver si une analyse manuelle est necessaire.</small>
                </span>
                <input
                  type="checkbox"
                  checked={Boolean(aiGovernance.auto_training_enabled)}
                  onChange={(e) => setAiGovernance((p) => ({ ...p, auto_training_enabled: e.target.checked }))}
                />
              </label>
            </section>

            <section className="admin-settings-card">
              <div className="admin-settings-card-head">
                <SlidersHorizontal size={18} />
                <div>
                  <h2>Limites runtime</h2>
                  <p>Reference d'exploitation. Les limites effectives restent pilotees au demarrage par l'environnement.</p>
                </div>
              </div>

              <div className="admin-settings-warning">
                <Info size={16} />
                <span>Changer ces valeurs ici ne remplace pas une configuration serveur mal dimensionnee.</span>
              </div>

              <div className="admin-settings-form-grid">
                <label className="admin-settings-field">
                  <span>Auth / 15 min</span>
                  <input
                    type="number"
                    min="10"
                    max="5000"
                    value={runtimeLimits.auth_max_per_15min}
                    onChange={(e) => setRuntimeLimits((p) => ({ ...p, auth_max_per_15min: Number(e.target.value || 100) }))}
                  />
                </label>
                <label className="admin-settings-field">
                  <span>IA / min</span>
                  <input
                    type="number"
                    min="5"
                    max="5000"
                    value={runtimeLimits.ai_max_per_min}
                    onChange={(e) => setRuntimeLimits((p) => ({ ...p, ai_max_per_min: Number(e.target.value || 60) }))}
                  />
                </label>
                <label className="admin-settings-field">
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
            </section>

            <section className="admin-settings-card wide">
              <div className="admin-settings-card-head">
                <Mail size={18} />
                <div>
                  <h2>Emails fournisseurs</h2>
                  <p>Regles d'envoi et de relance pour les commandes fournisseur.</p>
                </div>
              </div>

              <div className="admin-settings-toggle-grid">
                <label className="admin-settings-toggle">
                  <span><strong>Envoi automatique</strong><small>Autorise les emails fournisseur.</small></span>
                  <input
                    type="checkbox"
                    checked={Boolean(supplierEmailPolicy.enabled)}
                    onChange={(e) => updateSupplierPolicy({ enabled: e.target.checked })}
                  />
                </label>
                <label className="admin-settings-toggle">
                  <span><strong>A la creation</strong><small>Commande creee au statut ordered.</small></span>
                  <input
                    type="checkbox"
                    checked={Boolean(supplierEmailPolicy.send_on_create_ordered)}
                    onChange={(e) => updateSupplierPolicy({ send_on_create_ordered: e.target.checked })}
                    disabled={!supplierEmailPolicy.enabled}
                  />
                </label>
                <label className="admin-settings-toggle">
                  <span><strong>Draft vers ordered</strong><small>Envoi quand la commande devient ferme.</small></span>
                  <input
                    type="checkbox"
                    checked={Boolean(supplierEmailPolicy.send_on_update_to_ordered)}
                    onChange={(e) => updateSupplierPolicy({ send_on_update_to_ordered: e.target.checked })}
                    disabled={!supplierEmailPolicy.enabled}
                  />
                </label>
                <label className="admin-settings-toggle">
                  <span><strong>Lignes commande</strong><small>Inclure produits et quantites.</small></span>
                  <input
                    type="checkbox"
                    checked={Boolean(supplierEmailPolicy.include_lines)}
                    onChange={(e) => updateSupplierPolicy({ include_lines: e.target.checked })}
                    disabled={!supplierEmailPolicy.enabled}
                  />
                </label>
              </div>
            </section>

            <section className="admin-settings-card">
              <div className="admin-settings-card-head">
                <Bell size={18} />
                <div>
                  <h2>Relances livraison</h2>
                  <p>Relances J-1 et retard selon la date prevue.</p>
                </div>
              </div>

              <div className="admin-settings-toggle-grid single">
                <label className="admin-settings-toggle">
                  <span><strong>Relances actives</strong><small>Active le moteur de relance fournisseur.</small></span>
                  <input
                    type="checkbox"
                    checked={Boolean(supplierEmailPolicy.reminders_enabled)}
                    onChange={(e) => updateSupplierPolicy({ reminders_enabled: e.target.checked })}
                    disabled={!supplierEmailPolicy.enabled}
                  />
                </label>
                <label className="admin-settings-toggle">
                  <span><strong>Relance J-1</strong><small>Avant la date de livraison prevue.</small></span>
                  <input
                    type="checkbox"
                    checked={Boolean(supplierEmailPolicy.reminder_j1_enabled)}
                    onChange={(e) => updateSupplierPolicy({ reminder_j1_enabled: e.target.checked })}
                    disabled={!supplierEmailPolicy.enabled || !supplierEmailPolicy.reminders_enabled}
                  />
                </label>
                <label className="admin-settings-toggle">
                  <span><strong>Relance retard</strong><small>Quand la livraison depasse l'echeance.</small></span>
                  <input
                    type="checkbox"
                    checked={Boolean(supplierEmailPolicy.overdue_enabled)}
                    onChange={(e) => updateSupplierPolicy({ overdue_enabled: e.target.checked })}
                    disabled={!supplierEmailPolicy.enabled || !supplierEmailPolicy.reminders_enabled}
                  />
                </label>
              </div>

              <div className="admin-settings-form-grid">
                <label className="admin-settings-field">
                  <span>Fenetre J-1 (h)</span>
                  <input
                    type="number"
                    min="6"
                    max="168"
                    value={Number(supplierEmailPolicy.reminder_j1_window_hours || 24)}
                    onChange={(e) => updateSupplierPolicy({ reminder_j1_window_hours: Number(e.target.value || 24) })}
                    disabled={!supplierEmailPolicy.enabled || !supplierEmailPolicy.reminders_enabled}
                  />
                </label>
                <label className="admin-settings-field">
                  <span>Repetition retard (h)</span>
                  <input
                    type="number"
                    min="6"
                    max="168"
                    value={Number(supplierEmailPolicy.overdue_repeat_hours || 24)}
                    onChange={(e) => updateSupplierPolicy({ overdue_repeat_hours: Number(e.target.value || 24) })}
                    disabled={!supplierEmailPolicy.enabled || !supplierEmailPolicy.reminders_enabled}
                  />
                </label>
              </div>
            </section>

            <section className="admin-settings-card">
              <div className="admin-settings-card-head">
                <AlertTriangle size={18} />
                <div>
                  <h2>Confirmation ETA</h2>
                  <p>Relance si le fournisseur ne confirme pas la date estimee.</p>
                </div>
              </div>

              <label className="admin-settings-toggle">
                <span>
                  <strong>Relance ETA activee</strong>
                  <small>Necessite un fournisseur joignable par email.</small>
                </span>
                <input
                  type="checkbox"
                  checked={Boolean(supplierEmailPolicy.ack_reminders_enabled)}
                  onChange={(e) => updateSupplierPolicy({ ack_reminders_enabled: e.target.checked })}
                  disabled={!supplierEmailPolicy.enabled}
                />
              </label>

              <div className="admin-settings-form-grid">
                <label className="admin-settings-field">
                  <span>Delai SLA (h)</span>
                  <input
                    type="number"
                    min="6"
                    max="168"
                    value={Number(supplierEmailPolicy.ack_sla_hours || 24)}
                    onChange={(e) => updateSupplierPolicy({ ack_sla_hours: Number(e.target.value || 24) })}
                    disabled={!supplierEmailPolicy.enabled || !supplierEmailPolicy.ack_reminders_enabled}
                  />
                </label>
                <label className="admin-settings-field">
                  <span>Repetition (h)</span>
                  <input
                    type="number"
                    min="6"
                    max="168"
                    value={Number(supplierEmailPolicy.ack_repeat_hours || 24)}
                    onChange={(e) => updateSupplierPolicy({ ack_repeat_hours: Number(e.target.value || 24) })}
                    disabled={!supplierEmailPolicy.enabled || !supplierEmailPolicy.ack_reminders_enabled}
                  />
                </label>
              </div>
            </section>
          </div>
        </main>
      </div>
    </div>
  );
};

export default AdminSettings;
