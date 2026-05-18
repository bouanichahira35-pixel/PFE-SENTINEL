import { useState, useEffect, useCallback } from "react";
import { ToastProvider } from "./components/shared/Toast";

import SplashScreen from "./components/shared/SplashScreen";
import LoginPage from "./components/shared/LoginPage";
import ForgotPassword from "./components/shared/ForgotPassword";

import ProduitsMag from "./pages/magasinier/ProduitsMag";
import InboxMag from "./pages/magasinier/InboxMag";
import ListeDemandes from "./pages/magasinier/ListeDemandes";
import EntreeStock from "./pages/magasinier/EntreeStock.jsx";
import SortieStock from "./pages/magasinier/SortieStock.jsx";
import AjouterProduit from "./pages/magasinier/AjouterProduit";
import VoirDetails from "./pages/magasinier/VoirDetails";
import HistoriqueMag from "./pages/magasinier/HistoriqueMag";
import ChatMag from "./pages/magasinier/ChatMag";
import ParametresMag from "./pages/magasinier/ParametresMag";
import InventaireMag from "./pages/magasinier/InventaireMag";
import FeuilleInventaireMag from "./pages/magasinier/FeuilleInventaireMag";

import DashboardResp from "./pages/responsable/DashboardResp";
import ProduitsResp from "./pages/responsable/ProduitsResp";
import PilotageResp from "./pages/responsable/PilotageResp";
import ConsommationResp from "./pages/responsable/ConsommationResp";
import TransactionsResp from "./pages/responsable/TransactionsResp";
import ChatbotResp from "./pages/responsable/ChatbotResp";
import ChatResp from "./pages/responsable/ChatResp";
import ParametresResp from "./pages/responsable/parametres/ParametresPage";
import InventairesResp from "./pages/responsable/InventairesResp";
import LancerInventaireResp from "./pages/responsable/LancerInventaireResp";
import InventairesAValiderResp from "./pages/responsable/InventairesAValiderResp";
import AnalyseInventaireResp from "./pages/responsable/AnalyseInventaireResp";
import FournisseursResp from "./pages/responsable/FournisseursResp";
import CategoriesResp from "./pages/responsable/CategoriesResp";
import RegistreChimique from "./pages/responsable/RegistreChimique";
import ReglesStock from "./pages/responsable/ReglesStock";

import FournisseursPage from "./pages/responsable/fournisseurs/FournisseursPage";
import NouveauFournisseurPage from "./pages/responsable/fournisseurs/NouveauFournisseurPage";
import FicheFournisseurPage from "./pages/responsable/fournisseurs/FicheFournisseurPage";
import ModifierFournisseurPage from "./pages/responsable/fournisseurs/ModifierFournisseurPage";
import FournisseurCommandesPage from "./pages/responsable/fournisseurs/FournisseurCommandesPage";
import FournisseurProduitsPage from "./pages/responsable/fournisseurs/FournisseurProduitsPage";
import FournisseurDocumentsPage from "./pages/responsable/fournisseurs/FournisseurDocumentsPage";
import FournisseurIncidentsPage from "./pages/responsable/fournisseurs/FournisseurIncidentsPage";
import FournisseurEvaluationPage from "./pages/responsable/fournisseurs/FournisseurEvaluationPage";

import NouvelleCommandeFournisseurPage from "./pages/responsable/commandes/NouvelleCommandeFournisseurPage";
import CommandeFournisseurDetailsPage from "./pages/responsable/commandes/CommandeFournisseurDetailsPage";

import ProduitsDem from "./pages/demandeur/ProduitsDem";
import MesDemandes from "./pages/demandeur/MesDemandes";
import ParametresDem from "./pages/demandeur/ParametresDem";

import AdminDashboard from "./pages/admin/AdminDashboard";
import AdminUsers from "./pages/admin/AdminUsers";
import AdminIA from "./pages/admin/AdminIA";
import AdminSettings from "./pages/admin/AdminSettings";
import AdminSecurity from "./pages/admin/AdminSecurity";
import AdminSessions from "./pages/admin/AdminSessions";
import AdminRbac from "./pages/admin/AdminRbac";
import AdminSupport from "./pages/admin/AdminSupport";
import SupplierPortal from "./pages/supplier/SupplierPortal";

import NotFound from "./pages/NotFound";
import { HOME_PATH_BY_ROLE, ROLES, isKnownRole } from "./constants/roles";
import { applyUiLanguage, getUiLanguage } from "./utils/uiLanguage";
import { API_BASE } from "./services/api";

import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

