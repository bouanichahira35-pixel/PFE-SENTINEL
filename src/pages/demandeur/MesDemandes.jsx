import { useState, useEffect, useMemo, useCallback } from 'react';
import { Clock, CheckCircle, XCircle, Package, Calendar } from 'lucide-react';
import SidebarDem from '../../components/demandeur/SidebarDem';
import HeaderPage from '../../components/shared/HeaderPage';
import LoadingSpinner from '../../components/shared/LoadingSpinner';
import { useToast } from '../../components/shared/Toast';
import { get } from '../../services/api';
import './MesDemandes.css';

const MesDemandes = ({ userName, onLogout }) => {
  const toast = useToast();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [demandes, setDemandes] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  const loadDemandes = useCallback(async (showLoader = true, silent = false) => {
    if (showLoader) setIsLoading(true);
    try {
      const items = await get('/requests');
      const mapped = (items || []).map((r) => ({
        id: r._id,
        reference: `DEM-${String(r._id || '').slice(-6).toUpperCase()}`,
        produit: r.product?.name || 'Produit',
        codeProduit: r.product?.code_product || '-',
        quantite: Number(r.quantity_requested || 0),
        date: r.date_request ? new Date(r.date_request).toLocaleString('fr-FR') : '-',
        statut: r.status || 'pending',
      }));

      mapped.sort((a, b) => String(b.id).localeCompare(String(a.id)));
      setDemandes(mapped);
    } catch (err) {
      if (!silent) toast.error(err.message || 'Impossible de charger mes demandes');
    } finally {
      if (showLoader) setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadDemandes(true, false);
  }, [loadDemandes]);

  useEffect(() => {
    const intervalId = setInterval(() => {
      loadDemandes(false, true);
    }, 10000);
    return () => clearInterval(intervalId);
  }, [loadDemandes]);

  const getStatutInfo = (statut) => {
    switch (statut) {
      case 'pending':
        return { label: 'En attente', className: 'statut-attente', icon: Clock };
      case 'accepted':
        return { label: 'Acceptee', className: 'statut-validee', icon: CheckCircle };
      case 'refused':
        return { label: 'Refusee', className: 'statut-rejetee', icon: XCircle };
      default:
        return { label: statut, className: '', icon: Clock };
    }
  };

  const filteredDemandes = useMemo(() => (
    demandes.filter((demande) =>
      demande.produit.toLowerCase().includes(searchQuery.toLowerCase()) ||
      demande.reference.toLowerCase().includes(searchQuery.toLowerCase())
    )
  ), [demandes, searchQuery]);

  return (
    <div className="app-layout">
      <SidebarDem 
        collapsed={sidebarCollapsed} 
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        onLogout={onLogout}
        userName={userName}
      />
      
      <div className="main-container">
        <HeaderPage 
          userName={userName}
          title="Mes Demandes"
          searchValue={searchQuery}
          onSearchChange={setSearchQuery}
          onRefresh={loadDemandes}
        />
        
        <main className="main-content">
          {isLoading && <LoadingSpinner overlay text="Chargement de mes demandes..." />}
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
                        <td className="ref-cell">{demande.reference}</td>
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

