import { Navigate } from "react-router-dom";

const ProtectedRoute = ({ isAuthenticated, allowedRole, userRole, children }) => {
  if (!isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  if (allowedRole && userRole !== allowedRole) {
    return <Navigate to="/" replace />;
  }

  return children;
};

export default ProtectedRoute;
