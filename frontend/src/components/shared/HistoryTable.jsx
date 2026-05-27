import './HistoryTable.css';

const HistoryTable = ({ history }) => {
  return (
    <div className="history-table-container">
      <table className="history-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Type</th>
            <th>Code</th>
            <th>Produit</th>
            <th>Quantité</th>
            <th>Stock Avant</th>
            <th>Stock Après</th>
            <th>Source/Dest.</th>
            <th>Magasinier</th>
          </tr>
        </thead>
        <tbody>
          {history.map((entry) => (
            <tr key={entry.id}>
              <td className="date-cell">{entry.date}</td>
              <td>
                <span className={`type-badge ${entry.type}`}>
                  {entry.type === 'entree' ? '⬇️' : '⬆️'}
                  {entry.type === 'entree' ? 'Entrée' : 'Sortie'}
                </span>
              </td>
              <td><span className="code-cell">#{entry.productCode}</span></td>
              <td className="product-cell">{entry.productNom}</td>
              <td>
                <span className={`quantity-cell ${entry.type}`}>
                  {entry.type === 'entree' ? '+' : '-'}{entry.quantite}
                </span>
              </td>
              <td className="stock-cell">{entry.stockAvant}</td>
              <td className="stock-cell bold">{entry.stockApres}</td>
              <td className="source-cell">{entry.source || entry.destination || '-'}</td>
              <td className="magasinier-cell">{entry.magasinier}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {history.length === 0 && (
        <div className="empty-state">
          <p>Aucun historique disponible</p>
        </div>
      )}
    </div>
  );
};

export default HistoryTable;
