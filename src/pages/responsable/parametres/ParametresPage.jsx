// BLOC 1 - Role du fichier.
// Ce fichier affiche une page de l'espace responsable pour ParametresPage.
// Point de vigilance: garder les props, appels API et classes CSS synchronises avec les ecrans existants.

import ParametresResp from '../ParametresResp';

export default function ParametresPage(props) {
  return <ParametresResp {...props} />;
}

