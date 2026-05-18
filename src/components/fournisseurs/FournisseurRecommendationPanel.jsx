import { useMemo, useState } from 'react';
import { Brain, ShoppingCart } from 'lucide-react';
import { recommendFournisseurs } from '../../services/fournisseurRecommendationService';
import './fournisseurs.css';

const FournisseurRecommendationPanel = ({ products, onCreateCommande }) => {
  const productItems = Array.isArray(products) ? products : [];
  const [productId, setProductId] = useState('');
  const [qty, setQty] = useState(10);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const recommended = result?.recommended || null;
  const candidates = Array.isArray(result?.candidates) ? result.candidates : [];

  const canCreate = useMemo(() => Boolean(recommended && productId && Number(qty) > 0), [recommended, productId, qty]);

  const analyse = async () => {
    const pid = String(productId || '').trim();
    if (!pid) return;
    setLoading(true);
    setError('');
    try {
      const data = await recommendFournisseurs({ productId: pid, quantity: qty });
      setResult(data || null);
    } catch (e) {
      setError(e.message || 'Analyse échouée');
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="resp-card">
      <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
        <Brain size={18} />
        Recommandation fournisseur (IA)
      </h3>
      <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 0.6fr auto', gap: 10, marginTop: 12, alignItems: 'center' }}>
        <select value={productId} onChange={(e) => setProductId(e.target.value)}>
          <option value="">Choisir un produit...</option>
          {productItems.slice(0, 200).map((p) => (
            <option key={String(p?._id || p?.id)} value={String(p?._id || p?.id)}>
              {p?.name || p?.nom || 'Produit'}{p?.code_product ? ` (${p.code_product})` : ''}
            </option>
          ))}
        </select>
        <input type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)} />
        <button className="f360-btn primary" type="button" onClick={analyse} disabled={loading || !productId}>
          {loading ? 'Analyse...' : 'Analyser'}
        </button>
      </div>
      {error ? <div className="resp-empty" style={{ borderStyle: 'solid', borderColor: 'rgba(239, 68, 68, 0.25)', background: '#fef2f2', color: '#991b1b' }}>{error}</div> : null}

      {recommended ? (
        <div style={{ marginTop: 12 }}>
          <div className="risk-item" style={{ alignItems: 'flex-start' }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                <div style={{ fontWeight: 1000, color: '#0f172a' }}>Recommandé: {recommended.supplier_name || 'Fournisseur'}</div>
                <span className="pill faible">Score {Number(recommended.score || 0).toFixed(1)} / 100</span>
                <span className="pill">Délai: {recommended.lead_time_days ?? '-'}j</span>
                {recommended.is_primary ? <span className="pill faible">Principal</span> : null}
              </div>
              {Array.isArray(recommended.reasons) && recommended.reasons.length ? (
                <div className="risk-meta">Raisons: {recommended.reasons.slice(0, 4).join(' • ')}</div>
              ) : null}
            </div>
            <div className="f360-actions">
              <button
                className="f360-btn success"
                type="button"
                onClick={() => onCreateCommande?.({ supplierId: recommended.supplier_id, productId, quantity: qty, source: 'recommandation' })}
                disabled={!canCreate}
              >
                <ShoppingCart size={16} />
                Créer commande
              </button>
            </div>
          </div>

          {candidates.length > 1 ? (
            <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
              {candidates.slice(0, 3).map((c) => (
                <div key={String(c.supplier_id)} className="resp-mini">
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                    <div style={{ fontWeight: 950, color: '#0f172a' }}>{c.supplier_name}</div>
                    <div style={{ fontWeight: 950, color: '#0b4a8a' }}>{Number(c.score || 0).toFixed(1)}</div>
                  </div>
                  <div className="f360-muted" style={{ marginTop: 6 }}>{Array.isArray(c.reasons) ? c.reasons.slice(0, 2).join(' • ') : ''}</div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};

export default FournisseurRecommendationPanel;

