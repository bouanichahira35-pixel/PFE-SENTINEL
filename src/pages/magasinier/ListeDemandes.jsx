import { useState, useMemo, useCallback, useEffect } from 'react';
import { Package, CheckCircle, XCircle, Clock, User, Calendar, AlertTriangle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import SidebarMag from '../../components/magasinier/SidebarMag';
import HeaderPage from '../../components/shared/HeaderPage';
import LoadingSpinner from '../../components/shared/LoadingSpinner';
import { useToast } from '../../components/shared/Toast';
import { get, patch } from '../../services/api';
import './ListeDemandes.css';

const ListeDemandes = ({ userName, onLogout }) => {
  const navigate = useNavigate();
  const toast = useToast();

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [demandes, setDemandes] = useState([]);
  const [processingId, setProcessingId] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  const getStatutInfo = useCallback((statut) => {
    switch (statut) {
      case 'pending':
        return { label: 'En attente', className: 'statut-attente', icon: Clock };
      case 'accepted':
        return { label: 'Acceptee', className: 'statut-acceptee', icon: CheckCircle };
      case 'refused':
        return { label: 'Rejetee', className: 'statut-rejetee', icon: XCircle };
      default:
        return { label: statut || 'Inconnu', className: '', icon: Clock };
    }
  }, []);

  const loadDemandes = useCallback(async () => {
    setIsLoading(true);
    try {
      const items = await get('/requests');
      const mapped = (items || []).map((r) => ({
        id: r._id,
        reference: `DEM-${String(r._id || '').slice(-6).toUpperCase()}`,
        produit: r.product?.name || 'Produit',
        codeProduit: r.product?.code_product || '-',
        productId: r.product?._id,
        quantite: Number(r.quantity_requested || 0),
        demandeur: r.demandeur?.username || 'Demandeur',
        demandeurId: r.demandeur?._id,
        date: r.date_request ? new Date(r.date_request).toLocaleString('fr-FR') : '-',
        statut: r.status,
        stockDisponible: Number(r.product?.quantity_current || 0),
      }));

      // Les demandes les plus récentes en premier
      mapped.sort((a, b) => String(b.id).localeCompare(String(a.id)));
      setDemandes(mapped);
    } catch (err) {
      toast.error(err.message || 'Impossible de charger les demandes');
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadDemandes();
  }, [loadDemandes]);

  const handleAccepter = useCallback(async (demande) => {
    if (demande.stockDisponible < demande.quantite) {
      toast.error('Stock insuffisant pour cette demande');
      return;
    }

    setProcessingId(demande.id);

    // Redirection vers Bon de prélèvement (Sortie stock)
    navigate('/magasinier/sortie-stock', {
      state: {
        product: {
          id: demande.productId,
          code: demande.codeProduit,
          nom: demande.produit,
          quantite: demande.stockDisponible,
          categorie: '-',
          unite: 'Unite',
        },
        demandeInfo: {
          id: demande.id,
          reference: demande.reference,
          quantite: demande.quantite,
          demandeur: demande.demandeur,
          demandeurId: demande.demandeurId,
        },
      },
    });
  }, [navigate, toast]);

  const handleRejeter = useCallback(async (demandeId) => {
    setProcessingId(demandeId);
    try {
      await patch(`/requests/${demandeId}/process`, { status: 'refused' });
      setDemandes((prev) => prev.map((d) => (d.id === demandeId ? { ...d, statut: 'refused' } : d)));
      toast.warning('Demande rejetee');
    } catch (err) {
      toast.error(err.message || 'Echec rejet demande');
    } finally {
      setProcessingId(null);
    }
  }, [toast]);

  const filteredDemandes = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return demandes.filter((demande) =>
      demande.produit.toLowerCase().includes(q) ||
      demande.demandeur.toLowerCase().includes(q) ||
      demande.reference.toLowerCase().includes(q)
    );
  }, [demandes, searchQuery]);

  const pendingCount = useMemo(
    () => filteredDemandes.filter((d) => d.statut === 'pending').length,
    [filteredDemandes]
  );

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
          onRefresh={loadDemandes}
        />

        <main className="main-content">
          {isLoading && <LoadingSpinner overlay text="Chargement des demandes..." />}

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
                    const canAccept = demande.statut === 'pending' && demande.stockDisponible >= demande.quantite;
                    const insufficientStock = demande.statut === 'pending' && demande.stockDisponible < demande.quantite;
                    const isProcessing = processingId === demande.id;

                    return (
                      <tr key={demande.id} style={{ animationDelay: `${index * 30}ms` }}>
                        <td className="ref-cell">{demande.reference}</td>
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
                          {demande.statut === 'pending' && (
                            <div className="action-buttons">
                              {isProcessing ? (
                                <LoadingSpinner size="small" />
                              ) : (
                                <>
                                  <button
                                    className={`action-btn accept ${!canAccept ? 'disabled' : ''}`}
                                    onClick={() => handleAccepter(demande)}
                                    disabled={!canAccept}
                                    title={insufficientStock ? 'Stock insuffisant' : 'Accepter (traitement via sortie stock)'}
                                    aria-label={`Accepter la demande ${demande.reference}`}
                                  >
                                    <CheckCircle size={16} />
                                  </button>
                                  <button
                                    className="action-btn reject"
                                    onClick={() => handleRejeter(demande.id)}
                                    title="Rejeter la demande"
                                    aria-label={`Rejeter la demande ${demande.reference}`}
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

              {!isLoading && filteredDemandes.length === 0 && (
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
