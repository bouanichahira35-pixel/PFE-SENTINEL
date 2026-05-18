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
