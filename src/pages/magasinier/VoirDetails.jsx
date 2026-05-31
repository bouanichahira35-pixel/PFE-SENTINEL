import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Package, ArrowLeft, Tag, Layers, Hash, AlertTriangle,
  Paperclip, ArrowDownToLine, ArrowUpFromLine, CheckCircle,
  Calendar, MapPin, FileText, ExternalLink, TrendingUp, TrendingDown,
} from 'lucide-react';
import SidebarMag from '../../components/magasinier/SidebarMag';
import HeaderPage from '../../components/shared/HeaderPage';
import { useToast } from '../../components/shared/Toast';
import { get } from '../../services/api';
import './VoirDetails.css';

const VoirDetails = ({ userName, onLogout }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const toast    = useToast();

  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => (typeof window !== 'undefined' ? window.innerWidth <= 768 : false)
  );
  const [attachments, setAttachments] = useState([]);
  const [isLoadingAttachments, setIsLoadingAttachments] = useState(true);

  const product = location.state?.product || {
    id: null,
    code: 'PRD-001',
    nom: 'Cable HDMI 2m',
    categorie: 'Informatique',
    quantite: 150,
    seuil: 20,
    unite: 'Unite',
    description: 'Cable HDMI haute qualite 2 metres',
  };

  /* ── Chargement pièces jointes (inchangé) ── */
  useEffect(() => {
    let ignore = false;
    const loadAttachments = async () => {
      setIsLoadingAttachments(true);
      try {
        const [entries, exits] = await Promise.all([
          get('/stock/entries'),
          get('/stock/exits'),
        ]);
        if (ignore) return;
        const productId = product.id || product._id;
        const byProduct = (row) => {
          const rowProductId = row.product?._id || row.product;
          return productId
            ? String(rowProductId) === String(productId)
            : row.product?.code_product === product.code;
        };
        const docs = [];
        entries.filter(byProduct).forEach((e) => {
          (e.attachments || []).forEach((a) => {
            docs.push({ type: 'Entrée', icon: 'entry', label: a.label || 'Pièce entrée',
              file_name: a.file_name, file_url: a.file_url, date: e.date_entry || e.createdAt });
          });
        });
        exits.filter(byProduct).forEach((x) => {
          (x.attachments || []).forEach((a) => {
            docs.push({ type: 'Sortie', icon: 'exit', label: a.label || 'Pièce sortie',
              file_name: a.file_name, file_url: a.file_url, date: x.date_exit || x.createdAt });
          });
        });
        setAttachments(docs.sort((a, b) => new Date(b.date) - new Date(a.date)));
      } catch (err) {
        if (!ignore) toast.error(err.message || 'Chargement des pièces échoué');
      } finally {
        if (!ignore) setIsLoadingAttachments(false);
      }
    };
    loadAttachments();
    return () => { ignore = true; };
  }, [product.id, product._id, product.code, toast]);

  /* ── État stock ── */
  const stockState = useMemo(() => {
    if (product.quantite === 0)
      return { label: 'Rupture de stock',       cls: 'rupture', icon: AlertTriangle, color: '#dc2626' };
    if (product.quantite <= product.seuil)
      return { label: 'Sous le seuil minimum',  cls: 'warning', icon: AlertTriangle, color: '#d97706' };
    return   { label: 'Stock disponible',        cls: 'ok',      icon: CheckCircle,  color: '#059669' };
  }, [product.quantite, product.seuil]);

  const StockIcon = stockState.icon;

  const stockPct = useMemo(() => {
    if (!product.seuil || product.seuil === 0) return 100;
    return Math.min(100, Math.round((product.quantite / (product.seuil * 3)) * 100));
  }, [product.quantite, product.seuil]);

  /* ════════════════════════════════════════════════════════
     RENDU
  ════════════════════════════════════════════════════════ */
  return (
    <div className="app-layout">
      <div className={`sidebar-backdrop ${sidebarCollapsed ? 'hidden' : ''}`} onClick={() => setSidebarCollapsed(true)} />
      <SidebarMag collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} onLogout={onLogout} userName={userName} />

      <div className="main-container">
        <HeaderPage userName={userName} title="Détails du produit" showSearch={false}
          onMenuClick={() => setSidebarCollapsed(prev => !prev)} />

        <main className="main-content vd-main">
          <div className="vd-page">

            {/* ── Bouton retour ── */}
            <button className="vd-back-btn" onClick={() => navigate('/magasinier')}>
              <ArrowLeft size={16} /> Retour à la liste
            </button>

            <div className="vd-layout">

              {/* ══ COLONNE GAUCHE ══ */}
              <div className="vd-col-left">

                {/* En-tête produit */}
                <div className="vd-header">
                  <div className="vd-header-icon">
                    <Package size={28} />
                  </div>
                  <div className="vd-header-info">
                    <h2>{product.nom}</h2>
                    <span className="vd-code">{product.code}</span>
                    <div className={`vd-status-badge ${stockState.cls}`}>
                      <StockIcon size={12} />
                      {stockState.label}
                    </div>
                  </div>
                </div>

                {/* Jauge de stock visuelle */}
                <div className="vd-stock-gauge">
                  <div className="vd-stock-gauge-header">
                    <span className="vd-gauge-label">Niveau de stock</span>
                    <span className="vd-gauge-val" style={{ color: stockState.color }}>
                      {product.quantite} / {product.seuil * 3} {product.unite}
                    </span>
                  </div>
                  <div className="vd-gauge-bar">
                    <div
                      className={`vd-gauge-fill ${stockState.cls}`}
                      style={{ width: `${stockPct}%` }}
                    />
                  </div>
                  <div className="vd-gauge-legend">
                    <span>0</span>
                    <span>Seuil : {product.seuil}</span>
                    <span>Optimal</span>
                  </div>
                </div>

                {/* Grille infos principales */}
                <div className="vd-info-grid">
                  <div className="vd-info-item">
                    <div className="vd-info-icon blue"><Layers size={15} /></div>
                    <div>
                      <span className="vd-info-label">Catégorie</span>
                      <span className="vd-info-value">{product.categorie}</span>
                    </div>
                  </div>

                  <div className="vd-info-item">
                    <div className="vd-info-icon green"><Hash size={15} /></div>
                    <div>
                      <span className="vd-info-label">Quantité en stock</span>
                      <span className="vd-info-value" style={{ color: stockState.color }}>
                        {product.quantite} <small>{product.unite}</small>
                      </span>
                    </div>
                  </div>

                  <div className="vd-info-item">
                    <div className="vd-info-icon amber"><AlertTriangle size={15} /></div>
                    <div>
                      <span className="vd-info-label">Seuil minimum</span>
                      <span className="vd-info-value">{product.seuil} <small>{product.unite}</small></span>
                    </div>
                  </div>

                  <div className="vd-info-item">
                    <div className="vd-info-icon blue"><Tag size={15} /></div>
                    <div>
                      <span className="vd-info-label">Unité</span>
                      <span className="vd-info-value">{product.unite}</span>
                    </div>
                  </div>

                  {product.emplacement && (
                    <div className="vd-info-item">
                      <div className="vd-info-icon purple"><MapPin size={15} /></div>
                      <div>
                        <span className="vd-info-label">Emplacement</span>
                        <span className="vd-info-value">{product.emplacement}</span>
                      </div>
                    </div>
                  )}

                  {product.famille && (
                    <div className="vd-info-item">
                      <div className="vd-info-icon teal"><FileText size={15} /></div>
                      <div>
                        <span className="vd-info-label">Famille métier</span>
                        <span className="vd-info-value">{product.famille}</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Description */}
                {product.description && (
                  <div className="vd-description">
                    <span className="vd-section-label">Description</span>
                    <p>{product.description}</p>
                  </div>
                )}

                {/* Actions rapides */}
                <div className="vd-actions">
                  <button className="vd-action-btn entry"
                    onClick={() => navigate('/magasinier/entree-stock', { state: { product } })}>
                    <ArrowDownToLine size={15} /> Entrée stock
                  </button>
                  <button className="vd-action-btn exit"
                    onClick={() => navigate('/magasinier/sortie-stock', { state: { product } })}>
                    <ArrowUpFromLine size={15} /> Sortie stock
                  </button>
                </div>
              </div>

              {/* ══ COLONNE DROITE ══ */}
              <div className="vd-col-right">

                {/* Indicateurs synthèse */}
                <div className="vd-kpi-row">
                  <div className={`vd-kpi ${stockState.cls}`}>
                    <StockIcon size={18} />
                    <div>
                      <span className="vd-kpi-val">{product.quantite}</span>
                      <span className="vd-kpi-label">En stock</span>
                    </div>
                  </div>
                  <div className="vd-kpi neutral">
                    <TrendingDown size={18} />
                    <div>
                      <span className="vd-kpi-val">{product.seuil}</span>
                      <span className="vd-kpi-label">Seuil min.</span>
                    </div>
                  </div>
                  <div className={`vd-kpi ${product.quantite > product.seuil ? 'ok' : 'rupture'}`}>
                    <TrendingUp size={18} />
                    <div>
                      <span className="vd-kpi-val">
                        {product.quantite > product.seuil
                          ? `+${product.quantite - product.seuil}`
                          : product.quantite - product.seuil}
                      </span>
                      <span className="vd-kpi-label">Marge seuil</span>
                    </div>
                  </div>
                </div>

                {/* Pièces jointes */}
                <div className="vd-attachments">
                  <div className="vd-section-header">
                    <span className="vd-section-label">
                      <Paperclip size={13} /> Pièces jointes
                    </span>
                    {attachments.length > 0 && (
                      <span className="vd-attach-count">{attachments.length}</span>
                    )}
                  </div>

                  {isLoadingAttachments ? (
                    <div className="vd-attach-empty">Chargement…</div>
                  ) : attachments.length === 0 ? (
                    <div className="vd-attach-empty">
                      <Paperclip size={22} />
                      <span>Aucune pièce jointe</span>
                    </div>
                  ) : (
                    <div className="vd-attach-list">
                      {attachments.map((a, idx) => (
                        <div key={`att-${idx}`} className="vd-attach-item">
                          <div className={`vd-attach-icon ${a.icon}`}>
                            {a.icon === 'entry'
                              ? <ArrowDownToLine size={13} />
                              : <ArrowUpFromLine size={13} />}
                          </div>
                          <div className="vd-attach-info">
                            <span className="vd-attach-label">
                              {a.label || a.file_name || `Pièce ${idx + 1}`}
                            </span>
                            <span className="vd-attach-meta">
                              {a.type} · {a.date
                                ? new Date(a.date).toLocaleDateString('fr-FR', { day:'2-digit', month:'short', year:'numeric' })
                                : '—'}
                            </span>
                          </div>
                          {a.file_url && (
                            <a href={a.file_url} target="_blank" rel="noreferrer"
                              className="vd-attach-link" aria-label="Ouvrir le fichier">
                              <ExternalLink size={13} />
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Infos QR si dispo */}
                {product.qr_code_value && (
                  <div className="vd-qr-section">
                    <span className="vd-section-label">Code QR / Barcode</span>
                    <div className="vd-qr-value">{product.qr_code_value}</div>
                  </div>
                )}

              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default VoirDetails;