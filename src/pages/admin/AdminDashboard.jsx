import { useCallback, useEffect, useMemo, useState } from 'react';
import { Server, Database, Mail, ShieldAlert, Sparkles, RefreshCw } from 'lucide-react';
import SidebarAdmin from '../../components/admin/SidebarAdmin';
import HeaderPage from '../../components/shared/HeaderPage';
import LoadingSpinner from '../../components/shared/LoadingSpinner';
import { get } from '../../services/api';
import { useToast } from '../../components/shared/Toast';
import './AdminDashboard.css';

function pill(status) {
  if (status === 'ok') return 'ok';
  if (status === 'degraded') return 'warn';
  return 'bad';
}

const AdminDashboard = ({ userName, onLogout }) => {
  const toast = useToast();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => (typeof window !== 'undefined' ? window.innerWidth <= 768 : false));
  const [isLoading, setIsLoading] = useState(false);
  const [health, setHealth] = useState(null);
  const [assistantStatus, setAssistantStatus] = useState(null);
  const [geminiStatus, setGeminiStatus] = useState(null);

  const loadAll = useCallback(async () => {
    setIsLoading(true);
    try {
      const [h, assistant, gemini] = await Promise.all([
        get('/health').catch(() => null),
        get('/ai/assistant/status').catch(() => null),
        get('/ai/gemini/status').catch(() => null),
      ]);
      setHealth(h);
      setAssistantStatus(assistant);
      setGeminiStatus(gemini);
    } catch (err) {
      toast.error(err.message || 'Erreur chargement console admin');
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const state = useMemo(() => {
    const status = health?.status || 'unknown';
    const critical = Array.isArray(health?.issues?.critical) ? health.issues.critical : [];
    const warnings = Array.isArray(health?.issues?.warnings) ? health.issues.warnings : [];
    return { status, critical, warnings };
  }, [health]);

  return (
    <div className="admin-layout">
      <SidebarAdmin
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((p) => !p)}
        onLogout={onLogout}
        userName={userName}
      />
      <div className={`admin-main ${sidebarCollapsed ? 'collapsed' : ''}`}>
        <HeaderPage title="Console Admin" subtitle="Supervision système + IA (informatique)" icon={<Server size={24} />} />
        {isLoading && <LoadingSpinner overlay text="Chargement..." />}

        <div className="admin-page">
          <div className="admin-toolbar">
            <button className="admin-btn" type="button" onClick={loadAll} disabled={isLoading}>
              <RefreshCw size={16} />
              <span>Actualiser</span>
            </button>
            <span className={`admin-pill ${pill(state.status)}`}>État: {state.status}</span>
          </div>

          <div className="admin-grid">
            <div className="admin-card">
              <div className="admin-card-title"><Database size={18} /> MongoDB</div>
              <div className="admin-kv">
                <div><span>Statut</span><strong>{health?.mongodb?.status || '-'}</strong></div>
                <div><span>DB</span><strong>{health?.mongodb?.db_name || '-'}</strong></div>
              </div>
              {health?.mongodb?.critical ? <div className="admin-warn">Critique: MongoDB non connecté</div> : null}
            </div>

            <div className="admin-card">
              <div className="admin-card-title"><Mail size={18} /> SMTP / Mail</div>
              <div className="admin-kv">
                <div><span>Configuré</span><strong>{String(health?.smtp?.configured ?? '-')}</strong></div>
                <div><span>OK</span><strong>{String(health?.smtp?.ok ?? '-')}</strong></div>
              </div>
              {health?.smtp?.configured && !health?.smtp?.ok ? <div className="admin-warn">Alerte: SMTP indisponible</div> : null}
            </div>

            <div className="admin-card">
              <div className="admin-card-title"><Sparkles size={18} /> Assistant IA</div>
              <div className="admin-kv">
                <div><span>Assistant</span><strong>{assistantStatus?.ok ? 'OK' : 'N/A'}</strong></div>
                <div><span>Gemini</span><strong>{geminiStatus?.configured ? 'OK' : 'À configurer'}</strong></div>
              </div>
              <div className="admin-note">
                L’admin gère la config IA; le responsable utilise l’assistant (sans réglages techniques).
              </div>
            </div>

            <div className="admin-card">
              <div className="admin-card-title"><ShieldAlert size={18} /> Incidents</div>
              <div className="admin-kv">
                <div><span>Critiques</span><strong>{state.critical.length}</strong></div>
                <div><span>Warnings</span><strong>{state.warnings.length}</strong></div>
              </div>
              {state.critical.length ? (
                <ul className="admin-list">
                  {state.critical.slice(0, 4).map((x) => <li key={x}>{x}</li>)}
                </ul>
              ) : (
                <div className="admin-ok">Aucun incident critique.</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;

