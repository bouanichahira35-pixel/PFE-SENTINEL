import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { mockProducts, categories, getProductStatus } from '../data/mockData';
import './ProduitsMag.css';

const ProduitsMag = ({ searchQuery, onEntreeStock, onSortieStock, onVoirDetails }) => {
  const navigate = useNavigate();
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedFilter, setSelectedFilter] = useState('all');

  const filteredProducts = mockProducts.filter((product) => {
    const matchesSearch = 
      product.nom.toLowerCase().includes(searchQuery.toLowerCase()) ||
      product.code.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesCategory = selectedCategory === 'all' || product.categorie === selectedCategory;
    
    const status = getProductStatus(product.quantite, product.seuilMin);
    const matchesFilter = 
      selectedFilter === 'all' ||
      (selectedFilter === 'disponible' && status === 'disponible') ||
      (selectedFilter === 'sous-seuil' && status === 'sous-seuil') ||
      (selectedFilter === 'rupture' && status === 'rupture');

    return matchesSearch && matchesCategory && matchesFilter;
  });

  const counts = {
    all: mockProducts.length,
    disponible: mockProducts.filter(p => getProductStatus(p.quantite, p.seuilMin) === 'disponible').length,
    sousSeuil: mockProducts.filter(p => getProductStatus(p.quantite, p.seuilMin) === 'sous-seuil').length,
    rupture: mockProducts.filter(p => getProductStatus(p.quantite, p.seuilMin) === 'rupture').length,
  };

  const getStatusBadge = (product) => {
    const status = getProductStatus(product.quantite, product.seuilMin);
    const statusClasses = {
      'disponible': 'badge-disponible',
      'sous-seuil': 'badge-warning',
      'rupture': 'badge-danger'
    };
    const statusLabels = {
      'disponible': 'Disponible',
      'sous-seuil': 'Sous seuil',
      'rupture': 'Rupture'
    };
    return <span className={`badge ${statusClasses[status]}`}>{statusLabels[status]}</span>;
  };

  return (
    <div className="produits-mag">
      {/* Header */}
      <div className="produits-header">
        <h1 className="produits-title">Produits</h1>
        <button 
          onClick={() => navigate('/ajouter-produit')}
          className="btn-primary"
        >
          ➕ Ajouter un produit
        </button>
      </div>

      {/* Filters */}
      <div className="produits-filters">
        <div className="filter-tabs">
          <button
            onClick={() => setSelectedFilter('all')}
            className={`filter-tab ${selectedFilter === 'all' ? 'active' : ''}`}
          >
            Tous <span className="filter-count">{counts.all}</span>
          </button>
          <button
            onClick={() => setSelectedFilter('disponible')}
            className={`filter-tab disponible ${selectedFilter === 'disponible' ? 'active' : ''}`}
          >
            Disponible <span className="filter-count">{counts.disponible}</span>
          </button>
          <button
            onClick={() => setSelectedFilter('sous-seuil')}
            className={`filter-tab warning ${selectedFilter === 'sous-seuil' ? 'active' : ''}`}
          >
            Sous seuil <span className="filter-count">{counts.sousSeuil}</span>
          </button>
          <button
            onClick={() => setSelectedFilter('rupture')}
            className={`filter-tab danger ${selectedFilter === 'rupture' ? 'active' : ''}`}
          >
            Rupture <span className="filter-count">{counts.rupture}</span>
          </button>
        </div>

        <select 
          value={selectedCategory} 
          onChange={(e) => setSelectedCategory(e.target.value)}
          className="category-select"
        >
          <option value="all">Toutes les catégories</option>
          {categories.map((cat) => (
            <option key={cat} value={cat}>{cat}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="produits-table-container">
        <table className="produits-table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Produit</th>
              <th>Catégorie</th>
              <th>Quantité</th>
              <th>Seuil Min.</th>
              <th>État</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredProducts.map((product) => (
              <tr key={product.id}>
                <td><span className="code-cell">#{product.code}</span></td>
                <td className="product-name">{product.nom}</td>
                <td><span className="category-badge">{product.categorie}</span></td>
                <td className="quantity-cell">{product.quantite}</td>
                <td className="threshold-cell">{product.seuilMin}</td>
                <td>{getStatusBadge(product)}</td>
                <td>
                  <div className="action-buttons">
                    <button
                      onClick={() => onVoirDetails(product)}
                      className="action-btn view"
                      title="Voir détails"
                    >
                      👁️
                    </button>
                    <button
                      onClick={() => onEntreeStock(product)}
                      className="action-btn entree"
                      title="Entrée de stock"
                    >
                      ⬇️
                    </button>
                    <button
                      onClick={() => onSortieStock(product)}
                      className="action-btn sortie"
                      title="Sortie de stock"
                      disabled={product.quantite === 0}
                    >
                      ⬆️
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {filteredProducts.length === 0 && (
          <div className="empty-state">
            <p>Aucun produit trouvé</p>
          </div>
        )}

        {/* Pagination */}
        <div className="table-pagination">
          <p className="pagination-info">
            Affichage 1 - {filteredProducts.length} sur {filteredProducts.length}
          </p>
          <div className="pagination-buttons">
            <button disabled>&lt;</button>
            <button className="active">1</button>
            <button disabled>&gt;</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProduitsMag;
