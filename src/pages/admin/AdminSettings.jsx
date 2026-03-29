import { useMemo, useState } from 'react';
import { Settings } from 'lucide-react';
import SidebarAdmin from '../../components/admin/SidebarAdmin';
import HeaderPage from '../../components/shared/HeaderPage';

const AdminSettings = ({ userName, onLogout }) => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => (typeof window !== 'undefined' ? window.innerWidth <= 768 : false));

  const note = useMemo(() => (
    "Cette section peut regrouper les parametrages techniques (origines CORS, limites, mails, etc.). Pour le moment, l'essentiel est dans Supervision IA et Utilisateurs."
  ), []);

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
        <div className="admin-page">
          <div className="admin-card">
            <div className="admin-card-title">Note</div>
            <div className="admin-note">{note}</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminSettings;

