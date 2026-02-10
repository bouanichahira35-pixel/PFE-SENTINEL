import { useState, useEffect } from "react";
import { ToastProvider } from "./components/shared/Toast";

import SplashScreen from "./components/shared/SplashScreen";
import LoginPage from "./components/shared/LoginPage";
import ForgotPassword from "./components/shared/ForgotPassword";

import RoleSelection from "./pages/RoleSelection";

import ProduitsMag from "./pages/magasinier/ProduitsMag";
import ListeDemandes from "./pages/magasinier/ListeDemandes";
import EntreeStock from "./pages/magasinier/EntreeStock";
import SortieStock from "./pages/magasinier/SortieStock";
import AjouterProduit from "./pages/magasinier/AjouterProduit";
import VoirDetails from "./pages/magasinier/VoirDetails";
import HistoriqueMag from "./pages/magasinier/HistoriqueMag";
import ChatMag from "./pages/magasinier/ChatMag";
import ParametresMag from "./pages/magasinier/ParametresMag";

import DashboardResp from "./pages/responsable/DashboardResp";
import ChatbotResp from "./pages/responsable/ChatbotResp";
import ChatResp from "./pages/responsable/ChatResp";
import HistoriqueResp from "./pages/responsable/HistoriqueResp";
import ParametresResp from "./pages/responsable/ParametresResp";

import ProduitsDem from "./pages/demandeur/ProduitsDem";
import MesDemandes from "./pages/demandeur/MesDemandes";

import NotFound from "./pages/NotFound";

import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

const App = () => {
  const [showSplash, setShowSplash] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userRole, setUserRole] = useState("");
  const [userName, setUserName] = useState("");

  useEffect(() => {
    const savedRole = localStorage.getItem("userRole");
    const savedName = localStorage.getItem("userName");
    if (savedRole && savedName) {
      setUserRole(savedRole);
      setUserName(savedName);
      setIsAuthenticated(true);
    }
  }, []);

  const handleSplashComplete = () => {
    setShowSplash(false);
  };

  const handleLogin = (username, role) => {
    setUserName(username);
    setUserRole(role);
    setIsAuthenticated(true);
    localStorage.setItem("userName", username);
    localStorage.setItem("userRole", role);
  };

  const handleLogout = () => {
    setUserName("");
    setUserRole("");
    setIsAuthenticated(false);
    localStorage.removeItem("userName");
    localStorage.removeItem("userRole");
  };

  if (showSplash) {
    return <SplashScreen onComplete={handleSplashComplete} />;
  }

  const homePath =
    userRole === 'magasinier'
      ? '/magasinier'
      : userRole === 'responsable'
        ? '/responsable'
        : userRole === 'demandeur'
          ? '/demandeur'
          : '/';

  return (
    <ToastProvider>
      <BrowserRouter>
        <Routes>
          {!isAuthenticated ? (
            <>
              <Route path="/" element={<RoleSelection />} />
              
              <Route 
                path="/login/magasinier" 
                element={
                  <LoginPage 
                    role="magasinier" 
                    roleName="MAGASINIER" 
                    onLogin={handleLogin}
                    redirectPath="/magasinier"
                  />
                } 
              />
              <Route 
                path="/login/responsable" 
                element={
                  <LoginPage 
                    role="responsable" 
                    roleName="RESPONSABLE" 
                    onLogin={handleLogin}
                    redirectPath="/responsable"
                  />
                } 
              />
              <Route 
                path="/login/demandeur" 
                element={
                  <LoginPage 
                    role="demandeur" 
                    roleName="DEMANDEUR" 
                    onLogin={handleLogin}
                    redirectPath="/demandeur"
                  />
                } 
              />
              
              <Route path="/mot-de-passe-oublie" element={<ForgotPassword />} />
              
              <Route path="*" element={<Navigate to="/" replace />} />
            </>
          ) : (
            <>
              <Route path="/login/*" element={<Navigate to={homePath} replace />} />
              {userRole === 'magasinier' && (
                <>
                  <Route path="/magasinier" element={<ProduitsMag userName={userName} onLogout={handleLogout} />} />
                  <Route path="/magasinier/demandes" element={<ListeDemandes userName={userName} onLogout={handleLogout} />} />
                  <Route path="/magasinier/entree-stock" element={<EntreeStock userName={userName} onLogout={handleLogout} />} />
                  <Route path="/magasinier/sortie-stock" element={<SortieStock userName={userName} onLogout={handleLogout} />} />
                  <Route path="/magasinier/ajouter-produit" element={<AjouterProduit userName={userName} onLogout={handleLogout} />} />
                  <Route path="/magasinier/voir-details" element={<VoirDetails userName={userName} onLogout={handleLogout} />} />
                  <Route path="/magasinier/historique" element={<HistoriqueMag userName={userName} onLogout={handleLogout} />} />
                  <Route path="/magasinier/chat" element={<ChatMag userName={userName} onLogout={handleLogout} />} />
                  <Route path="/magasinier/parametres" element={<ParametresMag userName={userName} onLogout={handleLogout} />} />
                  <Route path="/" element={<Navigate to="/magasinier" replace />} />
                </>
              )}

              {userRole === 'responsable' && (
                <>
                  <Route path="/responsable" element={<DashboardResp userName={userName} onLogout={handleLogout} />} />
                  <Route path="/responsable/chatbot" element={<ChatbotResp userName={userName} onLogout={handleLogout} />} />
                  <Route path="/responsable/chat" element={<ChatResp userName={userName} onLogout={handleLogout} />} />
                  <Route path="/responsable/historique" element={<HistoriqueResp userName={userName} onLogout={handleLogout} />} />
                  <Route path="/responsable/parametres" element={<ParametresResp userName={userName} onLogout={handleLogout} />} />
                  <Route path="/" element={<Navigate to="/responsable" replace />} />
                </>
              )}

              {userRole === 'demandeur' && (
                <>
                  <Route path="/demandeur" element={<ProduitsDem userName={userName} onLogout={handleLogout} />} />
                  <Route path="/demandeur/mes-demandes" element={<MesDemandes userName={userName} onLogout={handleLogout} />} />
                  <Route path="/" element={<Navigate to="/demandeur" replace />} />
                </>
              )}

              <Route path="*" element={<NotFound />} />
            </>
          )}
        </Routes>
      </BrowserRouter>
    </ToastProvider>
  );
};

export default App;
