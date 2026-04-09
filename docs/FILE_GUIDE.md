# FILE_GUIDE – “qui fait quoi” (simple)

## Frontend (React)
- `src/App.js` : routes principales (par rôle).
- `src/services/api.js` : appels API (frontend → backend).
- `src/components/shared/` : composants communs (Header, Toast, etc.).
- `src/components/responsable/SidebarResp.jsx` : menu Responsable.
- `src/components/admin/SidebarAdmin.jsx` : menu Admin.

### Pages Demandeur
- `src/pages/demandeur/ProduitsDem.jsx` : catalogue + demande.
- `src/pages/demandeur/MesDemandes.jsx` : suivi des demandes.
- `src/pages/demandeur/ParametresDem.jsx` : profil + notifications.

### Pages Magasinier
- `src/pages/magasinier/InboxMag.jsx` : demandes à traiter.
- `src/pages/magasinier/EntreeStock.jsx` : entrées stock.
- `src/pages/magasinier/SortieStock.jsx` : sorties stock.
- `src/pages/magasinier/AjouterProduit.jsx` : création produit.

### Pages Responsable
- `src/pages/responsable/DashboardResp.jsx` : pilotage + alertes IA.
- `src/pages/responsable/PilotageResp.jsx` : décisions / alertes.
- `src/pages/responsable/TransactionsResp.jsx` : historique mouvements.
- `src/pages/responsable/FournisseursResp.jsx` : fournisseurs + emails.
- `src/pages/responsable/ChatbotResp.jsx` : assistant IA.
- `src/pages/responsable/ParametresResp.jsx` : règles + IA état.

### Pages Admin IT
- `src/pages/admin/AdminDashboard.jsx` : health score + incidents.
- `src/pages/admin/AdminSettings.jsx` : paramètres techniques.
- `src/pages/admin/AdminSecurity.jsx` : audit sécurité.
- `src/pages/admin/AdminUsers.jsx` : gestion comptes.
- `src/pages/admin/AdminSessions.jsx` : sessions actives.

---

## Backend (Node/Express)
- `backend/server.js` : point d’entrée serveur.
- `backend/routes/` : routes API par module.
- `backend/models/` : schémas MongoDB.
- `backend/services/` : logique métier, mails, IA, notifications.
- `backend/middlewares/` : auth, RBAC, sécurité.

### Routes importantes
- `backend/routes/auth.js` : login / refresh / logout.
- `backend/routes/requests.js` : demandes + workflow.
- `backend/routes/stock.js` : entrées/sorties stock.
- `backend/routes/ai.js` : IA + alertes + chatbot.
- `backend/routes/admin.js` : admin IT + incidents.
- `backend/routes/suppliers.js` : fournisseurs + mails.

### Services clés
- `backend/services/alertService.js` : alertes stock + notifications.
- `backend/services/mailQueueService.js` : envoi emails.
- `backend/services/adminIncidentService.js` : incidents techniques (admin).
- `backend/services/userPreferencesService.js` : prefs notifications.

---

## Base de données (MongoDB)
Schémas dans `backend/models/` :
- `User.js` : utilisateurs (rôles + profils).
- `Product.js` : produits.
- `Request.js` : demandes.
- `StockEntry.js` / `StockExit.js` : mouvements.
- `Notification.js` : notifications internes.
- `PurchaseOrder.js` : commandes fournisseurs.

