import { useCallback, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  Bell,
  CheckCircle2,
  Flag,
  Package,
  RefreshCw,
  Sparkles,
  TrendingUp,
  User,
  X,
  ArrowLeftRight,
  Download,
  Clock,
} from 'lucide-react';
import './BeneficiairePanel.css';

function formatDate(v) {
  if (!v) return '-';
  return new Date(v).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function initials(name) {
  return String(name || '')
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('') || '?';
}

function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }

function buildChartPoints(values, w, h, padX = 14, padY = 12) {
  if (!values || values.length < 2) return { points: '', area: '' };
  const max = Math.max(...values, 1);
  const step = (w - padX * 2) / (values.length - 1);
  const coords = values.map((v, i) => ({
    x: padX + i * step,
    y: h - padY - (v / max) * (h - padY * 2),
  }));
  const points = coords.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
  const area = [
    `M ${coords[0].x.toFixed(1)} ${h - padY}`,
    ...coords.map((c) => `L ${c.x.toFixed(1)} ${c.y.toFixed(1)}`),
    `L ${coords[coords.length - 1].x.toFixed(1)} ${h - padY}`,
    'Z',
  ].join(' ');
  return { points, area, coords };
}

const TABS = [
  { id: 'profil', label: 'Profil 360°', icon: User },
  { id: 'prevision', label: 'Prévision', icon: Clock },
  { id: 'alertes', label: 'Alertes', icon: Bell },
  { id: 'comparer', label: 'Comparer', icon: ArrowLeftRight },
  { id: 'quotas', label: 'Quotas', icon: Flag },
  { id: 'ia', label: 'Assistant IA', icon: Sparkles },
];

