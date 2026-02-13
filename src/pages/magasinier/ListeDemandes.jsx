import { useState, useMemo, useCallback } from 'react';
import { Package, CheckCircle, XCircle, Clock, User, Calendar, AlertTriangle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import SidebarMag from '../../components/magasinier/SidebarMag';
import HeaderPage from '../../components/shared/HeaderPage';
import LoadingSpinner from '../../components/shared/LoadingSpinner';
import { useToast } from '../../components/shared/Toast';
import './ListeDemandes.css';

const mockDemandes = [
  { id: 'DEM-001', produit: 'Cable HDMI 2m', codeProduit: 'PRD-001', quantite: 10, demandeur: 'Ali Ben Ahmed', date: '2026-02-04 09:30', statut: 'en_attente', stockDisponible: 150 },
  { id: 'DEM-002', produit: 'Souris sans fil', codeProduit: 'PRD-002', quantite: 5, demandeur: 'Sami Trabelsi', date: '2026-02-04 08:15', statut: 'en_attente', stockDisponible: 45 },
  { id: 'DEM-003', produit: 'Clavier mecanique', codeProduit: 'PRD-003', quantite: 3, demandeur: 'Mohamed Sassi', date: '2026-02-03 16:45', statut: 'acceptee', stockDisponible: 8 },
  { id: 'DEM-004', produit: 'Ecran 24 pouces', codeProduit: 'PRD-004', quantite: 2, demandeur: 'Fatma Riahi', date: '2026-02-03 14:20', statut: 'rejetee', stockDisponible: 0 },
  { id: 'DEM-005', produit: 'Papier A4', codeProduit: 'PRD-005', quantite: 50, demandeur: 'Karim Jebali', date: '2026-02-03 10:00', statut: 'en_attente', stockDisponible: 200 },
];

const ListeDemandes = ({ userName, onLogout }) => {
  const navigate = useNavigate();
  const toast = useToast();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [demandes, setDemandes] = useState(mockDemandes);
  const [processingId, setProcessingId] = useState(null);

  const getStatutInfo = useCallback((statut) => {
    switch (statut) {
      case 'en_attente':
        return { label: 'En attente', className: 'statut-attente', icon: Clock };
      case 'acceptee':
        return { label: 'Acceptee', className: 'statut-acceptee', icon: CheckCircle };
      case 'rejetee':
        return { label: 'Rejetee', className: 'statut-rejetee', icon: XCircle };
      default:
        return { label: statut, className: '', icon: Clock };
    }
  }, []);

  const handleAccepter = useCallback(async (demande) => {
    if (demande.stockDisponible >= demande.quantite) {
      setProcessingId(demande.id);
      await new Promise(resolve => setTimeout(resolve, 500));
      
      toast.success(`Demande ${demande.id} acceptee - Redirection vers sortie stock`);
      navigate('/magasinier/sortie-stock', { 
        state: { 
          product: { 
            code: demande.codeProduit, 
            nom: demande.produit, 
            quantite: demande.stockDisponible 
          },
          demandeInfo: {
            id: demande.id,
            quantite: demande.quantite,
            demandeur: demande.demandeur
          }
        } 
      });
    } else {
      toast.error('Stock insuffisant pour cette demande');
    }
  }, [navigate, toast]);

  const handleRejeter = useCallback(async (demandeId) => {
    setProcessingId(demandeId);
    await new Promise(resolve => setTimeout(resolve, 500));
    
    setDemandes(prev => prev.map(d => 
      d.id === demandeId ? { ...d, statut: 'rejetee' } : d
    ));
    setProcessingId(null);
    toast.warning(`Demande ${demandeId} rejetee`);
  }, [toast]);

  const filteredDemandes = useMemo(() => {
    return demandes.filter(demande =>
      demande.produit.toLowerCase().includes(searchQuery.toLowerCase()) ||
      demande.demandeur.toLowerCase().includes(searchQuery.toLowerCase()) ||
      demande.id.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [demandes, searchQuery]);

  const pendingCount = useMemo(() => {
    return filteredDemandes.filter(d => d.statut === 'en_attente').length;
  }, [filteredDemandes]);

  return (
    <div className="app-layout">
      <SidebarMag 
        collapsed={sidebarCollapsed} 
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        onLogout={onLogout}
        userName={userName}
      />
      
      <div className="main-container">
        <HeaderPage 
          userName={userName}
          title="Demandes de Produits"
          searchValue={searchQuery}
          onSearchChange={setSearchQuery}
        />
        
        <main className="main-content">
          <div className="demandes-mag-page">
            <div className="demandes-table-container">
              <table className="demandes-table" role="table">
                <thead>
                  <tr>
                    <th scope="col">Reference</th>
                    <th scope="col">Produit</th>
                    <th scope="col">Quantite</th>
                    <th scope="col">Demandeur</th>
                    <th scope="col">Date</th>
                    <th scope="col">Statut</th>
                    <th scope="col">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDemandes.map((demande, index) => {
                    const statutInfo = getStatutInfo(demande.statut);
                    const StatutIcon = statutInfo.icon;
                    const canAccept = demande.statut === 'en_attente' && demande.stockDisponible >= demande.quantite;
                    const insufficientStock = demande.statut === 'en_attente' && demande.stockDisponible < demande.quantite;
                    const isProcessing = processingId === demande.id;
                    
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
                        <td className="quantity-cell">
                          {demande.quantite}
                          {insufficientStock && (
                            <span className="stock-warning" title="Stock insuffisant">
                              <AlertTriangle size={14} />
                            </span>
                          )}
                        </td>
                        <td className="demandeur-cell">
                          <User size={14} />
                          {demande.demandeur}
                        </td>
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
                        <td>
                          {demande.statut === 'en_attente' && (
                            <div className="action-buttons">
                              {isProcessing ? (
                                <LoadingSpinner size="small" />
                              ) : (
                                <>
                                  <button 
                                    className={`action-btn accept ${!canAccept ? 'disabled' : ''}`}
                                    onClick={() => handleAccepter(demande)}
                                    disabled={!canAccept}
                                    title={insufficientStock ? 'Stock insuffisant' : 'Accepter la demande'}
                                    aria-label={`Accepter la demande ${demande.id}`}
                                  >
                                    <CheckCircle size={16} />
                                  </button>
                                  <button 
                                    className="action-btn reject"
                                    onClick={() => handleRejeter(demande.id)}
                                    title="Rejeter la demande"
                                    aria-label={`Rejeter la demande ${demande.id}`}
                                  >
                                    <XCircle size={16} />
                                  </button>
                                </>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {filteredDemandes.length === 0 && (
                <div className="empty-state">
                  <Package size={48} />
                  <p>Aucune demande trouvee</p>
                </div>
              )}
            </div>

            <div className="demandes-footer">
              <p>{pendingCount} demande(s) en attente</p>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default ListeDemandes;

