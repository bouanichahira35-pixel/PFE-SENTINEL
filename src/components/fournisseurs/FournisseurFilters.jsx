// BLOC 1 - Role du fichier.
// Ce fichier fournit un composant React specialise pour FournisseurFilters.
// Point de vigilance: garder les props, appels API et classes CSS synchronises avec les ecrans existants.

import './fournisseurs.css';

const DOMAINES = [
  { id: 'all', label: 'Tous' },
  { id: 'Mécanique', label: 'Mécanique' },
  { id: 'Sécurité', label: 'Sécurité' },
  { id: 'Stock', label: 'Stock' },
  { id: 'Maintenance', label: 'Maintenance' },
  { id: 'Transport', label: 'Transport' },
  { id: 'Autre', label: 'Autre' },
];

const FournisseurFilters = ({
  search,
  onSearchChange,
  status,
  onStatusChange,
  reliability,
  onReliabilityChange,
  profileState,
  onProfileStateChange,
  domain,
  onDomainChange,
  perPage,
  onPerPageChange,
}) => {
  return (
    <div className="resp-suppliers-actions">
      <div className="resp-filters">
        <div className="resp-filter">
          <span>Recherche</span>
          <input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Nom, email, téléphone, domaine, produit..."
            style={{
              border: '1px solid rgba(2, 6, 23, 0.12)',
              borderRadius: 12,
              padding: '9px 10px',
              fontWeight: 900,
              minWidth: 320,
            }}
          />
        </div>

        <div className="resp-filter">
          <span>Statut</span>
          <select value={status} onChange={(e) => onStatusChange(e.target.value)}>
            <option value="all">Tous</option>
            <option value="ACTIF">Actif</option>
            <option value="INACTIF">Inactif</option>
            <option value="SUSPENDU">Suspendu</option>
            <option value="A_VERIFIER">À vérifier</option>
          </select>
        </div>

        <div className="resp-filter">
          <span>Fiabilité</span>
          <select value={reliability} onChange={(e) => onReliabilityChange(e.target.value)}>
            <option value="all">Tous</option>
            <option value="FIABLE">Fiable</option>
            <option value="MOYEN">Moyen</option>
            <option value="A_SURVEILLER">À surveiller</option>
            <option value="NON_EVALUE">Non évalué</option>
          </select>
        </div>

        <div className="resp-filter">
          <span>État fiche</span>
          <select value={profileState} onChange={(e) => onProfileStateChange(e.target.value)}>
            <option value="all">Tous</option>
            <option value="complete">Complète</option>
            <option value="incomplete">Incomplète</option>
            <option value="a_verifier">À vérifier</option>
          </select>
        </div>

        <div className="resp-filter">
          <span>Domaine</span>
          <select value={domain} onChange={(e) => onDomainChange(e.target.value)}>
            {DOMAINES.map((d) => (
              <option key={d.id} value={d.id}>{d.label}</option>
            ))}
          </select>
        </div>

        <div className="resp-filter">
          <span>Par page</span>
          <select value={perPage} onChange={(e) => onPerPageChange(Number(e.target.value))}>
            <option value={10}>10</option>
            <option value={20}>20</option>
            <option value={50}>50</option>
          </select>
        </div>
      </div>
    </div>
  );
};

export default FournisseurFilters;

