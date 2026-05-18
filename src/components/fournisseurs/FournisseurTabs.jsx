import { FileText, History, LayoutDashboard, ShieldAlert, ShoppingCart, Star, Tag } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import './fournisseurs.css';

const tabClass = ({ isActive }) => `f360-tab ${isActive ? 'active' : ''}`;

const FournisseurTabs = ({ supplierId }) => {
  const sid = String(supplierId || '').trim();
  if (!sid) return null;
  return (
    <div className="f360-tabs">
      <NavLink className={tabClass} to={`/responsable/fournisseurs/${sid}`} end><LayoutDashboard size={16} />Vue générale</NavLink>
      <NavLink className={tabClass} to={`/responsable/fournisseurs/${sid}/produits`}><Tag size={16} />Produits</NavLink>
      <NavLink className={tabClass} to={`/responsable/fournisseurs/${sid}/commandes`}><ShoppingCart size={16} />Commandes</NavLink>
      <NavLink className={tabClass} to={`/responsable/fournisseurs/${sid}/documents`}><FileText size={16} />Documents</NavLink>
      <NavLink className={tabClass} to={`/responsable/fournisseurs/${sid}/incidents`}><ShieldAlert size={16} />Incidents</NavLink>
      <NavLink className={tabClass} to={`/responsable/fournisseurs/${sid}/evaluation`}><Star size={16} />Évaluation</NavLink>
      <NavLink className={tabClass} to={`/responsable/fournisseurs/${sid}#historique`}><History size={16} />Historique</NavLink>
    </div>
  );
};

export default FournisseurTabs;

