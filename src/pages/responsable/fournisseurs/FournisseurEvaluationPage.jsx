import { useEffect, useMemo, useState } from 'react';
import { Save, Star, Truck } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';

import SidebarResp from '../../../components/responsable/SidebarResp';
import HeaderPage from '../../../components/shared/HeaderPage';
import LoadingSpinner from '../../../components/shared/LoadingSpinner';
import { useToast } from '../../../components/shared/Toast';
import FournisseurDetailsHeader from '../../../components/fournisseurs/FournisseurDetailsHeader';
import FournisseurTabs from '../../../components/fournisseurs/FournisseurTabs';

import { getFournisseur, getFournisseurMetrics, updateFournisseurReliability, updateFournisseurStatus } from '../../../services/fournisseurService';
import { getSupplierEvaluation, saveSupplierEvaluation } from '../../../services/fournisseurLocalStore';
import { appendLocalAudit } from '../../../services/fournisseurAuditService';

import '../FournisseursResp.css';

function computeTotal(criteria) {
  const keys = [
    'delais',
    'qualite',
    'reactivite',
    'conformite',
    'incidents',
    'satisfaction',
  ];
  const vals = keys.map((k) => Number(criteria?.[k] ?? 0)).filter((v) => Number.isFinite(v));
  if (!vals.length) return null;
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  return Math.max(0, Math.min(100, Number(avg.toFixed(1))));
}

function reliabilityFromScore(score) {
  const v = Number(score);
  if (!Number.isFinite(v)) return 'NON_EVALUE';
  if (v >= 80) return 'FIABLE';
  if (v >= 60) return 'A_SURVEILLER';
  return 'CRITIQUE';
}

