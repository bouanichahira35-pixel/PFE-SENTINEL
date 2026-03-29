import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, PieChart, SlidersHorizontal, Sparkles } from 'lucide-react';
import SidebarResp from '../../components/responsable/SidebarResp';
import HeaderPage from '../../components/shared/HeaderPage';
import ProtectedPage from '../../components/shared/ProtectedPage';
import LoadingSpinner from '../../components/shared/LoadingSpinner';
import { useToast } from '../../components/shared/Toast';
import { get, post } from '../../services/api';
import './AnalyseResp.css';

function levelFromRisk(probability, underThreshold) {
  if (underThreshold || Number(probability || 0) >= 70) return 'Critique';
  if (Number(probability || 0) >= 40) return 'Moyen';
  return 'Faible';
}

const AnalyseResp = ({ userName, onLogout }) => {
  const toast = useToast();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => (typeof window !== 'undefined' ? window.innerWidth <= 768 : false));
  const [isLoading, setIsLoading] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);
  const [aiCopilot, setAiCopilot] = useState(null);
  const [aiStockout, setAiStockout] = useState([]);
  const [metrics, setMetrics] = useState(null);
  const [curveProductId, setCurveProductId] = useState('');
  const [curveMode, setCurveMode] = useState('auto');
  const [simulationProductId, setSimulationProductId] = useState('');
  const [simulationQty, setSimulationQty] = useState('50');

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [stockoutRes, copilotRes, metricsRes] = await Promise.all([
        post('/ai/predict/stockout', { horizon_days: 7 }).catch(() => ({ predictions: [] })),
        post('/ai/copilot/recommendations', { horizon_days: 14, top_n: 10, simulations: [] }).catch(() => null),
        get('/ai/models/metrics').catch(() => ({ metrics: null })),
      ]);
      setAiStockout(Array.isArray(stockoutRes?.predictions) ? stockoutRes.predictions : []);
      setAiCopilot(copilotRes || null);
      setMetrics(metricsRes?.metrics || null);
    } catch (err) {
      toast.error(err.message || 'Erreur chargement analyse');
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const topRiskProducts = useMemo(() => {
    const fromCopilot = Array.isArray(aiCopilot?.top_risk_products) ? aiCopilot.top_risk_products : [];
    if (fromCopilot.length) return fromCopilot;
    return aiStockout;
  }, [aiCopilot, aiStockout]);

  const riskProducts = useMemo(() => ( 
    topRiskProducts.map((row) => { 
      const stock = Number(row.current_stock || 0); 
      const seuil = Number(row.seuil_minimum || 0); 
      const underThreshold = stock <= seuil; 
      return {
        ...row,
        under_threshold: underThreshold,
        critical_score: Number(row.risk_probability || 0) + (underThreshold ? 25 : 0),
      }; 
    }) 
  ), [topRiskProducts]); 

  const decisionSnapshot = useMemo(() => {
    const sorted = [...riskProducts].sort((a, b) => Number(b.critical_score || 0) - Number(a.critical_score || 0));
    const top = sorted[0];
    if (!top) {
      return {
        priorityProduct: '-',
        riskWindow: 'Aucun signal critique detecte',
        action: 'Surveillance standard',
      };
    }
    const daysCover = Number(top.days_cover_estimate || 0);
    const riskWindow = Number.isFinite(daysCover) && daysCover > 0
      ? `Risque eleve estime sous ${Math.max(1, Math.round(daysCover))} jour(s)`
      : 'Risque eleve detecte a court terme';
    return {
      priorityProduct: String(top.product_name || 'Produit'),
      riskWindow,
      action: `Commander ${Number(top.recommended_order_qty || 0)} unite(s)`,
    };
  }, [riskProducts]);

  const aiCurves = useMemo(
    () => (Array.isArray(aiCopilot?.dashboard_curves) ? aiCopilot.dashboard_curves : []),
    [aiCopilot]
  );

  const curveIds = useMemo(() => new Set(aiCurves.map((c) => String(c.product_id))), [aiCurves]);

  const criticalCurveCandidate = useMemo(() => {
    const sorted = [...riskProducts].sort((a, b) => Number(b.critical_score || 0) - Number(a.critical_score || 0));
    return sorted.find((x) => curveIds.has(String(x.product_id))) || null;
  }, [riskProducts, curveIds]);

  useEffect(() => {
    if (!aiCurves.length) {
      setCurveProductId('');
      return;
    }
    if (curveMode === 'auto') {
      const next = criticalCurveCandidate?.product_id || aiCurves[0]?.product_id;
      if (String(next || '') && String(next) !== String(curveProductId)) setCurveProductId(String(next));
      return;
    }
    if (curveProductId && !curveIds.has(String(curveProductId))) {
      setCurveProductId(String(criticalCurveCandidate?.product_id || aiCurves[0]?.product_id || ''));
    }
  }, [aiCurves, curveMode, criticalCurveCandidate, curveIds, curveProductId]);

  const selectedCurve = useMemo(() => {
    if (!aiCurves.length) return null;
    return aiCurves.find((x) => String(x.product_id) === String(curveProductId)) || aiCurves[0];
  }, [aiCurves, curveProductId]);

  const selectedHistory = useMemo(
    () => (selectedCurve?.history_30d?.values || []).slice(-14).map((v) => Number(v || 0)),
    [selectedCurve]
  );
  const selectedHistoryLabels = useMemo(
    () => (selectedCurve?.history_30d?.labels || []).slice(-14),
    [selectedCurve]
  );
  const selectedForecast = useMemo(
    () => (selectedCurve?.forecast_14d?.values || []).slice(0, 14).map((v) => Number(v || 0)),
    [selectedCurve]
  );
  const selectedForecastLabels = useMemo(
    () => (selectedCurve?.forecast_14d?.labels || []).slice(0, 14),
    [selectedCurve]
  );

  const curveMax = useMemo(
    () => Math.max(1, ...selectedHistory, ...selectedForecast),
    [selectedHistory, selectedForecast]
  );

  useEffect(() => {
    if (!selectedCurve?.product_id) return;
    setSimulationProductId((prev) => prev || String(selectedCurve.product_id));
  }, [selectedCurve]);

  const runSimulation = async () => {
    const qty = Number(simulationQty);
    if (!simulationProductId || !Number.isFinite(qty) || qty < 0) {
      toast.error('Parametres simulation invalides');
      return;
    }
    setIsSimulating(true);
    try {
      const result = await post('/ai/copilot/recommendations', {
        horizon_days: 14,
        top_n: 10,
        simulations: [{ product_id: simulationProductId, order_qty: qty }],
      });
      setAiCopilot(result || null);
      toast.success('Simulation appliquee');
    } catch (err) {
      toast.error(err.message || 'Echec simulation');
    } finally {
      setIsSimulating(false);
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
            title="Analyse & Prevision"
            showSearch={false}
            onMenuClick={() => setSidebarCollapsed((prev) => !prev)}
          />
          <main className="main-content">
            {(isLoading || isSimulating) && <LoadingSpinner overlay text="Chargement..." />}

            <div className="analyse-page">
              <div className="analyse-metrics-grid"> 
                <div className="analyse-metric-card"> 
                  <span>F1 Rupture</span> 
                  <strong>{metrics?.stockout_j7?.f1 ?? '-'}</strong> 
                </div>
                <div className="analyse-metric-card">
                  <span>AUC Rupture</span>
                  <strong>{metrics?.stockout_j7?.auc ?? '-'}</strong>
                </div>
                <div className="analyse-metric-card">
                  <span>MAPE Conso</span>
                  <strong>{metrics?.consumption_j14?.mape ?? '-'}%</strong>
                </div>
                <div className="analyse-metric-card">
                  <span>Produits critiques</span>
                  <strong>{riskProducts.filter((x) => levelFromRisk(x.risk_probability, x.under_threshold) === 'Critique').length}</strong> 
                </div> 
              </div> 

              <div className="analyse-decision-strip">
                <div className="analyse-decision-card">
                  <span>Produit prioritaire</span>
                  <strong>{decisionSnapshot.priorityProduct}</strong>
                  <small>Base: criticite calculee</small>
                </div>
                <div className="analyse-decision-card">
                  <span>Fenetre de risque</span>
                  <strong>{decisionSnapshot.riskWindow}</strong>
                  <small>Lecture: stock et couverture</small>
                </div>
                <div className="analyse-decision-card">
                  <span>Action recommandee</span>
                  <strong>{decisionSnapshot.action}</strong>
                  <small>Simulation disponible ci-dessous</small>
                </div>
              </div>

              <div className="analyse-card curve-card"> 
                <div className="card-header"> 
                  <h3 className="card-title"><PieChart size={18} /><span>Courbe detaillee par produit</span></h3> 
                  <div className="curve-actions">
                    <select
                      value={curveProductId}
                      onChange={(e) => {
                        setCurveMode('manual');
                        setCurveProductId(e.target.value);
                      }}
                      disabled={!aiCurves.length}
                    >
                      {!aiCurves.length && <option value="">Aucune courbe disponible</option>}
                      {aiCurves.map((c) => (
                        <option key={c.product_id} value={c.product_id}>{c.product_name}</option>
                      ))}
                    </select>
                    <button
                      className="analyse-btn ghost"
                      type="button"
                      onClick={() => setCurveMode('auto')}
                      disabled={curveMode === 'auto' || !aiCurves.length}
                    >
                      <Sparkles size={14} /> Auto critique
                    </button>
                  </div>
                </div>

                <div className="curve-mode-banner">
                  <SlidersHorizontal size={14} />
                  Mode: <strong>{curveMode === 'auto' ? 'Auto critique' : 'Manuel'}</strong>
                  {criticalCurveCandidate && (
                    <span className="critical-inline">
                      Produit critique: <strong>{criticalCurveCandidate.product_name}</strong>
                    </span>
                  )}
                </div>

                <div className="analyse-curve-wrap">
                  <div className="analyse-curve-grid" />
                  <div className="analyse-curve">
                    {selectedHistory.map((v, i) => (
                      <div className="analyse-col" key={`h-${i}`}>
                        <div className="analyse-bar historical" style={{ height: `${Math.max(8, Math.round((v / curveMax) * 100))}%` }} />
                        <span>{selectedHistoryLabels[i]?.slice(5) || '-'}</span>
                      </div>
                    ))}
                    {selectedForecast.map((v, i) => (
                      <div className="analyse-col" key={`f-${i}`}>
                        <div className="analyse-bar forecast" style={{ height: `${Math.max(8, Math.round((v / curveMax) * 100))}%` }} />
                        <span>{selectedForecastLabels[i]?.slice(5) || '-'}</span>
                      </div>
                    ))}
                    {!selectedCurve && <div className="analyse-empty">Aucune courbe disponible pour le moment.</div>}
                  </div>
                </div>
                <div className="analyse-legend">
                  <span><i className="legend-dot historical" />Historique</span>
                  <span><i className="legend-dot forecast" />Prevision</span>
                </div>
              </div>

              <div className="analyse-card simulation-card"> 
                <div className="card-header"> 
                  <h3 className="card-title"><Activity size={18} /><span>Simulation d'impact commande</span></h3> 
                </div> 
                <div className="simulation-row">
                  <select value={simulationProductId} onChange={(e) => setSimulationProductId(e.target.value)}>
                    <option value="">Choisir un produit</option>
                    {riskProducts.map((p) => (
                      <option key={p.product_id} value={p.product_id}>{p.product_name}</option>
                    ))}
                  </select>
                  <input type="number" min="0" value={simulationQty} onChange={(e) => setSimulationQty(e.target.value)} />
                  <button className="analyse-btn primary" onClick={runSimulation}>Simuler</button>
                </div>
                {Array.isArray(aiCopilot?.simulations) && aiCopilot.simulations.length > 0 && (
                  <p className="simulation-result">
                    Risque {aiCopilot.simulations[0].risk_before_pct}% -&gt; {aiCopilot.simulations[0].risk_after_pct}% apres commande.
                  </p>
                )}
              </div>
            </div>
          </main>
        </div>
      </div>
    </ProtectedPage>
  );
};

export default AnalyseResp;