// Align with backend inactivity policy (default 2h via SESSION_INACTIVITY_MS).
// Frontend inactivity guard is best-effort and should not log out earlier than backend.
const SESSION_TIMEOUT_MS = 2 * 60 * 60 * 1000;
const LAST_ACTIVITY_KEY = "lastActivityAt";
const LAST_LOGIN_ROLE_KEY = "lastLoginRole";
const LOGOUT_REASON_KEY = "logoutReason";
const AUTH_LOGOUT_EVENT_NAME = "auth-logout";

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

  const handleLogout = useCallback((reason = "", options = {}) => {
    const remote = options?.remote !== false;
    const token = sessionStorage.getItem("token") || "";
    const refreshToken = sessionStorage.getItem("refreshToken") || "";

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
    sessionStorage.removeItem("serviceDirection");
    sessionStorage.removeItem(LAST_ACTIVITY_KEY);

    localStorage.removeItem("token");
    localStorage.removeItem("refreshToken");
    localStorage.removeItem("sessionId");
    localStorage.removeItem("userName");
    localStorage.removeItem("userRole");
    localStorage.removeItem("imageProfile");
    localStorage.removeItem("serviceDirection");

    if (remote) {
      // Non-bloquant: la UI se déconnecte immédiatement, la révocation côté serveur est best-effort.
      (async () => {
        let accessLogoutOk = false;

        if (token) {
          try {
            await fetch(`${API_BASE}/auth/logout`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
              credentials: "include",
              body: JSON.stringify({}),
            });
            accessLogoutOk = true;
          } catch {
            accessLogoutOk = false;
          }
        }

        if (!accessLogoutOk) {
          try {
            await fetch(`${API_BASE}/auth/logout-refresh`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify(refreshToken ? { refreshToken } : {}),
            });
          } catch {
            // best-effort
          }
        }
      })();
    }
  }, []);

  useEffect(() => {
    const onAuthLogout = (event) => {
      const reason = typeof event?.detail?.reason === "string" ? event.detail.reason : "";
      handleLogout(reason);
    };

    window.addEventListener(AUTH_LOGOUT_EVENT_NAME, onAuthLogout);
    return () => window.removeEventListener(AUTH_LOGOUT_EVENT_NAME, onAuthLogout);
  }, [handleLogout]);

  useEffect(() => {
    let cancelled = false;

    async function restoreSession() {
      const existingToken = sessionStorage.getItem("token") || "";
      const decodedExisting = existingToken ? decodeJwtPayload(existingToken) : null;
      const roleFromToken = String(decodedExisting?.role || "").toLowerCase();
      const nameFromToken = String(decodedExisting?.username || "").trim();

      if (decodedExisting && isKnownRole(roleFromToken) && nameFromToken) {
        sessionStorage.setItem(
          LAST_ACTIVITY_KEY,
          sessionStorage.getItem(LAST_ACTIVITY_KEY) || String(Date.now())
        );
        if (!cancelled) {
          setUserRole(roleFromToken);
          setUserName(nameFromToken);
          setIsAuthenticated(true);
        }
        return;
      }

      if (existingToken && !decodedExisting) {
        sessionStorage.removeItem("token");
      }

      try {
        // Try to refresh using HttpOnly cookie (set by backend on login).
        const res = await fetch(`${API_BASE}/auth/refresh`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({}),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data?.token) return;

        const decoded = decodeJwtPayload(data.token);
        const nextRole = String(decoded?.role || "").toLowerCase();
        const nextName = String(decoded?.username || "").trim();

        if (!decoded || !isKnownRole(nextRole) || !nextName) return;

        sessionStorage.setItem("token", data.token);
        sessionStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()));

        if (!cancelled) {
          setUserRole(nextRole);
          setUserName(nextName);
          setIsAuthenticated(true);
        }
      } catch {
        // ignore restore errors, user stays logged out
      }
    }

    restoreSession();
    return () => {
      cancelled = true;
    };
  }, [handleLogout]);

  // Inactivity timeout timer (best-effort; aligned with backend inactivity policy).
  useEffect(() => {
    if (!isAuthenticated) return undefined;

    let inactivityTimer;

    const readLastActivity = () => Number(sessionStorage.getItem(LAST_ACTIVITY_KEY) || 0);
    const writeLastActivity = () => sessionStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()));

    const logoutForInactivity = () => {
      const minutes = Math.max(1, Math.round(SESSION_TIMEOUT_MS / 60000));
      handleLogout(`Deconnexion automatique apres ${minutes} min d'inactivite.`);
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
    if (sessionId) sessionStorage.setItem("sessionId", sessionId);
    sessionStorage.setItem("userName", user.username);
    sessionStorage.setItem("userRole", normalizedRole); 
    sessionStorage.setItem(LAST_LOGIN_ROLE_KEY, normalizedRole); 
    if (user.image_profile) sessionStorage.setItem("imageProfile", user.image_profile); 
    else sessionStorage.removeItem("imageProfile"); 
    if (user.demandeur_profile) sessionStorage.setItem("demandeurProfile", String(user.demandeur_profile));
    else sessionStorage.removeItem("demandeurProfile");
    if (user.service_direction) sessionStorage.setItem("serviceDirection", String(user.service_direction));
    else sessionStorage.removeItem("serviceDirection");
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
  const loginRedirect = "/login";

  return (
    <ToastProvider>
      <BrowserRouter>
        <Routes>
          {!isAuthenticated ? (
            <>
              <Route path="/" element={<Navigate to="/login" replace />} />
              <Route path="/login" element={<LoginPage onLogin={handleLogin} />} />
              <Route path="/login/:role" element={<Navigate to="/login" replace />} />

              <Route path="/mot-de-passe-oublie" element={<ForgotPassword />} />
              <Route path="/fournisseur" element={<SupplierPortal />} />

              <Route path="*" element={<Navigate to={loginRedirect} replace />} />
            </>
          ) : (
            <>
              <Route path="/login/*" element={<Navigate to={homePath} replace />} />
              {userRole === ROLES.MAGASINIER && (
                <>
                  <Route path="/magasinier" element={<ProduitsMag userName={userName} onLogout={handleLogout} />} />
                  <Route path="/magasinier/inbox" element={<InboxMag userName={userName} onLogout={handleLogout} />} />
                  <Route path="/magasinier/demandes" element={<ListeDemandes userName={userName} onLogout={handleLogout} />} />
                  <Route path="/magasinier/inventaire" element={<InventaireMag userName={userName} onLogout={handleLogout} />} />
                  <Route path="/magasinier/entree-stock" element={<EntreeStock userName={userName} onLogout={handleLogout} />} />
                  <Route path="/magasinier/sortie-stock" element={<SortieStock userName={userName} onLogout={handleLogout} />} />
                  <Route path="/magasinier/ajouter-produit" element={<AjouterProduit userName={userName} onLogout={handleLogout} />} />
                  <Route path="/magasinier/voir-details" element={<VoirDetails userName={userName} onLogout={handleLogout} />} />
                  <Route path="/magasinier/historique" element={<HistoriqueMag userName={userName} onLogout={handleLogout} />} />
                  <Route path="/magasinier/audit-fifo" element={<Navigate to="/magasinier/historique" replace />} />
                  <Route path="/magasinier/chat" element={<ChatMag userName={userName} onLogout={handleLogout} />} />
                  <Route path="/magasinier/parametres" element={<ParametresMag userName={userName} onLogout={handleLogout} />} />
                  <Route path="/" element={<Navigate to="/magasinier" replace />} />
                  <Route path="/magasinier/inventaire/:id" element={<FeuilleInventaireMag userName={userName} onLogout={handleLogout} />} />
                </>
              )}

              {userRole === ROLES.RESPONSABLE && (
                <>
                  <Route path="/responsable" element={<DashboardResp userName={userName} onLogout={handleLogout} />} />
                  <Route path="/responsable/produits" element={<ProduitsResp userName={userName} onLogout={handleLogout} />} />
                  <Route path="/responsable/pilotage" element={<PilotageResp userName={userName} onLogout={handleLogout} />} />
                  <Route path="/responsable/alertes" element={<Navigate to="/responsable/pilotage?tab=alertes" replace />} />
                  <Route path="/responsable/flux" element={<Navigate to="/responsable/transactions" replace />} />
                  <Route path="/responsable/inventaires" element={<InventairesResp userName={userName} onLogout={handleLogout} />} />
                  <Route path="/responsable/inventaires/lancer" element={<LancerInventaireResp userName={userName} onLogout={handleLogout} />} />
                  <Route path="/responsable/inventaires/a-valider" element={<InventairesAValiderResp userName={userName} onLogout={handleLogout} />} />
                  <Route path="/responsable/inventaires/analyse/:id" element={<AnalyseInventaireResp userName={userName} onLogout={handleLogout} />} />
                  <Route path="/responsable/analyse" element={<Navigate to="/responsable/pilotage?tab=analyse" replace />} />
                  <Route path="/responsable/surveillance" element={<Navigate to="/responsable/pilotage?tab=alertes" replace />} />
                  <Route path="/responsable/transactions" element={<TransactionsResp userName={userName} onLogout={handleLogout} />} />
                  <Route path="/responsable/historique" element={<Navigate to="/responsable/transactions" replace />} />
                  <Route path="/responsable/fournisseurs" element={<FournisseursPage userName={userName} onLogout={handleLogout} />} />
                  <Route path="/responsable/fournisseurs-legacy" element={<FournisseursResp userName={userName} onLogout={handleLogout} />} />
                  <Route path="/responsable/fournisseurs/nouveau" element={<NouveauFournisseurPage userName={userName} onLogout={handleLogout} />} />
                  <Route path="/responsable/fournisseurs/:id" element={<FicheFournisseurPage userName={userName} onLogout={handleLogout} />} />
                  <Route path="/responsable/fournisseurs/:id/modifier" element={<ModifierFournisseurPage userName={userName} onLogout={handleLogout} />} />
                  <Route path="/responsable/fournisseurs/:id/commandes" element={<FournisseurCommandesPage userName={userName} onLogout={handleLogout} />} />
                  <Route path="/responsable/fournisseurs/:id/produits" element={<FournisseurProduitsPage userName={userName} onLogout={handleLogout} />} />
                  <Route path="/responsable/fournisseurs/:id/documents" element={<FournisseurDocumentsPage userName={userName} onLogout={handleLogout} />} />
                  <Route path="/responsable/fournisseurs/:id/incidents" element={<FournisseurIncidentsPage userName={userName} onLogout={handleLogout} />} />
                  <Route path="/responsable/fournisseurs/:id/evaluation" element={<FournisseurEvaluationPage userName={userName} onLogout={handleLogout} />} />

                  <Route path="/responsable/commandes/nouvelle" element={<NouvelleCommandeFournisseurPage userName={userName} onLogout={handleLogout} />} />
                  <Route path="/responsable/commandes/:id" element={<CommandeFournisseurDetailsPage userName={userName} onLogout={handleLogout} />} />
                  <Route path="/responsable/categories" element={<CategoriesResp userName={userName} onLogout={handleLogout} />} />
                  <Route path="/responsable/consommation" element={<ConsommationResp userName={userName} onLogout={handleLogout} />} />
                  <Route path="/responsable/registre-chimique" element={<RegistreChimique userName={userName} onLogout={handleLogout} />} />
                  <Route path="/responsable/regles-stock" element={<ReglesStock userName={userName} onLogout={handleLogout} />} />
                  <Route path="/responsable/chatbot" element={<ChatbotResp userName={userName} onLogout={handleLogout} />} />
                  <Route path="/responsable/chat" element={<ChatResp userName={userName} onLogout={handleLogout} />} />
                  <Route path="/responsable/parametres" element={<ParametresResp userName={userName} onLogout={handleLogout} />} />
                  <Route path="/responsable/parametres/fournisseurs" element={<Navigate to="/responsable/fournisseurs" replace />} />
                  <Route path="/" element={<Navigate to="/responsable" replace />} />
                </>
              )}

              {userRole === ROLES.ADMIN && (
                <>
                  <Route path="/admin" element={<AdminDashboard userName={userName} onLogout={handleLogout} />} />
                  <Route path="/admin/utilisateurs" element={<AdminUsers userName={userName} onLogout={handleLogout} />} />
                  <Route path="/admin/ia" element={<AdminIA userName={userName} onLogout={handleLogout} />} />
                  <Route path="/admin/sessions" element={<AdminSessions userName={userName} onLogout={handleLogout} />} />
                  <Route path="/admin/rbac" element={<AdminRbac userName={userName} onLogout={handleLogout} />} />
                  <Route path="/admin/securite" element={<AdminSecurity userName={userName} onLogout={handleLogout} />} />
                  <Route path="/admin/parametres" element={<AdminSettings userName={userName} onLogout={handleLogout} />} />
                  <Route path="/admin/support" element={<AdminSupport userName={userName} onLogout={handleLogout} />} />
                  <Route path="/" element={<Navigate to="/admin" replace />} />
                </>
              )}

              {userRole === ROLES.DEMANDEUR && (
                <>
                  <Route path="/demandeur" element={<ProduitsDem userName={userName} onLogout={handleLogout} />} />
                  <Route path="/demandeur/mes-demandes" element={<MesDemandes userName={userName} onLogout={handleLogout} />} />
                  <Route path="/demandeur/parametres" element={<ParametresDem userName={userName} onLogout={handleLogout} />} />
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