export default function BeneficiairePanel({ beneficiaryName, allRows, allBeneficiaries, onClose, onAskIa }) {
  const [tab, setTab] = useState('profil');
  const [compareWith, setCompareWith] = useState('');
  const [quotaInput, setQuotaInput] = useState('');
  const [quotas, setQuotas] = useState({});
  const [aiLoading, setAiLoading] = useState(false);
  const [aiText, setAiText] = useState('');
  const panelRef = useRef(null);

  const myRows = useMemo(
    () => (allRows || []).filter((r) => r.beneficiary === beneficiaryName),
    [allRows, beneficiaryName],
  );

  const stats = useMemo(() => {
    const total = myRows.reduce((a, r) => a + Number(r.quantity || 0), 0);
    const byProduct = new Map();
    const byMonth = new Map();
    const byDay = new Map();
    myRows.forEach((r) => {
      const pk = r.product_name || r.product_code || '-';
      byProduct.set(pk, (byProduct.get(pk) || 0) + Number(r.quantity || 0));
      const month = r.date_exit ? String(r.date_exit).slice(0, 7) : '?';
      byMonth.set(month, (byMonth.get(month) || 0) + Number(r.quantity || 0));
      const day = r.date_exit ? String(r.date_exit).slice(0, 10) : '?';
      byDay.set(day, (byDay.get(day) || 0) + 1);
    });

    const topProducts = [...byProduct.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([name, qty]) => ({ name, qty }));

    const monthlyTrend = [...byMonth.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-12);

    const avgQty = myRows.length ? Math.round(total / myRows.length) : 0;
    const days = [...byDay.keys()].sort();
    let gaps = [];
    for (let i = 1; i < days.length; i++) {
      const diff = (new Date(days[i]) - new Date(days[i - 1])) / 86400000;
      gaps.push(diff);
    }
    const avgCycle = gaps.length ? Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length) : null;
    const lastDate = days[days.length - 1];
    const daysSinceLast = lastDate
      ? Math.round((Date.now() - new Date(lastDate)) / 86400000)
      : null;
    const nextIn = avgCycle && daysSinceLast !== null ? Math.max(0, avgCycle - daysSinceLast) : null;

    const allTotal = (allRows || []).reduce((a, r) => a + Number(r.quantity || 0), 0);
    const allAvg = allRows?.length ? allTotal / allRows.length : 1;
    const myAvg = myRows.length ? total / myRows.length : 0;
    const score = clamp(Math.round((1 - Math.abs(myAvg - allAvg) / Math.max(allAvg, 1)) * 100), 0, 100);

    const anomalies = myRows.filter((r) => Number(r.quantity || 0) > avgQty * 2.5);

    return { total, topProducts, monthlyTrend, avgQty, avgCycle, daysSinceLast, nextIn, score, anomalies, count: myRows.length };
  }, [myRows, allRows]);

  const alerts = useMemo(() => {
    const list = [];
    stats.anomalies.forEach((r) => {
      list.push({
        level: 'danger',
        msg: `Quantité anormale : ${r.quantity} unités de "${r.product_name}" (moy. ${stats.avgQty})`,
        date: r.date_exit,
      });
    });
    if (stats.nextIn !== null && stats.nextIn <= 2) {
      list.push({ level: 'warn', msg: `Prochaine demande prévue dans ${stats.nextIn} jour(s)`, date: null });
    }
    const quota = quotas[beneficiaryName];
    if (quota && stats.total >= quota * 0.8) {
      list.push({
        level: stats.total >= quota ? 'danger' : 'warn',
        msg: `Quota atteint à ${Math.round((stats.total / quota) * 100)}% (${stats.total} / ${quota})`,
        date: null,
      });
    }
    return list;
  }, [stats, quotas, beneficiaryName]);

  const compareStats = useMemo(() => {
    if (!compareWith) return null;
    const rows = (allRows || []).filter((r) => r.beneficiary === compareWith);
    const total = rows.reduce((a, r) => a + Number(r.quantity || 0), 0);
    const byProduct = new Map();
    rows.forEach((r) => {
      const pk = r.product_name || '-';
      byProduct.set(pk, (byProduct.get(pk) || 0) + Number(r.quantity || 0));
    });
    const topProducts = [...byProduct.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, qty]) => ({ name, qty }));
    return { name: compareWith, total, count: rows.length, topProducts };
  }, [compareWith, allRows]);

  const askAi = useCallback(async () => {
    setAiLoading(true);
    setAiText('');
    try {
      const summary = {
        name: beneficiaryName,
        total: stats.total,
        count: stats.count,
        avgQty: stats.avgQty,
        avgCycle: stats.avgCycle,
        topProducts: stats.topProducts.slice(0, 3).map((p) => p.name),
        anomaliesCount: stats.anomalies.length,
        score: stats.score,
      };
      const prompt = `Tu es un assistant de gestion de stock. Voici les données de consommation du bénéficiaire "${beneficiaryName}": ${JSON.stringify(summary)}. Génère un commentaire d'analyse en 3-4 phrases en français : tendances, anomalies éventuelles, et une recommandation concrète pour le responsable. Sois précis et utile.`;

      const res = await fetch('/api/ai/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });
      if (!res.ok) throw new Error('Erreur IA');
      const data = await res.json();
      setAiText(data.text || data.message || 'Analyse générée.');
    } catch {
      setAiText(
        `${beneficiaryName} a effectué ${stats.count} sorties pour un total de ${stats.total} articles. ` +
        `${stats.anomalies.length > 0 ? `${stats.anomalies.length} sortie(s) anormale(s) détectée(s). ` : ''}` +
        `Son cycle moyen est de ${stats.avgCycle ?? '?'} jours. ` +
        `Score de régularité : ${stats.score}/100. ` +
        `Produit le plus consommé : ${stats.topProducts[0]?.name || '-'} (${stats.topProducts[0]?.qty || 0} unités).`,
      );
    } finally {
      setAiLoading(false);
    }
  }, [beneficiaryName, stats]);

  function exportCsv() {
    const hdr = 'Date,Produit,Catégorie,Famille,Quantité,Unité,Motif,Statut';
    const lines = myRows.map((r) =>
      [formatDate(r.date_exit), r.product_name, r.product_category, r.product_family, r.quantity, r.unit, r.motif || ''].map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','),
    );
    const blob = new Blob([[hdr, ...lines].join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `consommation_${beneficiaryName.replace(/\s+/g, '_')}.csv`;
    a.click();
  }

  const chartData = stats.monthlyTrend.map(([, qty]) => qty);
  const chartLabels = stats.monthlyTrend.map(([m]) => m.slice(5));
  const { points, area } = buildChartPoints(chartData, 380, 100);

  const otherBenefs = useMemo(
    () => [...new Set((allRows || []).map((r) => r.beneficiary))].filter((b) => b !== beneficiaryName).sort(),
    [allRows, beneficiaryName],
  );

  return (
    <aside className="bp-panel" ref={panelRef} aria-label={`Profil de ${beneficiaryName}`}>
      <div className="bp-header">
        <div className="bp-identity">
          <div className="bp-avatar">{initials(beneficiaryName)}</div>
          <div className="bp-identity-text">
            <strong className="bp-name">{beneficiaryName}</strong>
            <span className="bp-meta">{stats.count} sortie{stats.count !== 1 ? 's' : ''} · {stats.total} article{stats.total !== 1 ? 's' : ''}</span>
          </div>
          <div className="bp-score-ring" title={`Score de régularité : ${stats.score}/100`}>
            <svg viewBox="0 0 36 36" width="42" height="42">
              <circle cx="18" cy="18" r="15" fill="none" stroke="var(--color-border-tertiary)" strokeWidth="3" />
              <circle
                cx="18" cy="18" r="15"
                fill="none"
                stroke={stats.score >= 70 ? '#14b8a6' : stats.score >= 40 ? '#f59e0b' : '#ef4444'}
                strokeWidth="3"
                strokeDasharray={`${Math.round(stats.score * 0.942)} 94.2`}
                strokeLinecap="round"
                transform="rotate(-90 18 18)"
              />
              <text x="18" y="22" textAnchor="middle" fontSize="9" fill="var(--color-text-primary)" fontWeight="500">{stats.score}</text>
            </svg>
          </div>
        </div>
        <div className="bp-header-actions">
          <button className="bp-icon-btn" onClick={exportCsv} title="Exporter CSV">
            <Download size={15} />
          </button>
          <button className="bp-icon-btn" onClick={onClose} aria-label="Fermer le panneau">
            <X size={15} />
          </button>
        </div>
      </div>

      {alerts.length > 0 && (
        <div className="bp-alert-banner">
          <AlertTriangle size={13} />
          <span>{alerts.length} alerte{alerts.length > 1 ? 's' : ''} active{alerts.length > 1 ? 's' : ''} — voir onglet Alertes</span>
        </div>
      )}

      <nav className="bp-tabs" aria-label="Sections du profil">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            className={`bp-tab ${tab === id ? 'active' : ''}`}
            onClick={() => setTab(id)}
          >
            <Icon size={13} />
            <span>{label}</span>
            {id === 'alertes' && alerts.length > 0 && (
              <span className="bp-tab-badge">{alerts.length}</span>
            )}
          </button>
        ))}
      </nav>

      <div className="bp-body">

        {tab === 'profil' && (
          <div className="bp-section">
            <div className="bp-kpis">
              {[
                { label: 'Sorties', value: stats.count, icon: BarChart3 },
                { label: 'Total qté', value: stats.total, icon: Package },
                { label: 'Moy./sortie', value: stats.avgQty, icon: TrendingUp },
                { label: 'Cycle (j)', value: stats.avgCycle ?? '-', icon: Clock },
              ].map(({ label, value, icon: Icon }) => (
                <div key={label} className="bp-kpi">
                  <Icon size={13} className="bp-kpi-icon" />
                  <span className="bp-kpi-val">{value}</span>
                  <span className="bp-kpi-lbl">{label}</span>
                </div>
              ))}
            </div>

            {chartData.length >= 2 && (
              <div className="bp-chart-card">
                <div className="bp-chart-title"><TrendingUp size={13} /> Évolution mensuelle</div>
                <svg viewBox="0 0 380 100" className="bp-svg" preserveAspectRatio="none" role="img" aria-label="Courbe d'évolution mensuelle">
                  <path d={area} fill="rgba(20,184,166,0.10)" />
                  <polyline points={points} fill="none" stroke="#14b8a6" strokeWidth="2" />
                </svg>
                <div className="bp-chart-labels" style={{ gridTemplateColumns: `repeat(${chartLabels.length}, 1fr)` }}>
                  {chartLabels.map((l) => <span key={l}>{l}</span>)}
                </div>
              </div>
            )}

            <div className="bp-subsection-title">Top produits consommés</div>
            <div className="bp-bars">
              {stats.topProducts.map((p) => {
                const max = stats.topProducts[0]?.qty || 1;
                return (
                  <div key={p.name} className="bp-bar-row">
                    <span className="bp-bar-lbl" title={p.name}>{p.name}</span>
                    <span className="bp-bar-track">
                      <span className="bp-bar-fill" style={{ width: `${Math.round((p.qty / max) * 100)}%` }} />
                    </span>
                    <span className="bp-bar-val">{p.qty}</span>
                  </div>
                );
              })}
              {!stats.topProducts.length && <div className="bp-empty">Aucune donnée.</div>}
            </div>
          </div>
        )}

        {tab === 'prevision' && (
          <div className="bp-section">
            <div className="bp-forecast-card">
              <Clock size={20} className="bp-forecast-icon" />
              <div className="bp-forecast-body">
                <div className="bp-forecast-label">Prochaine demande estimée</div>
                <div className="bp-forecast-value">
                  {stats.nextIn !== null
                    ? stats.nextIn === 0 ? "Aujourd'hui" : `Dans ${stats.nextIn} jour${stats.nextIn > 1 ? 's' : ''}`
                    : 'Données insuffisantes'}
                </div>
                {stats.avgCycle && (
                  <div className="bp-forecast-sub">Cycle moyen : {stats.avgCycle} jours · Dernière sortie il y a {stats.daysSinceLast} jour{stats.daysSinceLast !== 1 ? 's' : ''}</div>
                )}
              </div>
            </div>

            <div className="bp-forecast-card">
              <Package size={20} className="bp-forecast-icon" />
              <div className="bp-forecast-body">
                <div className="bp-forecast-label">Produit le plus probable</div>
                <div className="bp-forecast-value">{stats.topProducts[0]?.name || '-'}</div>
                <div className="bp-forecast-sub">{stats.topProducts[0]?.qty || 0} unités sur la période</div>
              </div>
            </div>

            <div className="bp-subsection-title">Fréquence par produit</div>
            <div className="bp-bars">
              {stats.topProducts.map((p) => {
                const pRows = myRows.filter((r) => r.product_name === p.name);
                const freq = pRows.length;
                return (
                  <div key={p.name} className="bp-bar-row">
                    <span className="bp-bar-lbl" title={p.name}>{p.name}</span>
                    <span className="bp-bar-track">
                      <span className="bp-bar-fill" style={{ width: `${Math.round((freq / Math.max(myRows.length, 1)) * 100)}%`, background: '#8b5cf6' }} />
                    </span>
                    <span className="bp-bar-val">{freq}×</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {tab === 'alertes' && (
          <div className="bp-section">
            {alerts.length === 0 ? (
              <div className="bp-ok-state">
                <CheckCircle2 size={28} />
                <span>Aucune alerte active pour ce bénéficiaire.</span>
              </div>
            ) : (
              <div className="bp-alert-list">
                {alerts.map((a, i) => (
                  <div key={i} className={`bp-alert-item ${a.level}`}>
                    <AlertTriangle size={14} />
                    <div className="bp-alert-content">
                      <div className="bp-alert-msg">{a.msg}</div>
                      {a.date && <div className="bp-alert-date">{formatDate(a.date)}</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="bp-subsection-title" style={{ marginTop: 16 }}>Historique des anomalies</div>
            {stats.anomalies.length === 0 ? (
              <div className="bp-empty">Aucune anomalie détectée.</div>
            ) : (
              <div className="bp-anomaly-list">
                {stats.anomalies.map((r, i) => (
                  <div key={i} className="bp-anomaly-row">
                    <span className="bp-anomaly-date">{formatDate(r.date_exit)}</span>
                    <span className="bp-anomaly-prod">{r.product_name}</span>
                    <span className="bp-anomaly-qty">{r.quantity} unités</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'comparer' && (
          <div className="bp-section">
            <div className="bp-compare-select">
              <label className="bp-label">Comparer avec</label>
              <select value={compareWith} onChange={(e) => setCompareWith(e.target.value)} className="bp-select">
                <option value="">Sélectionner un bénéficiaire...</option>
                {otherBenefs.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>

            {compareWith && compareStats ? (
              <>
                <div className="bp-compare-grid">
                  {[
                    { label: 'Sorties', a: stats.count, b: compareStats.count },
                    { label: 'Qté totale', a: stats.total, b: compareStats.total },
                    { label: 'Moy./sortie', a: stats.avgQty, b: Math.round(compareStats.total / Math.max(compareStats.count, 1)) },
                  ].map(({ label, a, b }) => (
                    <div key={label} className="bp-compare-row">
                      <span className="bp-compare-lbl">{label}</span>
                      <div className="bp-compare-bars">
                        <div className="bp-compare-item">
                          <span className="bp-compare-name">{beneficiaryName.split(' ')[0]}</span>
                          <div className="bp-bar-track" style={{ flex: 1 }}>
                            <div className="bp-bar-fill" style={{ width: `${Math.round((a / Math.max(a, b, 1)) * 100)}%`, background: '#14b8a6' }} />
                          </div>
                          <span className="bp-compare-val">{a}</span>
                        </div>
                        <div className="bp-compare-item">
                          <span className="bp-compare-name">{compareStats.name.split(' ')[0]}</span>
                          <div className="bp-bar-track" style={{ flex: 1 }}>
                            <div className="bp-bar-fill" style={{ width: `${Math.round((b / Math.max(a, b, 1)) * 100)}%`, background: '#3b82f6' }} />
                          </div>
                          <span className="bp-compare-val">{b}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="bp-subsection-title">Produits communs vs exclusifs</div>
                <div className="bp-shared-prods">
                  {stats.topProducts.slice(0, 5).map((p) => {
                    const inOther = compareStats.topProducts.some((x) => x.name === p.name);
                    return (
                      <div key={p.name} className={`bp-shared-row ${inOther ? 'shared' : 'exclusive'}`}>
                        <Package size={12} />
                        <span>{p.name}</span>
                        <span className="bp-shared-badge">{inOther ? 'Commun' : 'Exclusif'}</span>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="bp-empty">Sélectionnez un bénéficiaire pour comparer.</div>
            )}
          </div>
        )}

        {tab === 'quotas' && (
          <div className="bp-section">
            <div className="bp-quota-current">
              <div className="bp-quota-label">Consommation actuelle</div>
              <div className="bp-quota-value">{stats.total} unités</div>
              {quotas[beneficiaryName] && (
                <>
                  <div className="bp-bar-track" style={{ marginTop: 8 }}>
                    <div
                      className="bp-bar-fill"
                      style={{
                        width: `${clamp(Math.round((stats.total / quotas[beneficiaryName]) * 100), 0, 100)}%`,
                        background: stats.total >= quotas[beneficiaryName] ? '#ef4444' : stats.total >= quotas[beneficiaryName] * 0.8 ? '#f59e0b' : '#14b8a6',
                      }}
                    />
                  </div>
                  <div className="bp-quota-pct">
                    {Math.round((stats.total / quotas[beneficiaryName]) * 100)}% du quota ({quotas[beneficiaryName]} unités max)
                  </div>
                </>
              )}
            </div>

            <div className="bp-quota-form">
              <label className="bp-label">Définir un quota mensuel</label>
              <div className="bp-quota-input-row">
                <input
                  type="number"
                  min="1"
                  placeholder="Ex : 100"
                  value={quotaInput}
                  onChange={(e) => setQuotaInput(e.target.value)}
                  className="bp-input"
                />
                <button
                  className="bp-btn-primary"
                  type="button"
                  onClick={() => {
                    const v = parseInt(quotaInput, 10);
                    if (!v || v < 1) return;
                    setQuotas((prev) => ({ ...prev, [beneficiaryName]: v }));
                    setQuotaInput('');
                  }}
                >
                  Appliquer
                </button>
                {quotas[beneficiaryName] && (
                  <button
                    className="bp-btn-danger"
                    type="button"
                    onClick={() => setQuotas((prev) => { const n = { ...prev }; delete n[beneficiaryName]; return n; })}
                  >
                    Supprimer
                  </button>
                )}
              </div>
            </div>

            <div className="bp-subsection-title">Top produits à surveiller</div>
            <div className="bp-bars">
              {stats.topProducts.map((p) => (
                <div key={p.name} className="bp-bar-row">
                  <span className="bp-bar-lbl" title={p.name}>{p.name}</span>
                  <span className="bp-bar-track">
                    <span className="bp-bar-fill" style={{ width: `${Math.round((p.qty / (stats.total || 1)) * 100)}%`, background: '#f59e0b' }} />
                  </span>
                  <span className="bp-bar-val">{Math.round((p.qty / (stats.total || 1)) * 100)}%</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 'ia' && (
          <div className="bp-section">
            <div className="bp-ia-intro">
              <Sparkles size={16} />
              <span>L'IA analyse le profil complet de {beneficiaryName} et génère un commentaire personnalisé.</span>
            </div>

            <button
              className="bp-btn-primary"
              type="button"
              onClick={askAi}
              disabled={aiLoading}
              style={{ width: '100%', justifyContent: 'center', gap: 8 }}
            >
              {aiLoading ? <RefreshCw size={14} className="bp-spin" /> : <Sparkles size={14} />}
              {aiLoading ? 'Analyse en cours...' : 'Analyser avec l\'IA'}
            </button>

            {aiText && (
              <div className="bp-ia-result">
                <div className="bp-ia-result-head">
                  <Sparkles size={13} /> Analyse IA
                </div>
                <p className="bp-ia-text">{aiText}</p>
                <div className="bp-ia-tags">
                  {stats.anomalies.length > 0 && <span className="bp-ia-tag danger">{stats.anomalies.length} anomalie{stats.anomalies.length > 1 ? 's' : ''}</span>}
                  {stats.score >= 70 && <span className="bp-ia-tag ok">Régulier</span>}
                  {stats.avgCycle && <span className="bp-ia-tag info">Cycle {stats.avgCycle}j</span>}
                </div>
              </div>
            )}

            <div className="bp-subsection-title" style={{ marginTop: 16 }}>Données utilisées</div>
            <div className="bp-ia-data">
              {[
                ['Sorties totales', stats.count],
                ['Quantité totale', stats.total],
                ['Moy. par sortie', stats.avgQty],
                ['Cycle moyen', stats.avgCycle ? stats.avgCycle + ' jours' : '-'],
                ['Score régularité', stats.score + '/100'],
                ['Anomalies', stats.anomalies.length],
              ].map(([k, v]) => (
                <div key={k} className="bp-ia-kv">
                  <span>{k}</span>
                  <strong>{v}</strong>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </aside>
  );
}
