import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bot, Save, RefreshCw, Sparkles, Wrench, Play } from 'lucide-react';
import SidebarAdmin from '../../components/admin/SidebarAdmin';
import HeaderPage from '../../components/shared/HeaderPage';
import LoadingSpinner from '../../components/shared/LoadingSpinner';
import { get, patch, post } from '../../services/api';
import { useToast } from '../../components/shared/Toast';
import './AdminIA.css';

const AdminIA = ({ userName, onLogout }) => {
  const toast = useToast();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => (typeof window !== 'undefined' ? window.innerWidth <= 768 : false));

  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [assistantStatus, setAssistantStatus] = useState(null);
  const [geminiStatus, setGeminiStatus] = useState(null);
  const [modelsStatus, setModelsStatus] = useState(null);
  const [aiConfig, setAiConfig] = useState({ predictionsEnabled: true, alertesAuto: true, analyseConsommation: true });

  const [lookbackDays, setLookbackDays] = useState(240);
  const [forceTrain, setForceTrain] = useState(false);

  const loadAll = useCallback(async () => {
    setIsLoading(true);
    try {
      const [assistant, gemini, models, config] = await Promise.all([
        get('/ai/assistant/status').catch(() => null),
        get('/ai/gemini/status').catch(() => null),
        get('/ai/models/status').catch(() => null),
        get('/settings/ai/config').catch(() => null),
      ]);
      setAssistantStatus(assistant);
      setGeminiStatus(gemini);
      setModelsStatus(models);
      const value = config?.value;
      if (value && typeof value === 'object') setAiConfig(value);
    } catch (err) {
      toast.error(err.message || 'Erreur chargement supervision IA');
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
      toast.error(err.message || 'Enregistrement configuration IA échoué');
    } finally {
      setIsSaving(false);
    }
  }, [aiConfig, loadAll, toast]);

  const rebuildAlerts = useCallback(async () => {
    setIsSaving(true);
    try {
      await post('/ai/alerts/rebuild', { max_products: 800 });
      toast.success('Alertes recalculées.');
    } catch (err) {
      toast.error(err.message || 'Recalcul alertes échoué');
    } finally {
      setIsSaving(false);
    }
  }, [toast]);

  const trainModels = useCallback(async () => {
    setIsSaving(true);
    try {
      await post('/ai/models/train', { lookback_days: Number(lookbackDays || 240), force: Boolean(forceTrain) });
      toast.success('Entraînement lancé / terminé.');
      await loadAll();
    } catch (err) {
      toast.error(err.message || 'Entraînement échoué');
    } finally {
      setIsSaving(false);
    }
  }, [forceTrain, loadAll, lookbackDays, toast]);

  const assistantLabel = useMemo(() => (assistantStatus?.ok ? 'OK' : 'N/A'), [assistantStatus]);
  const geminiLabel = useMemo(() => (geminiStatus?.configured ? 'OK' : 'À configurer'), [geminiStatus]);
  const trainedLabel = useMemo(() => (modelsStatus?.trained ? 'Oui' : 'Non'), [modelsStatus]);

  return (
    <div className="admin-layout">
      <SidebarAdmin
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((p) => !p)}
        onLogout={onLogout}
        userName={userName}
      />
      <div className={`admin-main ${sidebarCollapsed ? 'collapsed' : ''}`}>
        <HeaderPage title="Supervision IA" subtitle="Configuration + diagnostics + actions admin" icon={<Bot size={24} />} />
        {(isLoading || isSaving) && <LoadingSpinner overlay text={isSaving ? 'Traitement...' : 'Chargement...'} />}

        <div className="admin-page">
          <div className="admin-ia-grid">
            <div className="admin-card">
              <div className="admin-card-title"><Sparkles size={18} /> État</div>
              <div className="admin-kv">
                <div><span>Assistant</span><strong>{assistantLabel}</strong></div>
                <div><span>Gemini</span><strong>{geminiLabel}</strong></div>
                <div><span>Modèles entraînés</span><strong>{trainedLabel}</strong></div>
                <div><span>Version</span><strong>{modelsStatus?.registry?.model_version || '-'}</strong></div>
              </div>
              <button className="admin-btn" type="button" onClick={loadAll} disabled={isLoading || isSaving}>
                <RefreshCw size={16} />
                <span>Actualiser état</span>
              </button>
            </div>

            <div className="admin-card">
              <div className="admin-card-title"><Wrench size={18} /> Configuration</div>
              <div className="admin-toggles">
                <label className="toggle-row">
                  <span>Predictions de rupture</span>
                  <input
                    type="checkbox"
                    checked={Boolean(aiConfig.predictionsEnabled)}
                    onChange={(e) => setAiConfig((p) => ({ ...p, predictionsEnabled: e.target.checked }))}
                  />
                </label>
                <label className="toggle-row">
                  <span>Alertes automatiques</span>
                  <input
                    type="checkbox"
                    checked={Boolean(aiConfig.alertesAuto)}
                    onChange={(e) => setAiConfig((p) => ({ ...p, alertesAuto: e.target.checked }))}
                  />
                </label>
                <label className="toggle-row">
                  <span>Analyse de consommation</span>
                  <input
                    type="checkbox"
                    checked={Boolean(aiConfig.analyseConsommation)}
                    onChange={(e) => setAiConfig((p) => ({ ...p, analyseConsommation: e.target.checked }))}
                  />
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
                  <button className="admin-btn" type="button" onClick={rebuildAlerts} disabled={isLoading || isSaving}>
                    <Sparkles size={16} />
                    <span>Recalculer alertes</span>
                  </button>
                </div>

                <div className="train-box">
                  <div className="train-row">
                    <label>
                      Lookback (jours)
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
                      <span>Forcer</span>
                    </label>
                  </div>
                  <button className="admin-btn primary" type="button" onClick={trainModels} disabled={isLoading || isSaving}>
                    <Play size={16} />
                    <span>Lancer entraînement</span>
                  </button>
                  <div className="admin-note">
                    Réservé à l’informatique: recalcul/entraînement peuvent impacter la charge serveur.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminIA;

