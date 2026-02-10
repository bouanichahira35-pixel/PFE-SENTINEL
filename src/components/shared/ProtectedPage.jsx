// src/components/shared/ProtectedPage.jsx
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

const ProtectedPage = ({ children, userName }) => {
  const navigate = useNavigate();

  useEffect(() => {
    if (!userName) {
      navigate("/", { replace: true });
    }
  }, [userName, navigate]);

  if (!userName) return null; // Attendre que userName soit défini

  return children;
};

export default ProtectedPage;
