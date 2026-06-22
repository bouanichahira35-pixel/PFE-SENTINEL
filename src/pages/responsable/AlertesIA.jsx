// BLOC 1 - Role du fichier.
// Ce fichier affiche une page de l'espace responsable pour AlertesIA.
// Point de vigilance: garder les props, appels API et classes CSS synchronises avec les ecrans existants.

import { useCallback, useMemo, useState } from 'react';
import { Search, FileText, BarChart3, HelpCircle, TrendingUp, CheckCircle } from 'lucide-react';
import jsPDF from 'jspdf';
import * as XLSX from 'xlsx';
import SidebarResp from '../../components/responsable/SidebarResp';
import HeaderPage from '../../components/shared/HeaderPage';
import ProtectedPage from '../../components/shared/ProtectedPage';
import { useToast } from '../../components/shared/Toast';
import './AlertesIA.css';

// 🆕 Données exemple d'alertes IA - Base réaliste PERFECTIONNÉE pour démonstration soutenance
const SAMPLE_ALERTS = [
  {
    _id: '1',
    type: 'CRITIQUE',
    product: 'Filtre Carburant PRD-2026-0255',
    code: 'FLT-CAR-0255',
    cause: 'Détection d\'anomalie : sortie anormale détectée',
    stock_current: 3,
    stock_threshold: 12,
    available_stock: 150, // 🆕 Stock disponible chez fournisseur
    avg_consumption: 4.2,
    days_left: 1,
    days_waiting: 2, // 🆕 Jours depuis création de l'alerte
    impact_value: 520,
    recommendation: 'Commander 50 unités en urgence. Ligne production A à l\'arrêt possible.',
    created_at: new Date(),
    status: 'ACTIF',
    ai_explanation: 'Isolation Forest détecte écart statistique +320% vs consommation moyenne. Seuil dynamique calculé: 3.2 u/jour',
    model_used: 'Isolation Forest',
    confidence: 94,
    reviewed: false,
    rejection_reason: null, // 🆕 Motif de refus si rejetée
  },
  {
    _id: '2',
    type: 'ÉLEVÉ',
    product: 'Courroie de Distribution SEG-2345',
    code: 'SEG-DIST-2345',
    cause: 'Rupture prédite dans 4 jours',
    stock_current: 8,
    stock_threshold: 15,
    available_stock: 45, // 🆕 Disponible
    avg_consumption: 1.8,
    days_left: 4,
    days_waiting: 4, // 🆕 À traiter rapidement
    impact_value: 280,
    recommendation: 'Réapprovisionner dans les 48h. Prévenir service maintenance.',
    created_at: new Date(Date.now() - 86400000),
    status: 'ACTIF',
    ai_explanation: 'ARIMA + tendance linéaire : hausse +12% sur 7 derniers jours. Pic prévu mercredi.',
    model_used: 'ARIMA',
    confidence: 87,
    reviewed: false,
    rejection_reason: null,
  },
  {
    _id: '3',
    type: 'NORMAL',
    product: 'Batterie Lithium-Ion 18650',
    code: 'BAT-LI-18650',
    cause: 'Consommation supérieure aux prédictions',
    stock_current: 42,
    stock_threshold: 35,
    available_stock: 200, // 🆕 Disponible
    avg_consumption: 3.1,
    days_left: 13,
    days_waiting: 1, // 🆕 En attente (bleu)
    impact_value: 125,
    recommendation: 'Surveiller l\'évolution. Aucune action immédiate requise.',
    created_at: new Date(Date.now() - 172800000),
    status: 'ACTIF',
    ai_explanation: 'Z-score: +1.8 (acceptable). Variabilité saisonnière identifiée (Ligne B ramp-up).',
    model_used: 'Z-Score',
    confidence: 72,
    reviewed: false,
    rejection_reason: null,
  },
  {
    _id: '4',
    type: 'CRITIQUE',
    product: 'Câble USB Type-C Industrial',
    code: 'CBL-USB-3C',
    cause: 'Stock critique atteint - Rupture imminente',
    stock_current: 6,
    stock_threshold: 18,
    available_stock: 0, // 🆕 STOCK INSUFFISANT - Bouton désactivé
    avg_consumption: 3.5,
    days_left: 2,
    days_waiting: 8, // 🆕 En retard (rouge)
    impact_value: 380,
    recommendation: 'Appel fournisseur immédiat. Envisager sourcing alternatif.',
    created_at: new Date(Date.now() - 43200000),
    status: 'ACTIF',
    ai_explanation: 'Régression polynomiale: pente +0.8 u/jour sur 7j. Délai fournisseur connu: 3-5 jours.',
    model_used: 'Polynomial Regression',
    confidence: 91,
    reviewed: false,
    rejection_reason: null,
  },
  {
    _id: '5',
    type: 'ÉLEVÉ',
    product: 'Graisse Lubrifiant Haute Température',
    code: 'GRS-LUBE-HT',
    cause: 'Tendance à la hausse détectée',
    stock_current: 11,
    stock_threshold: 20,
    available_stock: 80, // 🆕 Disponible
    avg_consumption: 2.2,
    days_left: 5,
    days_waiting: 6, // 🆕 À traiter rapidement (orange)
    impact_value: 145,
    recommendation: 'Commander 30 litres. Validation acheteur en attente.',
    created_at: new Date(Date.now() - 129600000),
    status: 'ACTIF',
    ai_explanation: 'Moving Average (7j): +8% vs baseline. Maintenance préventive ligne C activée.',
    model_used: 'Moving Average',
    confidence: 79,
    reviewed: false,
    rejection_reason: null,
  },
  {
    _id: '6',
    type: 'NORMAL',
    product: 'Roulement à Billes 6205-2Z',
    code: 'ROU-6205-2Z',
    cause: 'Consommation régulière, aucune anomalie',
    stock_current: 28,
    stock_threshold: 25,
    available_stock: 120, // 🆕 Disponible
    avg_consumption: 1.2,
    days_left: 23,
    days_waiting: 3, // 🆕 En attente
    impact_value: 95,
    recommendation: 'Aucune action. Stock optimal.',
    created_at: new Date(Date.now() - 259200000),
    status: 'ACTIF',
    ai_explanation: 'Z-score: -0.3 (normal). Consommation stable, pas de corrélation avec variables externes.',
    model_used: 'Z-Score',
    confidence: 88,
    reviewed: false,
    rejection_reason: null,
  },
  {
    _id: '7',
    type: 'ÉLEVÉ',
    product: 'Capteur de Température DS18B20',
    code: 'CAP-TEMP-DS18',
    cause: 'Hausse prédite des besoins (Expansion IoT)',
    stock_current: 15,
    stock_threshold: 25,
    available_stock: 95, // 🆕 Disponible
    avg_consumption: 2.8,
    days_left: 5,
    days_waiting: 2, // 🆕 En attente
    impact_value: 210,
    recommendation: 'Augmenter stock de 20%. Nouveau projet IoT confirmé pour Q3.',
    created_at: new Date(Date.now() - 7200000),
    status: 'ACTIF',
    ai_explanation: 'Prophet (Facebook): pics saisonniers +25% prévus. Corrélation projet IT détectée.',
    model_used: 'Prophet',
    confidence: 83,
    reviewed: false,
    rejection_reason: null,
  },
  {
    _id: '8',
    type: 'NORMAL',
    product: 'Écrou Inoxydable M8',
    code: 'ECR-INX-M8',
    cause: 'Variabilité légère, consommation prévisible',
    stock_current: 156,
    stock_threshold: 100,
    available_stock: 500, // 🆕 Très disponible
    avg_consumption: 8.5,
    days_left: 18,
    days_waiting: 1, // 🆕 En attente
    impact_value: 65,
    recommendation: 'Stock confortable. Achat groupé lors du prochain appel fournisseur.',
    created_at: new Date(Date.now() - 345600000),
    status: 'ACTIF',
    ai_explanation: 'Holt-Winters: saisonnalité bien capturée. Coefficient de variation: 0.12 (stable).',
    model_used: 'Holt-Winters',
    confidence: 95,
    reviewed: false,
    rejection_reason: null,
  },
];

