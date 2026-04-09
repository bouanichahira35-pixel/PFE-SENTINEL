import { useState, useEffect, useMemo, useCallback } from 'react';
import { Clock, CheckCircle, XCircle, Package, Calendar, Truck } from 'lucide-react';
import SidebarDem from '../../components/demandeur/SidebarDem';
import HeaderPage from '../../components/shared/HeaderPage';
import LoadingSpinner from '../../components/shared/LoadingSpinner';
import { useToast } from '../../components/shared/Toast';
import { get, patch } from '../../services/api';
import { normalizeRequestStatus } from '../../utils/requestStatus';
import './MesDemandes.css';

const MesDemandes = ({ userName, onLogout }) => {
  const toast = useToast();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => (typeof window !== 'undefined' ? window.innerWidth <= 768 : false));
  const [searchQuery, setSearchQuery] = useState('');
  const [demandes, setDemandes] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

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
        statut: normalizeRequestStatus(r.status),
        receiptToken: r.receipt_token || '',
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
      case 'validated':
      case 'accepted':
        return { label: 'Validée', className: 'statut-validee', icon: CheckCircle };
      case 'preparing':
        return { label: 'En préparation', className: 'statut-validee', icon: Package };
      case 'served':
        return { label: 'Servie', className: 'statut-servie', icon: Truck };
      case 'received':
        return { label: 'Cloturee', className: 'statut-validee', icon: CheckCircle };
      case 'rejected':
      case 'refused':
        return { label: 'Rejetée', className: 'statut-rejetee', icon: XCircle };
      case 'cancelled':
        return { label: 'Annulée', className: 'statut-rejetee', icon: XCircle };
      default:
        return { label: statut, className: '', icon: Clock };
    }
  };

  const confirmReceipt = useCallback(async (demande) => {
    if (!demande?.id) return;
    setIsSubmitting(true);
    try {
      await patch(`/requests/${encodeURIComponent(demande.id)}/confirm-receipt`, {
        receipt_token: demande.receiptToken || undefined,
      });
      toast.success('Reception confirmee');
      await loadDemandes(false, true);
    } catch (err) {
      toast.error(err.message || 'Impossible de confirmer la reception');
    } finally {
      setIsSubmitting(false);
    }
  }, [loadDemandes, toast]);

  const filteredDemandes = useMemo(() => (
    demandes.filter((demande) =>
      demande.produit.toLowerCase().includes(searchQuery.toLowerCase()) ||
      demande.reference.toLowerCase().includes(searchQuery.toLowerCase())
    )
  ), [demandes, searchQuery]);

  return (
    <div className="app-layout">
      <div
        className={`sidebar-backdrop ${sidebarCollapsed ? 'hidden' : ''}`}
        onClick={() => setSidebarCollapsed(true)}
      />
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
          onMenuClick={() => setSidebarCollapsed((prev) => !prev)}
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
                          {demande.statut === 'served' && (
                            <div className="receipt-row">
                              <button
                                type="button"
                                className="btn-confirm-receipt"
                                onClick={() => confirmReceipt(demande)}
                                disabled={isSubmitting}
                              >
                                Confirmer reception
                              </button>
                              {demande.receiptToken ? (
                                <small className="receipt-code">
                                  Code: <strong>{demande.receiptToken}</strong>
                                </small>
                              ) : null}
                            </div>
                          )}
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

