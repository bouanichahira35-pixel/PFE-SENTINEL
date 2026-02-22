import { useState, useEffect, useCallback } from "react";
import { ToastProvider } from "./components/shared/Toast";

import SplashScreen from "./components/shared/SplashScreen";
import LoginPage from "./components/shared/LoginPage";
import ForgotPassword from "./components/shared/ForgotPassword";

import ProduitsMag from "./pages/magasinier/ProduitsMag";
import ListeDemandes from "./pages/magasinier/ListeDemandes";
import EntreeStock from "./pages/magasinier/EntreeStock.jsx";
import SortieStock from "./pages/magasinier/SortieStock.jsx";
import AjouterProduit from "./pages/magasinier/AjouterProduit";
import VoirDetails from "./pages/magasinier/VoirDetails";
import HistoriqueMag from "./pages/magasinier/HistoriqueMag";
import ChatMag from "./pages/magasinier/ChatMag";
import ParametresMag from "./pages/magasinier/ParametresMag";

import DashboardResp from "./pages/responsable/DashboardResp";
import AnalyseResp from "./pages/responsable/AnalyseResp";
import SurveillanceResp from "./pages/responsable/SurveillanceResp";
import TransactionsResp from "./pages/responsable/TransactionsResp";
import ChatbotResp from "./pages/responsable/ChatbotResp";
import ChatResp from "./pages/responsable/ChatResp";
import ParametresResp from "./pages/responsable/ParametresResp";

import ProduitsDem from "./pages/demandeur/ProduitsDem";
import MesDemandes from "./pages/demandeur/MesDemandes";

import NotFound from "./pages/NotFound";
import { HOME_PATH_BY_ROLE, ROLES, isKnownRole } from "./constants/roles";
import { applyUiLanguage, getUiLanguage } from "./utils/uiLanguage";

import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

