import { useState } from 'react';
import { FileText, Clock, CheckCircle, XCircle, Package, Calendar } from 'lucide-react';
import SidebarDem from '../../components/demandeur/SidebarDem';
import HeaderPage from '../../components/shared/HeaderPage';
import './MesDemandes.css';

const mockDemandes = [
  { id: 'DEM-001', produit: 'Cable HDMI 2m', codeProduit: 'PRD-001', quantite: 10, date: '2026-02-01 09:30', statut: 'en_attente' },
  { id: 'DEM-002', produit: 'Souris sans fil', codeProduit: 'PRD-002', quantite: 5, date: '2026-02-01 11:15', statut: 'validee' },
  { id: 'DEM-003', produit: 'Papier A4 500 feuilles', codeProduit: 'PRD-005', quantite: 20, date: '2026-01-31 14:00', statut: 'validee' },
  { id: 'DEM-004', produit: 'Clavier mecanique', codeProduit: 'PRD-003', quantite: 3, date: '2026-01-31 10:45', statut: 'rejetee' },
];

const MesDemandes = ({ userName, onLogout }) => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const getStatutInfo = (statut) => {
    switch (statut) {
      case 'en_attente':
        return { label: 'En attente', className: 'statut-attente', icon: Clock };
      case 'validee':
        return { label: 'Acceptee', className: 'statut-validee', icon: CheckCircle };
      case 'rejetee':
        return { label: 'Refusee', className: 'statut-rejetee', icon: XCircle };
      default:
        return { label: statut, className: '', icon: Clock };
    }
  };

  const filteredDemandes = mockDemandes.filter(demande =>
    demande.produit.toLowerCase().includes(searchQuery.toLowerCase()) ||
    demande.id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="app-layout">
      <SidebarDem 
        collapsed={sidebarCollapsed} 
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        onLogout={onLogout}
      />
      
      <div className="main-container">
        <HeaderPage 
          userName={userName}
          title="Mes Demandes"
          searchValue={searchQuery}
          onSearchChange={setSearchQuery}
        />
        
        <main className="main-content">
          <div className="mes-demandes-page">
            <div className="demandes-table-container">
              <table className="demandes-table">
                <thead>
                  <tr>
                    <th>Reference</th>
                    <th>Produit</th>
                    <th>Quantite</th>
                    <th>Date</th>
                    <th>Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDemandes.map((demande, index) => {
                    const statutInfo = getStatutInfo(demande.statut);
                    const StatutIcon = statutInfo.icon;
                    return (
                      <tr key={demande.id} style={{ animationDelay: `${index * 50}ms` }}>
                        <td className="ref-cell">{demande.id}</td>
                        <td className="product-cell">
                          <Package size={16} />
                          <div>
                            <span className="product-name">{demande.produit}</span>
                            <span className="product-code">{demande.codeProduit}</span>
                          </div>
                        </td>
                        <td className="quantity-cell">{demande.quantite}</td>
                        <td className="date-cell">
                          <Calendar size={14} />
                          {demande.date}
                        </td>
                        <td>
                          <span className={`statut-badge ${statutInfo.className}`}>
                            <StatutIcon size={14} />
                            {statutInfo.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="demandes-footer">
              <p>{filteredDemandes.length} demande{filteredDemandes.length > 1 ? 's' : ''}</p>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default MesDemandes;
