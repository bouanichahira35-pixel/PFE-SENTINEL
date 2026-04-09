import { useCallback, useEffect, useMemo, useState } from 'react';
import { ClipboardCheck, Plus, Save, XCircle, CheckCircle2, Info } from 'lucide-react';
import SidebarMag from '../../components/magasinier/SidebarMag';
import HeaderPage from '../../components/shared/HeaderPage';
import LoadingSpinner from '../../components/shared/LoadingSpinner';
import { useToast } from '../../components/shared/Toast';
import { get, post } from '../../services/api';
import './InventaireMag.css';

function formatDt(value) {
  if (!value) return '-';
  try {
    return new Date(value).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch {
    return '-';
  }
}

const InventaireMag = ({ userName, onLogout }) => {
  const toast = useToast();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => (typeof window !== 'undefined' ? window.innerWidth <= 768 : false));
  const [isLoading, setIsLoading] = useState(false);
  const [sessions, setSessions] = useState([]);
  const [activeSessionId, setActiveSessionId] = useState('');
  const [activeSession, setActiveSession] = useState(null);
  const [lines, setLines] = useState([]);
  const [summary, setSummary] = useState(null);
  const [showHelp, setShowHelp] = useState(false);

  const [createTitle, setCreateTitle] = useState('');
  const [productQuery, setProductQuery] = useState('');
  const [products, setProducts] = useState([]);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [countQty, setCountQty] = useState('0');
  const [countNote, setCountNote] = useState('');

  const loadSessions = useCallback(async () => {
    setIsLoading(true);
    try {
      const payload = await get('/inventory/sessions?mine=1');
      setSessions(Array.isArray(payload?.sessions) ? payload.sessions : []);
    } catch (err) {
      toast.error(err.message || 'Erreur chargement inventaires');
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  const loadSession = useCallback(async (id) => {
    if (!id) return;
    setIsLoading(true);
    try {
      const payload = await get(`/inventory/sessions/${id}`);
      setActiveSession(payload?.session || null);
      setLines(Array.isArray(payload?.lines) ? payload.lines : []);
      setSummary(payload?.summary || null);
    } catch (err) {
      toast.error(err.message || 'Erreur chargement session');
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  const loadProducts = useCallback(async () => {
    try {
      const items = await get('/products');
      const approved = (items || [])
        .map((p) => ({ id: p._id, name: p.name || 'Produit', code: p.code_product || '-', stock: Number(p.quantity_current || 0) }))
        .sort((a, b) => String(a.name).localeCompare(String(b.name)));
      setProducts(approved);
    } catch {
      setProducts([]);
    }
  }, []);

  useEffect(() => {
    loadSessions();
    loadProducts();
  }, [loadSessions, loadProducts]);

  useEffect(() => {
    if (!activeSessionId) return;
    loadSession(activeSessionId);
  }, [activeSessionId, loadSession]);

  const filteredProducts = useMemo(() => {
    const q = String(productQuery || '').trim().toLowerCase();
    if (!q) return products.slice(0, 80);
    return products.filter((p) => String(p.name).toLowerCase().includes(q) || String(p.code).toLowerCase().includes(q)).slice(0, 80);
  }, [productQuery, products]);

  const createSession = async () => {
    const title = String(createTitle || '').trim();
    if (!title) {
      toast.error('Titre obligatoire');
      return;
    }
    setIsLoading(true);
    try {
      const r = await post('/inventory/sessions', { title });
      toast.success('Session inventaire creee');
      setCreateTitle('');
      await loadSessions();
      const id = r?.session?._id || r?.session?.id || '';
      if (id) setActiveSessionId(String(id));
    } catch (err) {
      toast.error(err.message || 'Erreur creation session');
    } finally {
      setIsLoading(false);
    }
  };

  const saveCount = async () => {
    if (!activeSessionId) {
      toast.error('Selectionnez une session');
      return;
    }
    if (!selectedProductId) {
      toast.error('Choisissez un produit');
      return;
    }
    const qty = Number(countQty);
    if (!Number.isFinite(qty) || qty < 0) {
      toast.error('Quantite invalide');
      return;
    }
    setIsLoading(true);
    try {
      await post(`/inventory/sessions/${activeSessionId}/count`, {
        product_id: selectedProductId,
        counted_quantity: Math.floor(qty),
        note: countNote,
      });
      toast.success('Comptage enregistre');
      setCountNote('');
      setCountQty('0');
      await loadSession(activeSessionId);
    } catch (err) {
      toast.error(err.message || 'Erreur comptage');
    } finally {
      setIsLoading(false);
    }
  };

  const closeSession = async () => {
    if (!activeSessionId) return;
    const confirmed = window.confirm('Cloturer la session ? Apres cloture, le comptage devient non modifiable.');
    if (!confirmed) return;
    setIsLoading(true);
    try {
      await post(`/inventory/sessions/${activeSessionId}/close`, {});
      toast.success('Session cloturee');
      await loadSession(activeSessionId);
      await loadSessions();
    } catch (err) {
      toast.error(err.message || 'Erreur cloture');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="app-layout">
      <div className={`sidebar-backdrop ${sidebarCollapsed ? 'hidden' : ''}`} onClick={() => setSidebarCollapsed(true)} />
      <SidebarMag collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} onLogout={onLogout} userName={userName} />

      <div className="main-container">
        <HeaderPage
          userName={userName}
          title="Inventaire"
          showSearch={false}
          onMenuClick={() => setSidebarCollapsed((prev) => !prev)}
        />

        <main className="main-content">
          {isLoading && <LoadingSpinner overlay text="Chargement..." />}

          <section className="inv-help-card">
            <div className="inv-help-head">
              <div className="inv-help-title">
                <Info size={16} />
                <span>Aide inventaire</span>
              </div>
              <button className="inv-help-toggle" type="button" onClick={() => setShowHelp((p) => !p)}>
                {showHelp ? 'Masquer' : 'Afficher'}
              </button>
            </div>
            {showHelp && (
              <div className="inv-help-body">
                <div className="inv-help-block">
                  <strong>Objectif</strong>
                  <p>Comparer le stock système au stock réel pour corriger les écarts.</p>
                </div>
                <div className="inv-help-block">
                  <strong>Types d’inventaire</strong>
                  <ul>
                    <li><strong>Annuel</strong> : comptage global à une date fixe (souvent fin d’exercice).</li>
                    <li><strong>Tournant</strong> : comptage régulier par lots de références (sans arrêter l’activité).</li>
                  </ul>
                </div>
                <div className="inv-help-block">
                  <strong>Étapes terrain (magasinier)</strong>
                  <ol>
                    <li>Créer une session, puis sélectionner un produit.</li>
                    <li>Compter la quantité réelle et l’enregistrer.</li>
                    <li>Clôturer la session une fois le comptage terminé.</li>
                  </ol>
                </div>
                <div className="inv-help-block">
                  <strong>Calcul d’écart</strong>
                  <p><code>Écart = Quantité comptée − Quantité système</code></p>
                </div>
              </div>
            )}
          </section>

          <div className="inv-mag-grid">
            <section className="inv-card">
              <div className="inv-head">
                <h3><ClipboardCheck size={18} /> Sessions</h3>
                <button className="inv-btn" type="button" onClick={loadSessions} disabled={isLoading}>Actualiser</button>
              </div>

              <div className="inv-create">
                <input value={createTitle} onChange={(e) => setCreateTitle(e.target.value)} placeholder="Titre session (ex: Inventaire fin 2026)" />
                <button className="inv-btn primary" type="button" onClick={createSession} disabled={isLoading}><Plus size={16} /> Creer</button>
              </div>

              <div className="inv-list">
                {sessions.map((s) => (
                  <button
                    key={s._id}
                    type="button"
                    className={`inv-session ${String(activeSessionId) === String(s._id) ? 'active' : ''}`}
                    onClick={() => setActiveSessionId(String(s._id))}
                  >
                    <div className="inv-session-title">
                      <strong>{s.reference}</strong>
                      <span className={`inv-pill ${String(s.status)}`}>{s.status}</span>
                    </div>
                    <div className="inv-session-sub">{s.title}</div>
                    <div className="inv-session-meta">Cree: {formatDt(s.createdAt || s.created_at)}</div>
                  </button>
                ))}
                {!sessions.length && <div className="inv-empty">Aucune session.</div>}
              </div>
            </section>

            <section className="inv-card">
              <div className="inv-head">
                <h3>Comptage</h3>
                {activeSession?.reference ? <div className="inv-ref">Session: <strong>{activeSession.reference}</strong></div> : null}
              </div>

              {!activeSession ? (
                <div className="inv-empty">Selectionnez une session a gauche.</div>
              ) : (
                <>
                  <div className="inv-banner">
                    <div>Statut: <strong>{activeSession.status}</strong></div>
                    <div>Cree par: <strong>{activeSession.created_by?.username || '-'}</strong></div>
                    {activeSession.closed_at ? <div>Cloture: <strong>{formatDt(activeSession.closed_at)}</strong></div> : null}
                  </div>

                  {activeSession.status !== 'counting' ? (
                    <div className="inv-empty">
                      Cette session est cloturee. Le responsable peut appliquer les ajustements.
                    </div>
                  ) : (
                    <>
                      <div className="inv-form">
                        <div className="inv-row">
                          <input
                            value={productQuery}
                            onChange={(e) => setProductQuery(e.target.value)}
                            placeholder="Rechercher produit (nom ou code)..."
                          />
                        </div>
                        <div className="inv-row">
                          <select value={selectedProductId} onChange={(e) => setSelectedProductId(e.target.value)}>
                            <option value="">Choisir un produit</option>
                            {filteredProducts.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name} ({p.code}) — stock: {p.stock}
                              </option>
                            ))}
                          </select>
                          <input type="number" min="0" value={countQty} onChange={(e) => setCountQty(e.target.value)} />
                        </div>
                        <div className="inv-row">
                          <textarea value={countNote} onChange={(e) => setCountNote(e.target.value)} placeholder="Note (optionnel)..." rows={2} />
                        </div>
                        <div className="inv-actions">
                          <button className="inv-btn primary" type="button" onClick={saveCount} disabled={isLoading}><Save size={16} /> Enregistrer</button>
                          <button className="inv-btn" type="button" onClick={closeSession} disabled={isLoading}><CheckCircle2 size={16} /> Cloturer</button>
                        </div>
                      </div>
                    </>
                  )}

                  <div className="inv-subhead">
                    <strong>Lignes comptées</strong>
                    {summary ? (
                      <span className="inv-mini">
                        OK: {summary.ok} | Surplus: {summary.surplus} | Manquants: {summary.missing}
                      </span>
                    ) : null}
                  </div>

                  <div className="inv-lines">
                    {lines.map((l) => (
                      <div key={l._id} className="inv-line">
                        <div className="inv-line-main">
                          <strong>{l.product?.name || 'Produit'}</strong>
                          <span className="inv-code">{l.product?.code_product || '-'}</span>
                        </div>
                        <div className="inv-line-kv">
                          <span>Systeme: <strong>{l.system_quantity_at_count}</strong></span>
                          <span>Compte: <strong>{l.counted_quantity}</strong></span>
                          <span className={`inv-delta ${l.delta > 0 ? 'pos' : l.delta < 0 ? 'neg' : 'zero'}`}>
                            {l.delta > 0 ? <CheckCircle2 size={14} /> : l.delta < 0 ? <XCircle size={14} /> : <CheckCircle2 size={14} />}
                            Ecart: <strong>{l.delta}</strong>
                          </span>
                        </div>
                      </div>
                    ))}
                    {!lines.length && <div className="inv-empty">Aucune ligne.</div>}
                  </div>
                </>
              )}
            </section>
          </div>
        </main>
      </div>
    </div>
  );
};

export default InventaireMag;