function formatDt(value) {
  if (!value) return '-';
  try {
    return new Date(value).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' });
  } catch {
    return '-';
  }
}

// 🆕 Fonction pour déterminer le niveau d'urgence basé sur les jours d'attente
function getUrgencyLevel(daysWaiting) {
  if (daysWaiting <= 3) return { level: 'attente', label: 'En attente', color: 'blue' };
  if (daysWaiting <= 7) return { level: 'urgent', label: 'À traiter rapidement', color: 'orange' };
  return { level: 'retard', label: 'En retard', color: 'red' };
}

const AlertesIA = ({ userName, onLogout }) => {
  const toast = useToast();
  const [alerts, setAlerts] = useState(SAMPLE_ALERTS);
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedTooltip, setExpandedTooltip] = useState(null);
  const [rejectModal, setRejectModal] = useState(null); // 🆕 { alertId, reason: '' }
  const [rejectReason, setRejectReason] = useState(''); // 🆕 Motif de refus

  const filtered = useMemo(() => {
    let result = alerts;

    if (typeFilter !== 'all') {
      result = result.filter(a => a.type === typeFilter);
    }

    if (statusFilter !== 'all') {
      result = result.filter(a => a.status === statusFilter);
    }

    const q = String(searchQuery || '').trim().toLowerCase();
    if (q) {
      result = result.filter(a => {
        const haystack = [a.product, a.code, a.cause].join(' ').toLowerCase();
        return haystack.includes(q);
      });
    }

    return result;
  }, [alerts, typeFilter, statusFilter, searchQuery]);

  // 🆕 Stats - Calcul dynamique
  const stats = useMemo(() => ({
    total: alerts.length,
    critiques: alerts.filter(a => a.type === 'CRITIQUE' && !a.reviewed).length,
    elevees: alerts.filter(a => a.type === 'ÉLEVÉ' && !a.reviewed).length,
    normales: alerts.filter(a => a.type === 'NORMAL' && !a.reviewed).length,
    actives: alerts.filter(a => a.status === 'ACTIF' && !a.reviewed).length,
    totalValue: alerts.filter(a => !a.reviewed).reduce((sum, a) => sum + (a.impact_value || 0), 0),
  }), [alerts]);

  // 🆕 Marquer une alerte comme revue
  const handleMarkReviewed = useCallback((alertId) => {
    setAlerts(prev =>
      prev.map(a =>
        a._id === alertId ? { ...a, reviewed: true } : a
      )
    );
    toast.success('Alerte marquée comme revue ✓');
  }, [toast]);

  // 🆕 Export PDF rapport
  const exportPDF = useCallback(() => {
    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const margin = 10;
      let yPos = 20;

      // En-tête
      doc.setFontSize(24);
      doc.setTextColor(5, 150, 196);
      doc.text('SENTINEL', margin, yPos);
      
      doc.setFontSize(10);
      doc.setTextColor(100, 116, 139);
      doc.text('Rapport Alertes IA - ' + new Date().toLocaleDateString('fr-FR'), margin, yPos + 8);

      yPos += 20;

      // Stats KPIs
      doc.setFontSize(12);
      doc.setTextColor(15, 23, 42);
      doc.text('Résumé des Alertes', margin, yPos);
      yPos += 8;

      const kpiData = [
        ['Total alertes', String(stats.total)],
        ['Critiques', String(stats.critiques)],
        ['Élevées', String(stats.elevees)],
        ['Normales', String(stats.normales)],
        ['Valeur impact', stats.totalValue.toFixed(0) + '€'],
      ];

      doc.autoTable({
        startY: yPos,
        head: [['Métrique', 'Valeur']],
        body: kpiData,
        margin: { left: margin, right: margin },
        theme: 'grid',
        headStyles: { fillColor: [5, 150, 196], textColor: [255, 255, 255], fontStyle: 'bold' },
        bodyStyles: { textColor: [15, 23, 42] },
      });

      yPos = doc.lastAutoTable.finalY + 15;

      // Tableau détails alertes
      doc.setFontSize(12);
      doc.setTextColor(15, 23, 42);
      doc.text('Détails des Alertes', margin, yPos);
      yPos += 8;

      const alertData = filtered.map(a => [
        a.code,
        a.product,
        a.type,
        String(a.stock_current),
        String(a.stock_threshold),
        String(a.days_left) + ' j',
        a.recommendation.substring(0, 30) + '...',
      ]);

      doc.autoTable({
        startY: yPos,
        head: [['Code', 'Produit', 'Type', 'Stock', 'Seuil', 'Jours', 'Recommandation']],
        body: alertData,
        margin: { left: margin, right: margin },
        theme: 'striped',
        headStyles: { fillColor: [5, 150, 196], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
        bodyStyles: { textColor: [15, 23, 42], fontSize: 8 },
      });

      // Pied de page
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text('Généré le ' + new Date().toLocaleString('fr-FR'), margin, doc.internal.pageSize.getHeight() - 10);
      doc.text('SENTINEL © 2026', pageWidth - margin - 30, doc.internal.pageSize.getHeight() - 10);

      doc.save('rapport-alertes-ia.pdf');
      toast.success('Rapport PDF généré avec succès');
    } catch (err) {
      toast.error('Erreur génération PDF');
    }
  }, [filtered, stats, toast]);

  // 🆕 Export Excel
  const exportExcel = useCallback(() => {
    try {
      const ws_data = [
        ['Code', 'Produit', 'Type', 'Stock', 'Seuil', 'Jours', 'Impact (€)', 'Modèle IA', 'Confiance', 'Recommandation', 'Date'],
        ...filtered.map(a => [
          a.code,
          a.product,
          a.type,
          a.stock_current,
          a.stock_threshold,
          a.days_left,
          a.impact_value,
          a.model_used,
          a.confidence + '%',
          a.recommendation,
          formatDt(a.created_at),
        ]),
      ];

      const ws = XLSX.utils.aoa_to_sheet(ws_data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Alertes IA');
      XLSX.writeFile(wb, 'alertes-ia-rapport.xlsx');
      toast.success('Excel exporté avec succès');
    } catch (err) {
      toast.error('Erreur export Excel');
    }
  }, [filtered, toast]);

  return (
    <ProtectedPage requiredRole="responsable" userName={userName}>
      <div className="app-layout">
        <div className={`sidebar-backdrop ${sidebarCollapsed ? 'hidden' : ''}`} onClick={() => setSidebarCollapsed(true)} />
        <SidebarResp collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} onLogout={onLogout} userName={userName} />

        <div className="main-container">
          <HeaderPage userName={userName} title="Alertes IA" showSearch={false} onMenuClick={() => setSidebarCollapsed(p => !p)} />
          <main className="main-content">
            {/* 🆕 KPIs - Simplifié et sans redondance */}
            <div className="alerts-kpis">
              <div className="kpi critical">
                <div className="kpi-icon">🔴</div>
                <div className="kpi-label">Critiques</div>
                <div className="kpi-value">{stats.critiques}</div>
              </div>
              <div className="kpi elevated">
                <div className="kpi-icon">🟠</div>
                <div className="kpi-label">Élevées</div>
                <div className="kpi-value">{stats.elevees}</div>
              </div>
              <div className="kpi normal">
                <div className="kpi-icon">🟡</div>
                <div className="kpi-label">Normales</div>
                <div className="kpi-value">{stats.normales}</div>
              </div>
              <div className="kpi value">
                <div className="kpi-icon">💰</div>
                <div className="kpi-label">Valeur Impact</div>
                <div className="kpi-value">{stats.totalValue.toFixed(0)}€</div>
              </div>
            </div>

            {/* 🆕 Toolbar - Propre et sans redondance */}
            <div className="alerts-toolbar">
              <div className="alerts-search">
                <Search size={16} />
                <input 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Rechercher alerte..."
                />
              </div>
              <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
                <option value="all">Tous les types</option>
                <option value="CRITIQUE">🔴 Critiques</option>
                <option value="ÉLEVÉ">🟠 Élevées</option>
                <option value="NORMAL">🟡 Normales</option>
              </select>
              <button className="btn" onClick={exportPDF}>
                <FileText size={16} /> PDF
              </button>
              <button className="btn" onClick={exportExcel}>
                <BarChart3 size={16} /> Excel
              </button>
            </div>

            {/* Alertes */}
            <div className="alerts-list">
              {filtered.length === 0 ? (
                <div className="alerts-empty">Aucune alerte trouvée.</div>
              ) : (
                filtered.map(alert => (
                  <div 
                    key={alert._id} 
                    className={`alert-card ${alert.type.toLowerCase()} ${alert.reviewed ? 'reviewed' : ''}`}
                  >
                    <div className="alert-head">
                      <div className="alert-head-left">
                        <div className="alert-code">{alert.code}</div>
                        <div className="alert-product">{alert.product}</div>
                      </div>
                      <div className="alert-head-right">
                        <span className={`alert-badge ${alert.type.toLowerCase()}`}>
                          {alert.type}
                        </span>
                        {alert.reviewed && (
                          <span className="alert-badge-reviewed">
                            <CheckCircle size={12} /> Validé
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="alert-details">
                      <span>Cause: <strong>{alert.cause}</strong></span>
                      <span>Stock: <strong>{alert.stock_current}/{alert.stock_threshold}</strong></span>
                      <span>Rupture dans: <strong>{alert.days_left} j</strong></span>
                      <span>Impact: <strong>{alert.impact_value}€</strong></span>
                    </div>

                    {/* 🆕 Badge du modèle IA avec confiance */}
                    <div className="alert-ai-model">
                      <div className="model-badge">
                        <TrendingUp size={13} />
                        <span className="model-name">{alert.model_used}</span>
                        <span className="confidence-score">{alert.confidence}%</span>
                      </div>
                      <button
                        className="btn-tooltip"
                        onMouseEnter={() => setExpandedTooltip(alert._id)}
                        onMouseLeave={() => setExpandedTooltip(null)}
                        title="Cliquez pour voir l'explication du modèle IA"
                      >
                        <HelpCircle size={14} />
                      </button>
                    </div>

                    {/* 🆕 Tooltip d'explication IA */}
                    {expandedTooltip === alert._id && (
                      <div className="alert-tooltip-content">
                        <div className="tooltip-title">💡 Pourquoi cette alerte ?</div>
                        <p>{alert.ai_explanation}</p>
                      </div>
                    )}

                    <div className="alert-recommendation">
                      <strong>📋 Recommandation :</strong> {alert.recommendation}
                    </div>

                    <div className="alert-actions">
                      {!alert.reviewed ? (
                        <>
                          <button 
                            className="btn success"
                            onClick={() => handleMarkReviewed(alert._id)}
                          >
                            <CheckCircle size={14} /> Valider
                          </button>
                          <button className="btn">⏸ Ignorer</button>
                          <button className="btn">📝 Note</button>
                        </>
                      ) : (
                        <div className="alert-status-reviewed">
                          Alerte revue et validée le {formatDt(new Date())}
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </main>
        </div>
      </div>
    </ProtectedPage>
  );
};

export default AlertesIA;