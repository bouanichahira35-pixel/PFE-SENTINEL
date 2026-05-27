import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bot, Save, RefreshCw, Sparkles, Wrench, Play, ListChecks, AlertTriangle } from 'lucide-react';
import SidebarAdmin from '../../components/admin/SidebarAdmin';
import HeaderPage from '../../components/shared/HeaderPage';
import LoadingSpinner from '../../components/shared/LoadingSpinner';
import { get, patch, post } from '../../services/api';
import { useToast } from '../../components/shared/Toast';
import { getUiErrorMessage } from '../../services/uiError';
import './AdminDashboard.css';
import './AdminIA.css';

function formatDateTimeFr(value) {
  if (!value) return 'Non disponible';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return 'Non disponible';
  try {
    return new Intl.DateTimeFormat('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d).replace(',', '').trim();
  } catch {
    return d.toISOString().slice(0, 16).replace('T', ' ');
  }
}

function pillToneFromStatus(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'ok' || s === 'success') return 'ok';
  if (s === 'warn' || s === 'check') return 'warn';
  if (s === 'bad' || s === 'error') return 'bad';
  return '';
}

function StatusPill({ label, tone }) {
  return <span className={`admin-pill ${pillToneFromStatus(tone)}`}>{label}</span>;
}

const AdminIA = ({ userName, onLogout }) => {
  const toast = useToast();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => (typeof window !== 'undefined' ? window.innerWidth <= 768 : false));

  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [assistantStatus, setAssistantStatus] = useState(null);
  const [geminiStatus, setGeminiStatus] = useState(null);
  const [modelsStatus, setModelsStatus] = useState(null);
  const [kpis, setKpis] = useState(null);
  const [recentActions, setRecentActions] = useState([]);
  const [aiConfig, setAiConfig] = useState({ predictionsEnabled: true, alertesAuto: true, analyseConsommation: true });

  const [lookbackDays, setLookbackDays] = useState(240);
  const [forceTrain, setForceTrain] = useState(false);

  const [confirmState, setConfirmState] = useState({ open: false, action: null });

  const loadAll = useCallback(async () => {
    setIsLoading(true);
    try {
      const [assistant, gemini, models, config, kpiResp, actionsResp] = await Promise.all([
        get('/ai/assistant/status').catch(() => null),
        get('/ai/gemini/status').catch(() => null),
        get('/ai/models/status').catch(() => null),
        get('/settings/ai/config').catch(() => null),
        get('/ai/admin/kpis').catch(() => null),
        get('/ai/admin/recent-actions?limit=8').catch(() => null),
      ]);
      setAssistantStatus(assistant);
      setGeminiStatus(gemini);
      setModelsStatus(models);
      setKpis(kpiResp);
      setRecentActions(Array.isArray(actionsResp?.items) ? actionsResp.items : []);
      const value = config?.value;
      if (value && typeof value === 'object') setAiConfig(value);
    } catch (err) {
      toast.error(getUiErrorMessage(err, 'Erreur chargement supervision IA'));
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const saveConfig = useCallback(async () => {
    setIsSaving(true);
    try {
      await patch('/settings/ai/config', aiConfig);
      toast.success('Configuration IA enregistrée.');
      await loadAll();
    } catch (err) {
      toast.error(getUiErrorMessage(err, 'Enregistrement configuration IA échoué'));
    } finally {
      setIsSaving(false);
    }
  }, [aiConfig, loadAll, toast]);

  const rebuildAlerts = useCallback(async () => {
    setIsSaving(true);
    try {
      await post('/ai/alerts/rebuild', { max_products: 800 });
      toast.success('Action lancée avec succès.');
      await loadAll();
    } catch (err) {
      toast.error(getUiErrorMessage(err, 'Impossible de lancer l’action. Veuillez réessayer.'));
    } finally {
      setIsSaving(false);
    }
  }, [loadAll, toast]);

  const trainModels = useCallback(async () => {
    setIsSaving(true);
    try {
      await post('/ai/models/train', { lookback_days: Number(lookbackDays || 240), force: Boolean(forceTrain) });
      toast.success('Action lancée avec succès.');
      await loadAll();
    } catch (err) {
      toast.error(getUiErrorMessage(err, 'Impossible de lancer l’action. Veuillez réessayer.'));
    } finally {
      setIsSaving(false);
    }
  }, [forceTrain, loadAll, lookbackDays, toast]);

  const modelLastUpdatedAt = useMemo(
    () => modelsStatus?.registry?.trained_at || assistantStatus?.models?.trained_at || null,
    [assistantStatus, modelsStatus]
  );

  const summary = useMemo(() => {
    const assistantAvailable = Boolean(assistantStatus?.ok);
    const geminiConnected = Boolean(geminiStatus?.configured);
    const modelsTrained = Boolean(modelsStatus?.trained || assistantStatus?.models?.trained);
    const predictionsEnabled = Boolean(aiConfig?.predictionsEnabled);
    const alertesEnabled = Boolean(aiConfig?.alertesAuto);
    const consommationEnabled = Boolean(aiConfig?.analyseConsommation);

    const needsCheck = !assistantAvailable || !geminiConnected || !modelsTrained;
    return {
      assistantAvailable,
      geminiConnected,
      modelsTrained,
      predictionsEnabled,
      alertesEnabled,
      consommationEnabled,
      needsCheck,
    };
  }, [aiConfig, assistantStatus, geminiStatus, modelsStatus]);

  const requestConfirm = useCallback((action) => {
    setConfirmState({ open: true, action });
  }, []);

  const closeConfirm = useCallback(() => {
    setConfirmState({ open: false, action: null });
  }, []);

  const confirmTitle = 'Confirmer l’action';
  const confirmMessage = 'Cette action peut prendre du temps et utiliser les ressources du serveur. Voulez-vous continuer ?';

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
          title="Supervision IA"
          subtitle="Suivi de l’assistant, des prédictions et des alertes intelligentes."
          icon={<Bot size={24} />}
        />
        {(isLoading || isSaving) && <LoadingSpinner overlay text={isSaving ? 'Traitement...' : 'Chargement...'} />}

        <div className="admin-page">
          <div className="admin-ia-grid">
            <div className="admin-card admin-card-wide">
              <div className="admin-card-title"><Sparkles size={18} /> Résumé IA</div>
              <div className="admin-ia-summary">
                <div className="admin-ia-summary-row">
                  <span>Assistant</span>
                  <StatusPill label={summary.assistantAvailable ? 'Disponible' : 'À vérifier'} tone={summary.assistantAvailable ? 'ok' : 'warn'} />
                </div>
                <div className="admin-ia-summary-row">
                  <span>Service IA (Gemini)</span>
                  <StatusPill label={summary.geminiConnected ? 'Connecté' : 'À vérifier'} tone={summary.geminiConnected ? 'ok' : 'warn'} />
                </div>
                <div className="admin-ia-summary-row">
                  <span>Prédictions</span>
                  <StatusPill label={summary.predictionsEnabled ? 'Activé' : 'À vérifier'} tone={summary.predictionsEnabled ? 'ok' : 'warn'} />
                </div>
                <div className="admin-ia-summary-row">
                  <span>Alertes automatiques</span>
                  <StatusPill label={summary.alertesEnabled ? 'Activé' : 'À vérifier'} tone={summary.alertesEnabled ? 'ok' : 'warn'} />
                </div>
                <div className="admin-ia-summary-row">
                  <span>Analyse de consommation</span>
                  <StatusPill label={summary.consommationEnabled ? 'Activé' : 'À vérifier'} tone={summary.consommationEnabled ? 'ok' : 'warn'} />
                </div>
              </div>

              <div className="admin-note" style={{ marginTop: 10 }}>
                Dernière mise à jour : <strong>{formatDateTimeFr(modelLastUpdatedAt)}</strong>
              </div>

              {summary.needsCheck ? (
                <div className="admin-warn">Un service IA nécessite une vérification.</div>
              ) : (
                <div className="admin-ok">Tous les services IA sont opérationnels.</div>
              )}
            </div>

            <div className="admin-ia-kpi-grid admin-card-wide">
              <div className="admin-card admin-ia-kpi-card">
                <div className="admin-ia-kpi-label">Produits analysés</div>
                <div className="admin-ia-kpi-value">{Number.isFinite(Number(kpis?.products_analyzed)) ? Number(kpis.products_analyzed) : 'Non disponible'}</div>
              </div>
              <div className="admin-card admin-ia-kpi-card">
                <div className="admin-ia-kpi-label">Alertes générées</div>
                <div className="admin-ia-kpi-value">{Number.isFinite(Number(kpis?.alerts_generated)) ? Number(kpis.alerts_generated) : 'Non disponible'}</div>
              </div>
              <div className="admin-card admin-ia-kpi-card">
                <div className="admin-ia-kpi-label">Prédictions disponibles</div>
                <div className="admin-ia-kpi-value">
                  {typeof kpis?.predictions_available === 'boolean' ? (kpis.predictions_available ? 'Oui' : 'Non') : 'Non disponible'}
                </div>
              </div>
              <div className="admin-card admin-ia-kpi-card">
                <div className="admin-ia-kpi-label">Erreurs IA</div>
                <div className="admin-ia-kpi-value">{Number.isFinite(Number(kpis?.errors_ai)) ? Number(kpis.errors_ai) : 'Non disponible'}</div>
              </div>
            </div>

            <div className="admin-card">
              <div className="admin-card-title"><Sparkles size={18} /> État</div>
              <div className="admin-kv admin-ia-kv">
                <div>
                  <span>Assistant IA</span>
                  <StatusPill label={summary.assistantAvailable ? 'Disponible' : 'À vérifier'} tone={summary.assistantAvailable ? 'ok' : 'warn'} />
                </div>
                <div>
                  <span>Service Gemini</span>
                  <StatusPill label={summary.geminiConnected ? 'Connecté' : 'À vérifier'} tone={summary.geminiConnected ? 'ok' : 'warn'} />
                </div>
                <div>
                  <span>Modèles</span>
                  <StatusPill label={summary.modelsTrained ? 'Entraînés' : 'À vérifier'} tone={summary.modelsTrained ? 'ok' : 'warn'} />
                </div>
                <div>
                  <span>Dernière mise à jour du modèle</span>
                  <strong style={{ fontSize: 14, fontWeight: 1000 }}>{formatDateTimeFr(modelLastUpdatedAt)}</strong>
                </div>
              </div>
              {modelsStatus?.registry?.model_version ? (
                <div className="admin-note" style={{ marginTop: 10 }}>
                  Version technique : <strong>{modelsStatus.registry.model_version}</strong>
                </div>
              ) : null}
              <button className="admin-btn" type="button" onClick={loadAll} disabled={isLoading || isSaving}>
                <RefreshCw size={16} />
                <span>Actualiser l’état</span>
              </button>
            </div>

            <div className="admin-card">
              <div className="admin-card-title"><Wrench size={18} /> Configuration</div>
              <div className="admin-toggles">
                <label className="toggle-row">
                  <div className="toggle-copy">
                    <div className="toggle-title">Prédictions de rupture</div>
                    <div className="toggle-desc">Estime les produits qui risquent de manquer.</div>
                  </div>
                  <div className="toggle-right">
                    <StatusPill label={aiConfig.predictionsEnabled ? 'Activé' : 'À vérifier'} tone={aiConfig.predictionsEnabled ? 'ok' : 'warn'} />
                    <input
                      type="checkbox"
                      checked={Boolean(aiConfig.predictionsEnabled)}
                      onChange={(e) => setAiConfig((p) => ({ ...p, predictionsEnabled: e.target.checked }))}
                    />
                  </div>
                </label>
                <label className="toggle-row">
                  <div className="toggle-copy">
                    <div className="toggle-title">Alertes automatiques</div>
                    <div className="toggle-desc">Génère des alertes à partir des données du stock.</div>
                  </div>
                  <div className="toggle-right">
                    <StatusPill label={aiConfig.alertesAuto ? 'Activé' : 'À vérifier'} tone={aiConfig.alertesAuto ? 'ok' : 'warn'} />
                    <input
                      type="checkbox"
                      checked={Boolean(aiConfig.alertesAuto)}
                      onChange={(e) => setAiConfig((p) => ({ ...p, alertesAuto: e.target.checked }))}
                    />
                  </div>
                </label>
                <label className="toggle-row">
                  <div className="toggle-copy">
                    <div className="toggle-title">Analyse de consommation</div>
                    <div className="toggle-desc">Suit les sorties et les hausses de consommation.</div>
                  </div>
                  <div className="toggle-right">
                    <StatusPill label={aiConfig.analyseConsommation ? 'Activé' : 'À vérifier'} tone={aiConfig.analyseConsommation ? 'ok' : 'warn'} />
                    <input
                      type="checkbox"
                      checked={Boolean(aiConfig.analyseConsommation)}
                      onChange={(e) => setAiConfig((p) => ({ ...p, analyseConsommation: e.target.checked }))}
                    />
                  </div>
                </label>
              </div>
              <button className="admin-btn primary" type="button" onClick={saveConfig} disabled={isLoading || isSaving}>
                <Save size={16} />
                <span>Enregistrer</span>
              </button>
            </div>

            <div className="admin-card">
              <div className="admin-card-title"><Play size={18} /> Actions</div>
              <div className="admin-actions">
                <div className="action-row">
                  <button className="admin-btn" type="button" onClick={() => requestConfirm('rebuild_alerts')} disabled={isLoading || isSaving}>
                    <Sparkles size={16} />
                    <span>Recalculer les alertes</span>
                  </button>
                </div>

                <div className="train-box">
                  <div className="train-row">
                    <label>
                      Période d’historique utilisée
                      <input
                        type="number"
                        min="30"
                        max="730"
                        value={lookbackDays}
                        onChange={(e) => setLookbackDays(Number(e.target.value || 240))}
                      />
                    </label>
                    <label className="train-force">
                      <input
                        type="checkbox"
                        checked={forceTrain}
                        onChange={(e) => setForceTrain(e.target.checked)}
                      />
                      <span>Relancer même si déjà calculé</span>
                    </label>
                  </div>
                  <button className="admin-btn primary" type="button" onClick={() => requestConfirm('train_models')} disabled={isLoading || isSaving}>
                    <Play size={16} />
                    <span>Lancer l’entraînement</span>
                  </button>
                  <div className="admin-note">
                    Ces actions sont réservées à l’administrateur car elles peuvent utiliser les ressources du serveur.
                  </div>
                </div>
              </div>
            </div>

            <div className="admin-card admin-card-wide">
              <div className="admin-card-title"><ListChecks size={18} /> Dernières actions IA</div>
              {recentActions.length ? (
                <div className="admin-ia-actions-list">
                  {recentActions.map((a) => (
                    <div key={a.id || `${a.date}-${a.action}`} className="admin-ia-actions-row">
                      <span className="admin-ia-actions-date">{formatDateTimeFr(a.date)}</span>
                      <span className="admin-ia-actions-action">{a.action || 'Action IA'}</span>
                      <span>
                        <StatusPill
                          label={a.result === 'success' ? 'Succès' : (a.result === 'error' ? 'Erreur' : 'À vérifier')}
                          tone={a.result === 'success' ? 'ok' : (a.result === 'error' ? 'bad' : 'warn')}
                        />
                      </span>
                      <span className="admin-ia-actions-user">{a.user || 'Admin'}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="admin-note">Aucune action IA récente.</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {confirmState.open ? (
        <div className="admin-modal-backdrop" role="dialog" aria-modal="true" onClick={closeConfirm}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-head">
              <div className="admin-modal-title">
                <AlertTriangle size={18} />
                <strong>{confirmTitle}</strong>
              </div>
              <button className="admin-btn" type="button" onClick={closeConfirm} disabled={isSaving}>
                Annuler
              </button>
            </div>
            <div className="admin-modal-body">
              {confirmMessage}
            </div>
            <div className="admin-modal-footer">
              <button className="admin-btn" type="button" onClick={closeConfirm} disabled={isSaving}>
                Annuler
              </button>
              <button
                className="admin-btn primary"
                type="button"
                onClick={async () => {
                  const action = confirmState.action;
                  closeConfirm();
                  if (action === 'rebuild_alerts') await rebuildAlerts();
                  if (action === 'train_models') await trainModels();
                }}
                disabled={isSaving}
              >
                Confirmer
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default AdminIA;

