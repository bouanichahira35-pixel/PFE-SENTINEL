// BLOC 1 - Role du fichier.
// Ce fichier fournit un composant React partage pour ProtectedWrapper.
// Point de vigilance: garder les props, appels API et classes CSS synchronises avec les ecrans existants.

// src/components/shared/ProtectedWrapper.jsx
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

const ProtectedWrapper = ({ userName, children }) => {
  const navigate = useNavigate();

  useEffect(() => {
    if (!userName) {
      navigate("/", { replace: true });
    }
  }, [userName, navigate]);

  // On peut retourner null si userName vide, sinon le contenu
  if (!userName) return null;

  return children;
};

export default ProtectedWrapper;
