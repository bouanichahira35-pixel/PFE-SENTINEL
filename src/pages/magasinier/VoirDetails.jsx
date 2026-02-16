import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Package, ArrowLeft, Tag, Layers, Hash, AlertTriangle, Paperclip, ArrowDownToLine, ArrowUpFromLine } from 'lucide-react';
import SidebarMag from '../../components/magasinier/SidebarMag';
import HeaderPage from '../../components/shared/HeaderPage';
import { useToast } from '../../components/shared/Toast';
import { get } from '../../services/api';
import './VoirDetails.css';

const VoirDetails = ({ userName, onLogout }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const toast = useToast();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [attachments, setAttachments] = useState([]);

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

  useEffect(() => {
    let ignore = false;
    const loadAttachments = async () => {
      try {
        const [entries, exits] = await Promise.all([get('/stock/entries'), get('/stock/exits')]);
        if (ignore) return;

        const productId = product.id || product._id;
        const byProduct = (row) => {
          const rowProductId = row.product?._id || row.product;
          return productId ? String(rowProductId) === String(productId) : row.product?.code_product === product.code;
        };

        const docs = [];
        entries.filter(byProduct).forEach((e) => {
          (e.attachments || []).forEach((a) => {
            docs.push({
              type: 'Entree',
              icon: 'entry',
              label: a.label || 'Piece entree',
              file_name: a.file_name,
              file_url: a.file_url,
              date: e.date_entry || e.createdAt,
            });
          });
        });
        exits.filter(byProduct).forEach((x) => {
          (x.attachments || []).forEach((a) => {
            docs.push({
              type: 'Sortie',
              icon: 'exit',
              label: a.label || 'Piece sortie',
              file_name: a.file_name,
              file_url: a.file_url,
              date: x.date_exit || x.createdAt,
            });
          });
        });
        setAttachments(docs.sort((a, b) => new Date(b.date) - new Date(a.date)));
      } catch (err) {
        toast.error(err.message || 'Chargement des pieces echoue');
      }
    };
    loadAttachments();
    return () => {
      ignore = true;
    };
  }, [product.id, product._id, product.code, toast]);

  const getStockState = (quantite, seuil) => {
    if (quantite === 0) return { label: 'Rupture de stock', className: 'stock-rupture', icon: AlertTriangle };
    if (quantite <= seuil) return { label: 'Sous le seuil minimum', className: 'stock-warning', icon: AlertTriangle };
    return { label: 'Stock disponible', className: 'stock-ok', icon: Package };
  };

  const stockState = useMemo(() => getStockState(product.quantite, product.seuil), [product.quantite, product.seuil]);
  const StockIcon = stockState.icon;

  return (
    <div className="app-layout">
      <SidebarMag collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} onLogout={onLogout} userName={userName} />

      <div className="main-container">
        <HeaderPage userName={userName} title="Details du produit" showSearch={false} />

        <main className="main-content">
          <div className="voir-details-page">
            <button className="back-btn" onClick={() => navigate('/magasinier')}>
              <ArrowLeft size={18} />
              Retour a la liste
            </button>

            <div className="details-card">
              <div className="details-header">
                <div className="product-icon-large">
                  <Package size={32} />
                </div>
                <div>
                  <h2>{product.nom}</h2>
                  <span className="product-code-large">{product.code}</span>
                </div>
              </div>

              <div className={`stock-status-banner ${stockState.className}`}>
                <StockIcon size={20} />
                <span>{stockState.label}</span>
              </div>

              <div className="details-grid">
                <div className="detail-item">
                  <div className="detail-icon">
                    <Layers size={18} />
                  </div>
                  <div className="detail-content">
                    <span className="detail-label">Categorie</span>
                    <span className="detail-value">{product.categorie}</span>
                  </div>
                </div>

                <div className="detail-item">
                  <div className="detail-icon">
                    <Hash size={18} />
                  </div>
                  <div className="detail-content">
                    <span className="detail-label">Quantite en stock</span>
                    <span className="detail-value">
                      {product.quantite} {product.unite}
                    </span>
                  </div>
                </div>

                <div className="detail-item">
                  <div className="detail-icon">
                    <AlertTriangle size={18} />
                  </div>
                  <div className="detail-content">
                    <span className="detail-label">Seuil minimum</span>
                    <span className="detail-value">
                      {product.seuil} {product.unite}
                    </span>
                  </div>
                </div>

                <div className="detail-item">
                  <div className="detail-icon">
                    <Tag size={18} />
                  </div>
                  <div className="detail-content">
                    <span className="detail-label">Unite</span>
                    <span className="detail-value">{product.unite}</span>
                  </div>
                </div>
              </div>

              {product.description && (
                <div className="details-description">
                  <h3>Description</h3>
                  <p>{product.description}</p>
                </div>
              )}

              <div className="details-description">
                <h3>Pieces jointes</h3>
                {attachments.length === 0 ? (
                  <p>Aucune piece jointe pour ce produit.</p>
                ) : (
                  attachments.map((a, idx) => (
                    <p key={`att-${idx}`}>
                      {a.icon === 'entry' ? <ArrowDownToLine size={14} /> : <ArrowUpFromLine size={14} />} <Paperclip size={14} />{' '}
                      <a href={a.file_url} target="_blank" rel="noreferrer">
                        {a.label || a.file_name || `Piece ${idx + 1}`}
                      </a>{' '}
                      ({a.type})
                    </p>
                  ))
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
