import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Package, LayoutDashboard, GraduationCap } from 'lucide-react';
import logoETAP from '../assets/logoETAP.png';
import './RoleSelection.css';

const RoleSelection = () => {
  const navigate = useNavigate();
  const [hoveredRole, setHoveredRole] = useState(null);

  const roles = [
    {
      id: 'magasinier',
      title: 'MAGASINIER',
      description: 'Gestion des produits, entrees et sorties de stock',
      icon: Package,
      color: '#1565c0',
      path: '/login/magasinier'
    },
    {
      id: 'responsable',
      title: 'RESPONSABLE',
      description: 'Dashboard, analyses et prise de decisions',
      icon: LayoutDashboard,
      color: '#7c3aed',
      path: '/login/responsable'
    },
    {
      id: 'demandeur',
      title: 'DEMANDEUR',
      description: 'Consulter les produits et faire des demandes',
      icon: GraduationCap,
      color: '#059669',
      path: '/login/demandeur'
    }
  ];

  return (
    <div className="role-selection-page">
      <div className="role-shape role-shape-1"></div>
      <div className="role-shape role-shape-2"></div>
      <div className="role-shape role-shape-3"></div>

      <div className="role-selection-container">
        <div className="role-header">
          <img src={logoETAP} alt="ETAP Logo" className="role-logo" />
          <h1 className="role-main-title">Systeme de Gestion de Stock</h1>
          <p className="role-subtitle">Selectionnez votre profil pour acceder a l'application</p>
        </div>

        <div className="role-cards">
          {roles.map((role, index) => {
            const IconComponent = role.icon;
            return (
              <button
                key={role.id}
                className={`role-card ${hoveredRole === role.id ? 'hovered' : ''}`}
                style={{ 
                  '--role-color': role.color,
                  animationDelay: `${index * 100}ms`
                }}
                onClick={() => navigate(role.path)}
                onMouseEnter={() => setHoveredRole(role.id)}
                onMouseLeave={() => setHoveredRole(null)}
              >
                <div className="role-icon">
                  <IconComponent size={32} />
                </div>
                <h2 className="role-title">{role.title}</h2>
                <p className="role-desc">{role.description}</p>
              </button>
            );
          })}
        </div>

        <div className="role-footer">
          <p>ETAP - Entreprise Tunisienne d'Activites Petrolieres</p>
        </div>
      </div>
    </div>
  );
};

export default RoleSelection;
