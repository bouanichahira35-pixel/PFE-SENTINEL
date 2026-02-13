import { useState, useEffect, useCallback } from "react";
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

const SESSION_TIMEOUT_MS = 15 * 60 * 1000;
const SESSION_STARTED_KEY = "sessionStartedAt";
const LAST_ACTIVITY_KEY = "lastActivityAt";
const LOGOUT_REASON_KEY = "logoutReason";

function decodeJwtPayload(token) {
  try {
    const payloadPart = token.split(".")[1];
    if (!payloadPart) return null;
    const json = atob(payloadPart.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json);
  } catch {
    return null;
  }
}

const App = () => {
  const [showSplash, setShowSplash] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userRole, setUserRole] = useState("");
  const [userName, setUserName] = useState("");

  const handleLogout = useCallback((reason = "") => {
    setUserName("");
    setUserRole("");
    setIsAuthenticated(false);

    if (reason) {
      sessionStorage.setItem(LOGOUT_REASON_KEY, reason);
    }

    sessionStorage.removeItem("token");
    sessionStorage.removeItem("userName");
    sessionStorage.removeItem("userRole");
    sessionStorage.removeItem(SESSION_STARTED_KEY);
    sessionStorage.removeItem(LAST_ACTIVITY_KEY);

    localStorage.removeItem("token");
    localStorage.removeItem("userName");
    localStorage.removeItem("userRole");
  }, []);

  useEffect(() => {
    const token = sessionStorage.getItem("token") || localStorage.getItem("token");
    const savedRole = sessionStorage.getItem("userRole") || localStorage.getItem("userRole");
    const savedName = sessionStorage.getItem("userName") || localStorage.getItem("userName");

    if (!token || !savedRole || !savedName) return;

    const payload = decodeJwtPayload(token);
    const expMs = payload?.exp ? payload.exp * 1000 : 0;

    if (!expMs || Date.now() >= expMs) {
      handleLogout("Session expirée. Veuillez vous reconnecter.");
      return;
    }

    // Migrate old localStorage sessions to sessionStorage (logout when browser closes).
    sessionStorage.setItem("token", token);
    sessionStorage.setItem("userRole", savedRole);
    sessionStorage.setItem("userName", savedName);
    sessionStorage.setItem(
      SESSION_STARTED_KEY,
      sessionStorage.getItem(SESSION_STARTED_KEY) || String(Date.now())
    );
    sessionStorage.setItem(
      LAST_ACTIVITY_KEY,
      sessionStorage.getItem(LAST_ACTIVITY_KEY) || String(Date.now())
    );

    localStorage.removeItem("token");
    localStorage.removeItem("userRole");
    localStorage.removeItem("userName");

    setUserRole(savedRole);
    setUserName(savedName);
    setIsAuthenticated(true);
  }, [handleLogout]);

  // Absolute JWT expiration timer.
  useEffect(() => {
    if (!isAuthenticated) return undefined;

    const token = sessionStorage.getItem("token");
    const payload = token ? decodeJwtPayload(token) : null;
    const expMs = payload?.exp ? payload.exp * 1000 : 0;

    if (!expMs) {
      handleLogout("Session expirée. Veuillez vous reconnecter.");
      return undefined;
    }

    const remaining = expMs - Date.now();
    if (remaining <= 0) {
      handleLogout("Session expirée. Veuillez vous reconnecter.");
      return undefined;
    }

    const timer = setTimeout(() => {
      handleLogout("Session expirée (15 min). Veuillez vous reconnecter.");
    }, remaining);

    return () => clearTimeout(timer);
  }, [isAuthenticated, handleLogout]);

  // Inactivity timeout timer (15 min max without activity).
  useEffect(() => {
    if (!isAuthenticated) return undefined;

    let inactivityTimer;

    const resetInactivityTimer = () => {
      clearTimeout(inactivityTimer);
      sessionStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()));
      inactivityTimer = setTimeout(() => {
        handleLogout("Déconnexion automatique après 15 min d'inactivité.");
      }, SESSION_TIMEOUT_MS);
    };

    const events = ["mousemove", "mousedown", "keydown", "scroll", "touchstart", "click"];
    events.forEach((eventName) => window.addEventListener(eventName, resetInactivityTimer));

    resetInactivityTimer();

    return () => {
      clearTimeout(inactivityTimer);
      events.forEach((eventName) => window.removeEventListener(eventName, resetInactivityTimer));
    };
  }, [isAuthenticated, handleLogout]);

  // Safety guard: enforce max 15 min session age and max 15 min inactivity.
  useEffect(() => {
    if (!isAuthenticated) return undefined;

    const interval = setInterval(() => {
      const now = Date.now();
      const startedAt = Number(sessionStorage.getItem(SESSION_STARTED_KEY) || 0);
      const lastActivity = Number(sessionStorage.getItem(LAST_ACTIVITY_KEY) || 0);

      if (!startedAt || !lastActivity) {
        handleLogout("Session expirée. Veuillez vous reconnecter.");
        return;
      }

      if (now - startedAt >= SESSION_TIMEOUT_MS || now - lastActivity >= SESSION_TIMEOUT_MS) {
        handleLogout("Session expirée (15 min). Veuillez vous reconnecter.");
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [isAuthenticated, handleLogout]);

  const handleSplashComplete = () => {
    setShowSplash(false);
  };

  const handleLogin = (user, token) => {
    setUserName(user.username);
    setUserRole(user.role);
    setIsAuthenticated(true);

    sessionStorage.setItem("token", token);
    sessionStorage.setItem("userName", user.username);
    sessionStorage.setItem("userRole", user.role);
    sessionStorage.setItem(SESSION_STARTED_KEY, String(Date.now()));
    sessionStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()));

    localStorage.removeItem("token");
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