const SESSION_TIMEOUT_MS = 15 * 60 * 1000;
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

  useEffect(() => {
    applyUiLanguage(getUiLanguage());
  }, []);

  const handleLogout = useCallback((reason = "") => {
    setUserName("");
    setUserRole("");
    setIsAuthenticated(false);

    if (reason) sessionStorage.setItem(LOGOUT_REASON_KEY, reason);

    sessionStorage.removeItem("token");
    sessionStorage.removeItem("refreshToken");
    sessionStorage.removeItem("sessionId");
    sessionStorage.removeItem("userName");
    sessionStorage.removeItem("userRole");
    sessionStorage.removeItem("imageProfile");
    sessionStorage.removeItem(LAST_ACTIVITY_KEY);

    localStorage.removeItem("token");
    localStorage.removeItem("refreshToken");
    localStorage.removeItem("sessionId");
    localStorage.removeItem("userName");
    localStorage.removeItem("userRole");
    localStorage.removeItem("imageProfile");
  }, []);

  useEffect(() => {
    const token = sessionStorage.getItem("token") || localStorage.getItem("token");
    const refreshToken = sessionStorage.getItem("refreshToken") || localStorage.getItem("refreshToken");
    const savedRole = sessionStorage.getItem("userRole") || localStorage.getItem("userRole");
    const savedName = sessionStorage.getItem("userName") || localStorage.getItem("userName");

    if ((!token && !refreshToken) || !savedRole || !savedName) return;

    if (!isKnownRole(savedRole)) {
      handleLogout("Role session invalide.");
      return;
    }

    if (token) {
      const payload = decodeJwtPayload(token);
      if (!payload) {
        if (!refreshToken) {
          handleLogout("Session invalide. Veuillez vous reconnecter.");
          return;
        }
        sessionStorage.removeItem("token");
      } else {
        sessionStorage.setItem("token", token);
      }
    }

    if (refreshToken) {
      sessionStorage.setItem("refreshToken", refreshToken);
    }

    sessionStorage.setItem("userRole", savedRole);
    sessionStorage.setItem("userName", savedName);
    sessionStorage.setItem(
      LAST_ACTIVITY_KEY,
      sessionStorage.getItem(LAST_ACTIVITY_KEY) || String(Date.now())
    );

    localStorage.removeItem("token");
    localStorage.removeItem("refreshToken");
    localStorage.removeItem("userRole");
    localStorage.removeItem("userName");

    setUserRole(savedRole);
    setUserName(savedName);
    setIsAuthenticated(true);
  }, [handleLogout]);

  // Inactivity timeout timer (15 min max without activity, even after tab/app switch).
  useEffect(() => {
    if (!isAuthenticated) return undefined;

    let inactivityTimer;

    const readLastActivity = () => Number(sessionStorage.getItem(LAST_ACTIVITY_KEY) || 0);
    const writeLastActivity = () => sessionStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()));

    const logoutForInactivity = () => {
      handleLogout("Deconnexion automatique apres 15 min d'inactivite.");
    };

    const scheduleInactivityTimer = () => {
      clearTimeout(inactivityTimer);

      if (!readLastActivity()) writeLastActivity();

      const elapsed = Date.now() - (readLastActivity() || Date.now());
      const remaining = SESSION_TIMEOUT_MS - elapsed;

      if (remaining <= 0) {
        logoutForInactivity();
        return;
      }

      inactivityTimer = setTimeout(() => {
        const latestElapsed = Date.now() - readLastActivity();
        if (latestElapsed >= SESSION_TIMEOUT_MS) {
          logoutForInactivity();
          return;
        }
        scheduleInactivityTimer();
      }, remaining);
    };

    const markActivity = () => {
      writeLastActivity();
      scheduleInactivityTimer();
    };

    const checkInactivityNow = () => {
      const lastActivity = readLastActivity();
      if (!lastActivity || Date.now() - lastActivity >= SESSION_TIMEOUT_MS) {
        logoutForInactivity();
        return;
      }
      scheduleInactivityTimer();
    };

    const handleVisibilityChange = () => {
      if (!document.hidden) checkInactivityNow();
    };

    const events = ["mousemove", "mousedown", "keydown", "scroll", "touchstart", "click"];
    events.forEach((eventName) => window.addEventListener(eventName, markActivity));
    window.addEventListener("focus", checkInactivityNow);
    window.addEventListener("pageshow", checkInactivityNow);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    checkInactivityNow();

    return () => {
      clearTimeout(inactivityTimer);
      events.forEach((eventName) => window.removeEventListener(eventName, markActivity));
      window.removeEventListener("focus", checkInactivityNow);
      window.removeEventListener("pageshow", checkInactivityNow);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [isAuthenticated, handleLogout]);

  // Safety guard: enforce max 15 min inactivity based on last recorded activity.
  useEffect(() => {
    if (!isAuthenticated) return undefined;

    const interval = setInterval(() => {
      const now = Date.now();
      const lastActivity = Number(sessionStorage.getItem(LAST_ACTIVITY_KEY) || 0);

      if (!lastActivity) {
        handleLogout("Session expiree. Veuillez vous reconnecter.");
        return;
      }

      if (now - lastActivity >= SESSION_TIMEOUT_MS) {
        handleLogout("Session expiree apres 15 min d'inactivite.");
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [isAuthenticated, handleLogout]);

  const handleSplashComplete = () => {
    setShowSplash(false);
  };

  const handleLogin = (user, token, refreshToken, sessionId) => {
    const normalizedRole = String(user?.role || "").toLowerCase();
    if (!isKnownRole(normalizedRole)) {
      handleLogout("Role utilisateur invalide.");
      return;
    }

    setUserName(user.username);
    setUserRole(normalizedRole);
    setIsAuthenticated(true);

    sessionStorage.setItem("token", token);
    if (refreshToken) sessionStorage.setItem("refreshToken", refreshToken);
    if (sessionId) sessionStorage.setItem("sessionId", sessionId);
    sessionStorage.setItem("userName", user.username);
    sessionStorage.setItem("userRole", normalizedRole);
    if (user.image_profile) sessionStorage.setItem("imageProfile", user.image_profile);
    else sessionStorage.removeItem("imageProfile");
    sessionStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()));

    localStorage.removeItem("token");
    localStorage.removeItem("refreshToken");
    localStorage.removeItem("userName");
    localStorage.removeItem("userRole");
  };

  if (showSplash) {
    return <SplashScreen onComplete={handleSplashComplete} />;
  }

  const homePath = HOME_PATH_BY_ROLE[userRole] || "/";

  return (
    <ToastProvider>
      <BrowserRouter>
        <Routes>
          {!isAuthenticated ? (
            <>
              <Route path="/" element={<LoginPage onLogin={handleLogin} />} />
              <Route path="/login" element={<LoginPage onLogin={handleLogin} />} />
              <Route path="/login/magasinier" element={<Navigate to="/login" replace />} />
              <Route path="/login/responsable" element={<Navigate to="/login" replace />} />
              <Route path="/login/demandeur" element={<Navigate to="/login" replace />} />

              <Route path="/mot-de-passe-oublie" element={<ForgotPassword />} />

              <Route path="*" element={<Navigate to="/login" replace />} />
            </>
          ) : (
            <>
              <Route path="/login/*" element={<Navigate to={homePath} replace />} />
              {userRole === ROLES.MAGASINIER && (
                <>
                  <Route path="/magasinier" element={<ProduitsMag userName={userName} onLogout={handleLogout} />} />
                  <Route path="/magasinier/demandes" element={<ListeDemandes userName={userName} onLogout={handleLogout} />} />
                  <Route path="/magasinier/entree-stock" element={<EntreeStock userName={userName} onLogout={handleLogout} />} />
                  <Route path="/magasinier/sortie-stock" element={<SortieStock userName={userName} onLogout={handleLogout} />} />
                  <Route path="/magasinier/ajouter-produit" element={<AjouterProduit userName={userName} onLogout={handleLogout} />} />
                  <Route path="/magasinier/voir-details" element={<VoirDetails userName={userName} onLogout={handleLogout} />} />
                  <Route path="/magasinier/historique" element={<HistoriqueMag userName={userName} onLogout={handleLogout} />} />
                  <Route path="/magasinier/audit-fifo" element={<Navigate to="/magasinier/historique" replace />} />
                  <Route path="/magasinier/chat" element={<ChatMag userName={userName} onLogout={handleLogout} />} />
                  <Route path="/magasinier/parametres" element={<ParametresMag userName={userName} onLogout={handleLogout} />} />
                  <Route path="/" element={<Navigate to="/magasinier" replace />} />
                </>
              )}

              {userRole === ROLES.RESPONSABLE && (
                <>
                  <Route path="/responsable" element={<DashboardResp userName={userName} onLogout={handleLogout} />} />
                  <Route path="/responsable/analyse" element={<AnalyseResp userName={userName} onLogout={handleLogout} />} />
                  <Route path="/responsable/surveillance" element={<SurveillanceResp userName={userName} onLogout={handleLogout} />} />
                  <Route path="/responsable/transactions" element={<TransactionsResp userName={userName} onLogout={handleLogout} />} />
                  <Route path="/responsable/historique" element={<Navigate to="/responsable/transactions" replace />} />
                  <Route path="/responsable/chatbot" element={<ChatbotResp userName={userName} onLogout={handleLogout} />} />
                  <Route path="/responsable/chat" element={<ChatResp userName={userName} onLogout={handleLogout} />} />
                  <Route path="/responsable/parametres" element={<ParametresResp userName={userName} onLogout={handleLogout} />} />
                  <Route path="/" element={<Navigate to="/responsable" replace />} />
                </>
              )}

              {userRole === ROLES.DEMANDEUR && (
                <>
                  <Route path="/demandeur" element={<ProduitsDem userName={userName} onLogout={handleLogout} />} />
                  <Route path="/demandeur/mes-demandes" element={<MesDemandes userName={userName} onLogout={handleLogout} />} />
                  <Route path="/demandeur/parametres" element={<Navigate to="/demandeur" replace />} />
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
