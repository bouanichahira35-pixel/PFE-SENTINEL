// BLOC 1 - Role du fichier.
// Ce fichier fournit un composant React partage pour StockModal.
// Point de vigilance: garder les props, appels API et classes CSS synchronises avec les ecrans existants.

import { useState, useEffect } from 'react';
import './StockModal.css';

const StockModal = ({ isOpen, onClose, product, type, onConfirm }) => {
  const [quantite, setQuantite] = useState('');
  const [sourceOrDest, setSourceOrDest] = useState('');

  useEffect(() => {
    if (isOpen) {
      setQuantite('');
      setSourceOrDest('');
    }
  }, [isOpen]);

  if (!isOpen || !product) return null;

  const isEntree = type === 'entree';
  const stockApres = isEntree
    ? product.quantite + (parseInt(quantite) || 0)
    : product.quantite - (parseInt(quantite) || 0);

  const isValid = parseInt(quantite) > 0 && sourceOrDest.trim() !== '' && 
    (!isEntree ? stockApres >= 0 : true);

  const handleSubmit = () => {
    if (isValid) {
      onConfirm(parseInt(quantite), sourceOrDest);
      onClose();
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span className={`modal-icon ${isEntree ? 'entree' : 'sortie'}`}>
            {isEntree ? '⬇️' : '⬆️'}
          </span>
          <h2>{isEntree ? 'Entrée de stock' : 'Sortie de stock'}</h2>
        </div>

        <div className="modal-body">
          {/* Product info */}
          <div className="product-info">
            <span className="product-icon">📦</span>
            <div>
              <p className="product-name">{product.nom}</p>
              <p className="product-code">#{product.code}</p>
            </div>
          </div>

          {/* Stock actuel */}
          <div className="stock-preview">
            <div className="stock-box">
              <p className="stock-label">Stock actuel</p>
              <p className="stock-value">{product.quantite}</p>
              <p className="stock-unit">{product.unite}</p>
            </div>
            <div className={`stock-box ${
              stockApres < product.seuilMin 
                ? stockApres === 0 ? 'danger' : 'warning'
                : 'success'
            }`}>
              <p className="stock-label">Stock après</p>
              <p className="stock-value">
                {stockApres >= 0 ? stockApres : '--'}
              </p>
              <p className="stock-unit">{product.unite}</p>
            </div>
          </div>

          {/* Quantité */}
          <div className="form-group">
            <label htmlFor="quantite">Quantité</label>
            <input
              id="quantite"
              type="number"
              min="1"
              max={!isEntree ? product.quantite : undefined}
              value={quantite}
              onChange={(e) => setQuantite(e.target.value)}
              placeholder="Entrez la quantité"
              className="form-input"
            />
          </div>

          {/* Source / Destination */}
          <div className="form-group">
            <label htmlFor="sourceOrDest">
              {isEntree ? 'Source / Fournisseur' : 'Destination / Bénéficiaire'}
            </label>
            <input
              id="sourceOrDest"
              value={sourceOrDest}
              onChange={(e) => setSourceOrDest(e.target.value)}
              placeholder={isEntree ? 'Ex: Fournisseur ABC' : 'Ex: Service IT'}
              className="form-input"
            />
          </div>

          {/* Warning for low stock */}
          {!isEntree && stockApres >= 0 && stockApres < product.seuilMin && (
            <div className="alert warning">
              <p>⚠️ Attention: Cette opération fera passer le stock sous le seuil minimum ({product.seuilMin})</p>
            </div>
          )}

          {!isEntree && stockApres < 0 && (
            <div className="alert danger">
              <p>❌ Stock insuffisant pour cette opération</p>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn-outline" onClick={onClose}>
            Annuler
          </button>
          <button
            onClick={handleSubmit}
            disabled={!isValid}
            className={`btn-primary ${isEntree ? 'entree' : 'sortie'}`}
          >
            {isEntree ? 'Confirmer entrée' : 'Confirmer sortie'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default StockModal;
