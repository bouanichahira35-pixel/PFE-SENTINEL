import { Star } from 'lucide-react';
import './fournisseurs.css';

function labelFromScore(score) {
  const v = Number(score);
  if (!Number.isFinite(v)) return { label: 'Non évalué', cls: '' };
  if (v >= 80) return { label: 'Fiable', cls: 'success' };
  if (v >= 60) return { label: 'À surveiller', cls: 'warn' };
  return { label: 'Critique', cls: 'danger' };
}

const FournisseurEvaluationPanel = ({ evaluation, onOpen }) => {
  const score = evaluation?.totalScore;
  const badge = labelFromScore(score);
  return (
    <div className="resp-card">
      <div className="f360-toolbar">
        <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Star size={18} />
          Score fournisseur
        </h3>
        <button className="f360-btn" type="button" onClick={onOpen}>Mettre à jour</button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginTop: 12 }}>
        <div style={{ fontSize: 34, fontWeight: 1000, color: '#0b4a8a' }}>
          {Number.isFinite(Number(score)) ? Number(score).toFixed(0) : '—'}
          <span className="f360-muted">/100</span>
        </div>
        <span className={`f360-badge ${badge.cls}`}>{badge.label}</span>
      </div>

      {evaluation?.updatedAt ? (
        <div className="f360-muted" style={{ marginTop: 10 }}>
          Dernière mise à jour: {new Date(evaluation.updatedAt).toLocaleString('fr-FR')}
        </div>
      ) : (
        <div className="resp-empty">Aucune évaluation enregistrée.</div>
      )}
    </div>
  );
};

export default FournisseurEvaluationPanel;

