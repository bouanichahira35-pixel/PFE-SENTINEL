import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ShieldAlert,
  CheckCircle2,
  Package,
  Clock,
  CheckCircle,
  XCircle,
  Edit3,
} from 'lucide-react';
import SidebarResp from '../../components/responsable/SidebarResp';
import HeaderPage from '../../components/shared/HeaderPage';
import ProtectedPage from '../../components/shared/ProtectedPage';
import LoadingSpinner from '../../components/shared/LoadingSpinner';
import { useToast } from '../../components/shared/Toast';
import { get, post, put } from '../../services/api';
import './SurveillanceResp.css';

function levelFromRisk(probability, underThreshold) {
  if (underThreshold || Number(probability || 0) >= 70) return 'Critique';
  if (Number(probability || 0) >= 40) return 'Moyen';
  return 'Faible';
}

const SurveillanceResp = ({ userName, onLogout }) => {
  const toast = useToast();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => (typeof window !== 'undefined' ? window.innerWidth <= 768 : false));
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pendingProducts, setPendingProducts] = useState([]);
  const [aiStockout, setAiStockout] = useState([]);
  const [aiCopilot, setAiCopilot] = useState(null);
  const [aiAnomaly, setAiAnomaly] = useState([]);
  const [editingSeuilId, setEditingSeuilId] = useState(null);
  const [editedSeuil, setEditedSeuil] = useState('');

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [stockoutRes, copilotRes, anomalyRes] = await Promise.all([
        post('/ai/predict/stockout', { horizon_days: 7 }).catch(() => ({ predictions: [] })),
        post('/ai/copilot/recommendations', { horizon_days: 14, top_n: 10, simulations: [] }).catch(() => null),
        post('/ai/predict/anomaly', {}).catch(() => ({ predictions: [] })),
      ]);
      setPendingProducts([]);
      setAiStockout(Array.isArray(stockoutRes?.predictions) ? stockoutRes.predictions : []);
      setAiCopilot(copilotRes || null);
      setAiAnomaly(Array.isArray(anomalyRes?.predictions) ? anomalyRes.predictions : []);
    } catch (err) {
      toast.error(err.message || 'Erreur chargement surveillance');
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const topRiskRows = useMemo(() => {
    const fromCopilot = Array.isArray(aiCopilot?.top_risk_products) ? aiCopilot.top_risk_products : [];
    const source = fromCopilot.length ? fromCopilot : aiStockout;
    return source.slice(0, 12).map((row, idx) => {
      const stock = Number(row.current_stock || 0);
      const seuil = Number(row.seuil_minimum || 0);
      const underThreshold = stock <= seuil;
      return {
        id: `${row.product_id || idx}`,
        productName: row.product_name || 'Produit',
        riskProbability: Number(row.risk_probability || 0),
        level: levelFromRisk(row.risk_probability, underThreshold),
        underThreshold,
        action: `Commander ${Number(row.recommended_order_qty || 0)} u.`,
        detail: row.explanation || (Array.isArray(row.factors) ? row.factors.join(' + ') : 'Risque detecte'),
      };
    });
  }, [aiCopilot, aiStockout]);

  const anomalyRows = useMemo( 
    () => aiAnomaly 
      .filter((x) => Number(x?.anomaly_score || 0) >= 50 || x?.risk_level === 'high') 
      .slice(0, 10), 
    [aiAnomaly] 
  ); 

  const heatmapRows = useMemo(
    () => (Array.isArray(aiCopilot?.heatmap_criticality) ? aiCopilot.heatmap_criticality.slice(0, 8) : []),
    [aiCopilot]
  );

  const surveillanceDecision = useMemo(() => {
    if (!topRiskRows.length) {
      return {
        priorityProduct: '-',
        nextAction: 'Aucune action urgente',
        riskLevel: 'Stable',
      };
    }
    const top = topRiskRows[0];
    return {
      priorityProduct: top.productName,
      nextAction: top.action,
      riskLevel: top.level,
    };
  }, [topRiskRows]);

  const mappedPendingProducts = useMemo(() => (
    pendingProducts.map((p) => ({
      id: p._id,
      code: p.code_product,
      nom: p.name,
      categorie: p.category?.name || '-',
      unite: p.unite || 'Unite',
      seuilMinimum: Number(p.seuil_minimum || 0),
      description: p.description || '',
      magasinier: p.created_by?.username || '-',
      dateSoumission: p.createdAt ? new Date(p.createdAt).toLocaleString('fr-FR') : '-',
    }))
  ), [pendingProducts]);

  const startEditSeuil = (id, currentSeuil) => {
    setEditingSeuilId(id);
    setEditedSeuil(String(currentSeuil));
  };

  const cancelEditSeuil = () => {
    setEditingSeuilId(null);
    setEditedSeuil('');
  };

  const saveEditedSeuil = async (id) => {
    const newSeuil = Number.parseInt(editedSeuil, 10);
    if (!Number.isFinite(newSeuil) || newSeuil < 0) {
      toast.error('Seuil minimum invalide');
      return;
    }
    setIsSubmitting(true);
    try {
      await put(`/products/${id}`, { seuil_minimum: newSeuil });
      await loadData();
      toast.success('Seuil minimum mis a jour');
      cancelEditSeuil();
    } catch (err) {
      toast.error(err.message || 'Echec mise a jour seuil');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleValidate = async (id) => {
    setIsSubmitting(true);
    try {
      const pending = mappedPendingProducts.find((p) => p.id === id);
      const seuilToSave = editingSeuilId === id ? Number.parseInt(editedSeuil, 10) : pending?.seuilMinimum;
      if (!Number.isFinite(seuilToSave) || seuilToSave < 0) {
        toast.error('Seuil minimum invalide');
        return;
      }
      await put(`/products/${id}`, { seuil_minimum: seuilToSave });
      await loadData();
      toast.success('Produit mis a jour');
      cancelEditSeuil();
    } catch (err) {
      toast.error(err.message || 'Echec mise a jour produit');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReject = async (id) => {
    setIsSubmitting(true);
    try {
      toast.warning("Rejet/validation des produits desactivee: un produit cree est utilisable immediatement.");
      cancelEditSeuil();
    } catch (err) {
      toast.error(err.message || 'Echec rejet produit');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ProtectedPage userName={userName}>
      <div className="app-layout">
        <div
          className={`sidebar-backdrop ${sidebarCollapsed ? 'hidden' : ''}`}
          onClick={() => setSidebarCollapsed(true)}
        />
        <SidebarResp
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
          onLogout={onLogout}
          userName={userName}
        />
        <div className="main-container">
          <HeaderPage
            userName={userName}
            title="Surveillance"
            showSearch={false}
            onMenuClick={() => setSidebarCollapsed((prev) => !prev)}
          />
          <main className="main-content">
            {(isLoading || isSubmitting) && <LoadingSpinner overlay text="Chargement..." />}

            <div className="surv-page">
              <div className="surv-kpis"> 
                <div className="surv-kpi"> 
                  <AlertTriangle size={18} /> 
                  <div><span>Critiques</span><strong>{topRiskRows.filter((x) => x.level === 'Critique').length}</strong></div> 
                </div>
                <div className="surv-kpi">
                  <ShieldAlert size={18} />
                  <div><span>Anomalies fortes</span><strong>{anomalyRows.length}</strong></div>
                </div>
                <div className="surv-kpi">
                  <Clock size={18} />
                  <div><span>Produits a traiter</span><strong>{mappedPendingProducts.length}</strong></div> 
                </div> 
              </div> 

              <div className="surv-decision-strip">
                <div className="surv-decision-card">
                  <span>Produit prioritaire</span>
                  <strong>{surveillanceDecision.priorityProduct}</strong>
                  <small>Niveau: {surveillanceDecision.riskLevel}</small>
                </div>
                <div className="surv-decision-card">
                  <span>Action immediate</span>
                  <strong>{surveillanceDecision.nextAction}</strong>
                  <small>Decision de surveillance active</small>
                </div>
                <div className="surv-decision-card">
                  <span>Etat general</span>
                  <strong>{topRiskRows.length ? `${topRiskRows.length} produit(s) a suivre` : 'Aucun risque fort'}</strong>
                  <small>Vue priorisee du jour</small>
                </div>
              </div>

              <div className="surv-grid"> 
                <div className="surv-card"> 
                  <div className="surv-card-head"> 
                    <h3><AlertTriangle size={18} /> Produits a surveiller</h3>
                  </div>
                  <div className="surv-table-wrap">
                    <table className="surv-table">
                      <thead>
                        <tr>
                          <th>Produit</th>
                          <th>Niveau</th>
                          <th>Action</th>
                          <th>Risque</th>
                        </tr>
                      </thead>
                      <tbody>
                        {topRiskRows.slice(0, 8).map((row) => (
                          <tr key={row.id}>
                            <td>
                              <strong>{row.productName}</strong>
                              <small>{row.detail}</small>
                            </td>
                            <td><span className={`level-pill ${row.level.toLowerCase()}`}>{row.level}</span></td>
                            <td>{row.action}</td>
                            <td>{row.riskProbability.toFixed(1)}%</td>
                          </tr>
                        ))}
                        {!topRiskRows.length && (
                          <tr><td colSpan={4} className="empty-row">Aucun produit a surveiller actuellement.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="surv-card"> 
                  <div className="surv-card-head"> 
                    <h3><ShieldAlert size={18} /> Detection anomalies</h3> 
                  </div> 
                  <div className="anomaly-list"> 
                    {anomalyRows.map((x) => (
                      <div className="anomaly-item" key={`${x.product_id}-${x.anomaly_score}`}>
                        <div>
                          <strong>{x.product_name || 'Produit'}</strong>
                          <small>{x.reason || 'Comportement anormal detecte'}</small>
                        </div>
                        <span className={`anomaly-score ${Number(x.anomaly_score || 0) >= 70 ? 'high' : 'mid'}`}>
                          {Number(x.anomaly_score || 0).toFixed(1)}%
                        </span>
                      </div>
                    ))}
                    {!anomalyRows.length && <p className="empty-row">Aucune anomalie forte detectee.</p>} 
                  </div> 
                  <div className="heatmap-block">
                    <h4>Heatmap criticite</h4>
                    <div className="heatmap-list">
                      {heatmapRows.map((item) => (
                        <div key={`${item.product_id}-${item.color}`} className="heatmap-item">
                          <span className="heatmap-name">{item.product_name || 'Produit'}</span>
                          <span className={`heatmap-dot ${String(item.color || '').toLowerCase() || 'green'}`} />
                        </div>
                      ))}
                      {!heatmapRows.length && <p className="empty-row">Heatmap indisponible.</p>}
                    </div>
                  </div>
                </div> 
              </div> 

              <div className="surv-card pending-card">
                <div className="surv-card-head">
                  <h3><Package size={18} /> Produits en attente de validation</h3>
                </div>
                {!mappedPendingProducts.length ? (
                  <div className="pending-empty">
                    <CheckCircle2 size={20} />
                    <p>Aucun produit en attente.</p>
                  </div>
                ) : (
                  <div className="pending-list">
                    {mappedPendingProducts.map((product) => (
                      <div key={product.id} className="pending-item">
                        <div className="pending-top">
                          <div className="pending-title">
                            <strong>{product.nom}</strong>
                            <span>{product.code}</span>
                          </div>
                          <span className="pending-meta">{product.dateSoumission}</span>
                        </div>

                        <div className="pending-meta-grid">
                          <div><label>Categorie</label><span>{product.categorie}</span></div>
                          <div><label>Unite</label><span>{product.unite}</span></div>
                          <div>
                            <label>Seuil min</label>
                            {editingSeuilId === product.id ? (
                              <div className="seuil-edit-group">
                                <input type="number" min="0" value={editedSeuil} onChange={(e) => setEditedSeuil(e.target.value)} />
                                <button className="icon-btn" onClick={() => saveEditedSeuil(product.id)}><CheckCircle size={14} /></button>
                                <button className="icon-btn danger" onClick={cancelEditSeuil}><XCircle size={14} /></button>
                              </div>
                            ) : (
                              <span className="seuil-display" onClick={() => startEditSeuil(product.id, product.seuilMinimum)}>
                                {product.seuilMinimum} <Edit3 size={12} />
                              </span>
                            )}
                          </div>
                          <div><label>Magasinier</label><span>{product.magasinier}</span></div>
                        </div>

                        {product.description && <p className="pending-desc">{product.description}</p>}

                        <div className="pending-actions">
                          <button className="pending-btn ok" onClick={() => handleValidate(product.id)}>
                            <CheckCircle size={15} /> Valider
                          </button>
                          <button className="pending-btn no" onClick={() => handleReject(product.id)}>
                            <XCircle size={15} /> Rejeter
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </main>
        </div>
      </div>
    </ProtectedPage>
  );
};

export default SurveillanceResp;
