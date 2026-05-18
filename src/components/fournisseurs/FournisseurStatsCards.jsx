import { AlertTriangle, CheckCircle2, FileWarning, ShieldAlert, ShieldCheck, Users } from 'lucide-react';
import './fournisseurs.css';

const cards = [
  { key: 'total_suppliers', title: 'Total fournisseurs', icon: Users },
  { key: 'active_suppliers', title: 'Fournisseurs actifs', icon: ShieldCheck },
  { key: 'inactive_suppliers', title: 'Fournisseurs inactifs', icon: ShieldAlert },
  { key: 'suspended_suppliers', title: 'Fournisseurs suspendus', icon: AlertTriangle },
  { key: 'open_alerts', title: 'Alertes non traitées', icon: FileWarning },
  { key: 'incomplete_profiles', title: 'Fiches incomplètes', icon: FileWarning },
  { key: 'watch_suppliers', title: 'Fournisseurs à surveiller', icon: ShieldAlert },
  { key: 'to_verify_suppliers', title: 'Fournisseurs à vérifier', icon: CheckCircle2 },
];

const FournisseurStatsCards = ({ stats }) => {
  return (
    <div className="resp-kpi-grid">
      {cards.map((c) => {
        const Icon = c.icon;
        const value = stats ? Number(stats?.[c.key] || 0) : 0;
        return (
          <div key={c.key} className="resp-kpi">
            <div className="resp-kpi-top">
              <div style={{ fontWeight: 950, color: '#0f172a' }}>{c.title}</div>
              <Icon size={18} />
            </div>
            <div className="resp-kpi-value">{Number.isFinite(value) ? value : 0}</div>
          </div>
        );
      })}
    </div>
  );
};

export default FournisseurStatsCards;