const FournisseurEvaluationPage = ({ userName, onLogout }) => {
  const toast = useToast();
  const { id } = useParams();
  const navigate = useNavigate();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => (typeof window !== 'undefined' ? window.innerWidth <= 768 : false));
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [supplier, setSupplier] = useState(null);
  const [score, setScore] = useState(null);

  const [criteria, setCriteria] = useState({
    delais: 0,
    qualite: 0,
    reactivite: 0,
    conformite: 0,
    incidents: 0,
    satisfaction: 0,
  });

  useEffect(() => {
    const sid = String(id || '').trim();
    if (!sid) return;
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const [detail, metrics] = await Promise.all([
          getFournisseur(sid),
          getFournisseurMetrics(sid).catch(() => ({ score: null })),
        ]);
        if (!alive) return;
        setSupplier(detail?.supplier || null);
        setScore(typeof metrics?.score === 'number' ? metrics.score : null);
        const stored = getSupplierEvaluation(sid);
        if (stored?.criteria) setCriteria((p) => ({ ...p, ...stored.criteria }));
      } catch (e) {
        toast.error(e.message || 'Chargement évaluation échoué');
        navigate('/responsable/fournisseurs');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [id, navigate, toast]);

  const total = useMemo(() => computeTotal(criteria), [criteria]);
  const reliability = useMemo(() => reliabilityFromScore(total), [total]);

  const set = (key) => (e) => {
    const v = Number(e.target.value);
    setCriteria((p) => ({ ...p, [key]: Number.isFinite(v) ? v : 0 }));
  };

  const toggleStatus = async () => {
    if (!supplier?._id) return;
    const isSuspended = String(supplier?.status || '').toUpperCase() === 'SUSPENDU';
    const nextStatus = isSuspended ? 'ACTIF' : 'SUSPENDU';
    // eslint-disable-next-line no-alert
    const ok = window.confirm(isSuspended ? 'Réactiver ce fournisseur ?' : 'Suspendre ce fournisseur ?');
    if (!ok) return;
    try {
      await updateFournisseurStatus(supplier._id, nextStatus);
      toast.success('Statut fournisseur mis à jour.');
      const detail = await getFournisseur(supplier._id);
      setSupplier(detail?.supplier || null);
    } catch (e) {
      toast.error(e.message || 'Changement statut échoué');
    }
  };

  const save = async () => {
    const sid = String(id || '').trim();
    if (!sid || saving) return;
    setSaving(true);
    try {
      const ev = saveSupplierEvaluation(sid, { criteria, totalScore: total });
      appendLocalAudit(sid, { action: 'EVALUATION_MAJ', comment: `Évaluation mise à jour (${Number(total || 0).toFixed(0)}/100).` });
      if (supplier?._id && reliability !== 'NON_EVALUE') {
        await updateFournisseurReliability(supplier._id, reliability, { comment: `Score évaluation: ${Number(total || 0).toFixed(0)}/100` });
      }
      toast.success('Évaluation enregistrée.');
      return ev;
    } catch (e) {
      toast.error(e.message || 'Enregistrement évaluation échoué');
    } finally {
      setSaving(false);
    }
  };

  const sid = String(supplier?._id || id || '').trim();

  return (
    <div className="resp-suppliers">
      <SidebarResp collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed((p) => !p)} onLogout={onLogout} userName={userName} />
      <div className={`resp-suppliers-main ${sidebarCollapsed ? 'collapsed' : ''}`}>
        <HeaderPage
          userName={userName}
          title="Évaluation fournisseur"
          subtitle="Fiabilité, délais, qualité, conformité"
          icon={<Star size={22} />}
          showSearch={false}
          onMenuClick={() => setSidebarCollapsed((p) => !p)}
        />
        <div className="resp-suppliers-page">
          {loading && <LoadingSpinner overlay text="Chargement évaluation..." />}
          <FournisseurDetailsHeader
            fournisseur={supplier}
            score={score}
            onEdit={() => navigate(`/responsable/fournisseurs/${sid}/modifier`)}
            onCreateOrder={() => navigate(`/responsable/commandes/nouvelle?fournisseurId=${encodeURIComponent(sid)}`)}
            onNotify={() => navigate(`/responsable/fournisseurs/${sid}`)}
            onToggleStatus={toggleStatus}
          />
          <FournisseurTabs supplierId={sid} />

          <div className="resp-card" style={{ marginTop: 14 }}>
            <div className="f360-toolbar">
              <h3 style={{ margin: 0, display: 'flex', gap: 8, alignItems: 'center' }}><Truck size={18} />Grille de notation</h3>
              <button className="f360-btn primary" type="button" onClick={save} disabled={saving || loading}>
                <Save size={16} />
                Enregistrer
              </button>
            </div>

            <div className="resp-empty" style={{ marginTop: 12 }}>
              Score global: <strong>{Number.isFinite(Number(total)) ? Number(total).toFixed(0) : '—'}/100</strong> • Niveau: <strong>{reliability}</strong>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12, marginTop: 12 }}>
              <div className="resp-mini">
                <div className="resp-mini-name">Respect des délais</div>
                <input type="range" min="0" max="100" value={criteria.delais} onChange={set('delais')} />
                <div className="f360-muted">{criteria.delais}/100</div>
              </div>
              <div className="resp-mini">
                <div className="resp-mini-name">Qualité des produits</div>
                <input type="range" min="0" max="100" value={criteria.qualite} onChange={set('qualite')} />
                <div className="f360-muted">{criteria.qualite}/100</div>
              </div>
              <div className="resp-mini">
                <div className="resp-mini-name">Réactivité</div>
                <input type="range" min="0" max="100" value={criteria.reactivite} onChange={set('reactivite')} />
                <div className="f360-muted">{criteria.reactivite}/100</div>
              </div>
              <div className="resp-mini">
                <div className="resp-mini-name">Conformité administrative</div>
                <input type="range" min="0" max="100" value={criteria.conformite} onChange={set('conformite')} />
                <div className="f360-muted">{criteria.conformite}/100</div>
              </div>
              <div className="resp-mini">
                <div className="resp-mini-name">Historique incidents</div>
                <input type="range" min="0" max="100" value={criteria.incidents} onChange={set('incidents')} />
                <div className="f360-muted">{criteria.incidents}/100</div>
              </div>
              <div className="resp-mini">
                <div className="resp-mini-name">Satisfaction interne</div>
                <input type="range" min="0" max="100" value={criteria.satisfaction} onChange={set('satisfaction')} />
                <div className="f360-muted">{criteria.satisfaction}/100</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FournisseurEvaluationPage;

