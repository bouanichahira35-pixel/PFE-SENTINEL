import { useState } from 'react';
import { AlertTriangle, TrendingDown, Package, Activity, ArrowUpRight, ArrowDownRight, History, Eye, BarChart3, PieChart, LineChart, Bot, Bell, CheckCircle, XCircle, Clock, Edit3 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import SidebarResp from '../../components/responsable/SidebarResp';
import HeaderPage from '../../components/shared/HeaderPage';
import ProtectedPage from "../../components/shared/ProtectedPage";
import './DashboardResp.css';

const mockStats = {
  sousSeuilCount: 12,
  inactifsCount: 5,
  risqueCount: 3,
  totalProduits: 156,
};

const mockTransactions = [
  { id: 1, produit: 'Cable HDMI 2m', type: 'Sortie', quantite: 10, date: '2026-02-04 09:30', magasinier: 'Ahmed' },
  { id: 2, produit: 'Papier A4', type: 'Entree', quantite: 100, date: '2026-02-04 08:15', magasinier: 'Mohamed' },
  { id: 3, produit: 'Souris sans fil', type: 'Sortie', quantite: 5, date: '2026-02-03 16:45', magasinier: 'Ahmed' },
  { id: 4, produit: 'Clavier mecanique', type: 'Sortie', quantite: 2, date: '2026-02-03 14:20', magasinier: 'Mohamed' },
  { id: 5, produit: 'Cartouche encre', type: 'Entree', quantite: 20, date: '2026-02-03 10:00', magasinier: 'Ahmed' },
];

const mockAlerts = [
  { id: 1, type: 'danger', message: 'Risque de rupture: Ecran 24 pouces', time: 'Il y a 2h' },
  { id: 2, type: 'warning', message: 'Consommation anormale: Papier A4', time: 'Il y a 5h' },
  { id: 3, type: 'info', message: 'Produit inactif depuis 30 jours: Chaise de bureau', time: 'Hier' },
];

const mockPendingProducts = [
  { id: 101, code: 'PRD-201', nom: 'Ecran 27 pouces 4K', categorie: 'Informatique', unite: 'Unite', seuilMinimum: 5, description: 'Ecran haute resolution pour bureau', magasinier: 'Ahmed', dateSoumission: '2026-02-09 14:30' },
  { id: 102, code: 'PRD-202', nom: 'Casque audio Bluetooth', categorie: 'Electronique', unite: 'Unite', seuilMinimum: 10, description: 'Casque sans fil avec reduction de bruit', magasinier: 'Mohamed', dateSoumission: '2026-02-09 11:15' },
  { id: 103, code: 'PRD-203', nom: 'Agrafeuse industrielle', categorie: 'Fournitures', unite: 'Unite', seuilMinimum: 3, description: '', magasinier: 'Ahmed', dateSoumission: '2026-02-08 16:00' },
];

const DashboardResp = ({ userName, onLogout }) => {
  const navigate = useNavigate();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [pendingProducts, setPendingProducts] = useState(mockPendingProducts);
  const [editingSeuilId, setEditingSeuilId] = useState(null);
  const [editedSeuil, setEditedSeuil] = useState('');

  const handleValidate = (id) => {
    const product = pendingProducts.find(p => p.id === id);
    if (product) {
      console.log('Produit validé:', { ...product, seuilMinimum: editingSeuilId === id ? parseInt(editedSeuil) || product.seuilMinimum : product.seuilMinimum });
      setPendingProducts(prev => prev.filter(p => p.id !== id));
      setEditingSeuilId(null);
    }
  };

  const handleReject = (id) => {
    console.log('Produit rejeté:', pendingProducts.find(p => p.id === id));
    setPendingProducts(prev => prev.filter(p => p.id !== id));
    setEditingSeuilId(null);
  };

  const startEditSeuil = (id, currentSeuil) => {
    setEditingSeuilId(id);
    setEditedSeuil(String(currentSeuil));
  };

  const cancelEditSeuil = () => {
    setEditingSeuilId(null);
    setEditedSeuil('');
  };

return (
  <ProtectedPage userName={userName}>
    <div className="app-layout">
      <SidebarResp 
        collapsed={sidebarCollapsed} 
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        onLogout={onLogout}
        userName={userName}
      />
      
      <div className="main-container">
        <HeaderPage 
          userName={userName}
          title="Dashboard"
          showSearch={false}
        />
        
        <main className="main-content">
          <div className="dashboard-page">
            {/* KPIs */}
            <div className="kpi-grid">
              <div className="kpi-card warning">
                <div className="kpi-icon">
                  <AlertTriangle size={24} />
                </div>
                <div className="kpi-content">
                  <span className="kpi-value">{mockStats.sousSeuilCount}</span>
                  <span className="kpi-label">Produits sous seuil</span>
                </div>
                <div className="kpi-trend down">
                  <ArrowDownRight size={16} />
                  <span>-8%</span>
                </div>
              </div>

              <div className="kpi-card info">
                <div className="kpi-icon">
                  <TrendingDown size={24} />
                </div>
                <div className="kpi-content">
                  <span className="kpi-value">{mockStats.inactifsCount}</span>
                  <span className="kpi-label">Produits inactifs</span>
                </div>
                <div className="kpi-trend up">
                  <ArrowUpRight size={16} />
                  <span>+2</span>
                </div>
              </div>

              <div className="kpi-card danger">
                <div className="kpi-icon">
                  <Activity size={24} />
                </div>
                <div className="kpi-content">
                  <span className="kpi-value">{mockStats.risqueCount}</span>
                  <span className="kpi-label">Produits a risque</span>
                </div>
                <div className="kpi-trend down">
                  <ArrowDownRight size={16} />
                  <span>-1</span>
                </div>
              </div>

              <div className="kpi-card success">
                <div className="kpi-icon">
                  <Package size={24} />
                </div>
                <div className="kpi-content">
                  <span className="kpi-value">{mockStats.totalProduits}</span>
                  <span className="kpi-label">Total produits</span>
                </div>
                <div className="kpi-trend up">
                  <ArrowUpRight size={16} />
                  <span>+12</span>
                </div>
              </div>
            </div>

            {/* Pending Products Validation Block */}
            <div className="dashboard-card pending-validation-card">
              <div className="card-header">
                <h3 className="card-title">
                  <Clock size={18} />
                  <span>Produits en attente de validation</span>
                  {pendingProducts.length > 0 && (
                    <span className="pending-badge">{pendingProducts.length}</span>
                  )}
                </h3>
              </div>

              {pendingProducts.length === 0 ? (
                <div className="pending-empty">
                  <CheckCircle size={32} />
                  <p>Aucun produit en attente de validation</p>
                </div>
              ) : (
                <div className="pending-list">
                  {pendingProducts.map((product, index) => (
                    <div key={product.id} className="pending-item" style={{ animationDelay: `${index * 60}ms` }}>
                      <div className="pending-item-header">
                        <div className="pending-product-info">
                          <Package size={16} />
                          <span className="pending-product-name">{product.nom}</span>
                          <span className="pending-product-code">{product.code}</span>
                        </div>
                        <span className="pending-status-badge">En attente</span>
                      </div>

                      <div className="pending-item-details">
                        <div className="pending-detail">
                          <span className="detail-label">Catégorie</span>
                          <span className="detail-value">{product.categorie}</span>
                        </div>
                        <div className="pending-detail">
                          <span className="detail-label">Unité</span>
                          <span className="detail-value">{product.unite}</span>
                        </div>
                        <div className="pending-detail">
                          <span className="detail-label">Seuil min.</span>
                          {editingSeuilId === product.id ? (
                            <div className="seuil-edit-group">
                              <input
                                type="number"
                                min="0"
                                value={editedSeuil}
                                onChange={(e) => setEditedSeuil(e.target.value)}
                                className="seuil-edit-input"
                                autoFocus
                              />
                              <button className="seuil-save-btn" onClick={() => {
                                const newSeuil = parseInt(editedSeuil);
                                if (!isNaN(newSeuil) && newSeuil >= 0) {
                                  setPendingProducts(prev => prev.map(p => p.id === product.id ? { ...p, seuilMinimum: newSeuil } : p));
                                }
                                setEditingSeuilId(null);
                              }}>
                                <CheckCircle size={14} />
                              </button>
                              <button className="seuil-cancel-btn" onClick={cancelEditSeuil}>
                                <XCircle size={14} />
                              </button>
                            </div>
                          ) : (
                            <span className="detail-value seuil-value" onClick={() => startEditSeuil(product.id, product.seuilMinimum)}>
                              {product.seuilMinimum}
                              <Edit3 size={12} className="edit-icon" />
                            </span>
                          )}
                        </div>
                        <div className="pending-detail">
                          <span className="detail-label">Magasinier</span>
                          <span className="detail-value">{product.magasinier}</span>
                        </div>
                        <div className="pending-detail">
                          <span className="detail-label">Soumis le</span>
                          <span className="detail-value">{product.dateSoumission}</span>
                        </div>
                      </div>

                      {product.description && (
                        <p className="pending-description">{product.description}</p>
                      )}

                      <div className="pending-actions">
                        <button className="pending-btn validate" onClick={() => handleValidate(product.id)}>
                          <CheckCircle size={16} />
                          <span>Valider</span>
                        </button>
                        <button className="pending-btn reject" onClick={() => handleReject(product.id)}>
                          <XCircle size={16} />
                          <span>Rejeter</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Main content grid */}
            <div className="dashboard-grid">
              {/* Recent transactions */}
              <div className="dashboard-card transactions-card">
                <div className="card-header">
                  <h3 className="card-title">
                    <History size={18} />
                    <span>5 Dernieres transactions</span>
                  </h3>
                  <button 
                    className="card-action"
                    onClick={() => navigate('/responsable/historique')}
                  >
                    Voir tout
                    <ArrowUpRight size={14} />
                  </button>
                </div>
                <div className="transactions-list">
                  {mockTransactions.map((tx, index) => (
                    <div key={tx.id} className="transaction-item" style={{ animationDelay: `${index * 50}ms` }}>
                      <div className="tx-product">
                        <Package size={16} />
                        <span>{tx.produit}</span>
                      </div>
                      <span className={`tx-type ${tx.type.toLowerCase()}`}>
                        {tx.type}
                      </span>
                      <span className="tx-quantity">{tx.quantite}</span>
                      <span className="tx-date">{tx.date}</span>
                      <span className="tx-user">{tx.magasinier}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Charts section */}
              <div className="dashboard-card chart-card">
                <div className="card-header">
                  <h3 className="card-title">
                    <PieChart size={18} />
                    <span>Repartition par etat</span>
                  </h3>
                </div>
                <div className="chart-placeholder">
                  <div className="pie-chart-mock">
                    <div className="pie-segment ok" style={{ '--percentage': '70%' }}></div>
                    <div className="pie-segment warning" style={{ '--percentage': '20%' }}></div>
                    <div className="pie-segment danger" style={{ '--percentage': '10%' }}></div>
                  </div>
                  <div className="chart-legend">
                    <div className="legend-item">
                      <span className="legend-dot ok"></span>
                      <span>Disponible (70%)</span>
                    </div>
                    <div className="legend-item">
                      <span className="legend-dot warning"></span>
                      <span>Sous seuil (20%)</span>
                    </div>
                    <div className="legend-item">
                      <span className="legend-dot danger"></span>
                      <span>Rupture (10%)</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* AI Alerts */}
              <div className="dashboard-card alerts-card">
                <div className="card-header">
                  <h3 className="card-title">
                    <Bell size={18} />
                    <span>Alertes IA</span>
                  </h3>
                </div>
                <div className="alerts-list">
                  {mockAlerts.map((alert, index) => (
                    <div 
                      key={alert.id} 
                      className={`alert-item ${alert.type}`}
                      style={{ animationDelay: `${index * 100}ms` }}
                    >
                      <div className="alert-icon">
                        {alert.type === 'danger' && <AlertTriangle size={16} />}
                        {alert.type === 'warning' && <Activity size={16} />}
                        {alert.type === 'info' && <Package size={16} />}
                      </div>
                      <div className="alert-content">
                        <p className="alert-message">{alert.message}</p>
                        <span className="alert-time">{alert.time}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Chatbot link */}
              <div className="dashboard-card chatbot-card">
                <div className="chatbot-icon">
                  <Bot size={48} />
                </div>
                <h3 className="chatbot-title">Assistant IA</h3>
                <p className="chatbot-desc">Posez vos questions sur le stock</p>
                <button 
                  className="chatbot-btn"
                  onClick={() => navigate('/responsable/chatbot')}
                >
                  <Bot size={18} />
                  <span>Ouvrir le chat</span>
                </button>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
      </ProtectedPage>

  );
};

export default DashboardResp;

