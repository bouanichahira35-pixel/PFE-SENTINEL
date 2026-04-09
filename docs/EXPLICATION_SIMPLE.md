# Guide simple (pour débutants)

## 1) C’est quoi cette application ?

PFE‑SENTINEL est une application web de **gestion de stock**.

- **Frontend (ce que tu vois dans le navigateur)** : React (dossier `src/`)
- **Backend (le serveur / l’API)** : Node.js + Express (dossier `backend/`)
- **Base de données** : MongoDB (les “tables” s’appellent plutôt **collections**)

Le frontend parle au backend via des URLs comme `http://localhost:5000/api/...`.

## 2) Les dossiers / fichiers les plus importants (en mots simples)

### Racine du projet

- `README.md` : comment démarrer le projet.
- `package.json` : la liste des librairies du frontend + commandes (`npm start`, `npm test`, etc.).
- `.env` / `.env.example` : réglages (URL API, etc.). (`.env` peut contenir des secrets).
- `public/` : fichiers “publics” servis par React (favicon, `index.html`, manifest…).
- `src/` : code du frontend (écrans, composants, appels API).
- `docs/` : documentation du projet.
- `diagrams/` : diagrammes (UML, cas d’utilisation, séquence…).

### Backend (`backend/`)

- `backend/server.js` : **point d’entrée** du serveur (démarre Express, configure la sécurité, branche les routes `/api/...`).
- `backend/db.js` : connexion à MongoDB (utilise `MONGODB_URI`).
- `backend/loadEnv.js` : charge les variables d’environnement (le fichier `.env`).

**Routes (les endpoints HTTP)**

Chaque fichier dans `backend/routes/` correspond à une “famille” d’API :

- `backend/routes/auth.js` : connexion, tokens, sessions, mot de passe oublié…
- `backend/routes/products.js` : produits.
- `backend/routes/categories.js` : catégories.
- `backend/routes/stock.js` : entrées/sorties/lots FIFO.
- `backend/routes/requests.js` : demandes.
- `backend/routes/inventory.js` : inventaires (sessions + comptages).
- `backend/routes/suppliers.js` / `backend/routes/purchase-orders.js` : fournisseurs + bons de commande.
- `backend/routes/chat.js` : messagerie.
- `backend/routes/ai.js` : IA (alertes, prédictions, copilote).
- `backend/routes/admin.js` : actions admin (gestion avancée).
- et le reste : settings, notifications, rapports, fichiers, audit sécurité…

**Models (la “forme” des données dans la base)**

Les fichiers `backend/models/*.js` décrivent les **collections MongoDB** (l’équivalent de “tables”).
Exemples :

- `backend/models/User.js` : un utilisateur.
- `backend/models/Product.js` : un produit.
- `backend/models/Request.js` : une demande.
- `backend/models/StockEntry.js` / `StockExit.js` / `StockLot.js` : mouvements de stock + lots FIFO.

**Middlewares (les “filtres” avant les routes)**

Dans `backend/middlewares/` :

- `requireAuth.js` : bloque si pas connecté.
- `requireRole.js` / `requirePermission.js` : contrôle des droits (RBAC).
- `idempotencyGuard.js` : évite de créer deux fois la même action si on double-clique / recharge.
- `perfMonitor.js` / `requestContext.js` : ajout d’infos de suivi (request id, durée…).

**Services (logique métier réutilisable)**

Dans `backend/services/` :

- `transactionService.js` : “moteur” pour appliquer une action de façon sûre (écritures, historique…).
- `rbacPolicyService.js` : règles d’autorisations.
- `mailerService.js` / `mailQueueService.js` : envoi d’emails (avec queue Redis si activée).
- `alertService.js` / `aiModelService.js` / `aiGovernanceService.js` : partie IA (prédictions + alertes + entraînement auto).
- `twilioService.js` : SMS (si activé).

**Scripts**

Dans `backend/scripts/` : scripts de test/seed/migration (données de démo, export dataset IA, etc.).

**IA Python**

Dans `backend/ai_py/` : scripts Python (features, modèles, entraînement, score, copilote…).
Ils sont optionnels si l’IA tourne en “fallback” côté Node.

### Frontend (`src/`)

- `src/index.js` : démarre React et affiche l’app.
- `src/App.js` : routeur + structure globale.
- `src/services/api.js` : “client API” : toutes les requêtes vers le backend.
- `src/pages/` : **écrans** (un fichier = une page) classés par rôle :
  - `src/pages/demandeur/` : écrans demandeur
  - `src/pages/magasinier/` : écrans magasinier
  - `src/pages/responsable/` : écrans responsable
  - `src/pages/admin/` : écrans admin
  - `src/pages/supplier/` : portail fournisseur
- `src/components/` : **briques UI** réutilisables (table, sidebar, header, scanner QR…).
- `src/utils/` : petites fonctions utilitaires (langue UI, statuts…).

## 3) La base de données (MongoDB) : “tables” = collections

MongoDB stocke des **documents JSON** dans des **collections**.
Dans ce projet, chaque fichier `backend/models/<Nom>.js` correspond à une collection.

### Collections principales (cœur métier)

- `User` (`backend/models/User.js`) : comptes (email, rôle, téléphone, statut…).
- `Category` (`backend/models/Category.js`) : catégories de produits (avec audiences demandeur).
- `Product` (`backend/models/Product.js`) : produits (code, famille, quantité, seuil, catégorie, statut…).
- `Request` (`backend/models/Request.js`) : demandes de sortie (produit, demandeur, quantité, statut…).
- `StockEntry` (`backend/models/StockEntry.js`) : entrées en stock (bon d’entrée, fournisseur, quantité, pièces jointes…).
- `StockLot` (`backend/models/StockLot.js`) : lots FIFO (lié à un produit, quantité dispo, date péremption…).
- `StockExit` (`backend/models/StockExit.js`) : sorties (bon de sortie, demande liée, lots consommés…).
- `InventorySession` / `InventoryCount` : inventaires (session + lignes de comptage).
- `Supplier` / `SupplierProduct` : fournisseurs + association fournisseur↔produit (prix, délai).
- `PurchaseOrder` : bons de commande (fournisseur, lignes, statut, incidents, réception…).

### Collections “suivi / sécurité / qualité”

- `History` : journal des actions (append‑only : on ajoute, on ne modifie pas).
- `SecurityAudit` : événements de sécurité (login, reset password, token rejeté…).
- `UserSession` : sessions actives (device, IP, expiration…).
- `PasswordReset` : demandes de réinitialisation (OTP hash, expiration…).
- `Notification` : notifications UI (lues / non lues).
- `AppSetting` : réglages globaux.
- `IdempotencyKey` : anti-doublons côté API.
- `FifoScanAudit` : audit des scans FIFO (match/mismatch…).

### Collections IA / Copilote

- `AIAlert` : alertes IA (anomalie / rupture / surconsommation).
- `AIPrediction` : prédictions (rupture/consommation + période + confiance).
- `AIAssistantTrace` : traces du chatbot (question, réponse, latence…).
- `AIRecommendationTrace` : traces des recommandations appliquées (avant/après, quantité commandée…).
- `DecisionAssignment` / `DecisionResolution` : décisions assignées/résolues (pilotage/coplote).

## 4) Les liens importants entre collections (version simple)

- Un `Product` peut avoir une `Category` (`product.category`).
- Une `Request` pointe vers :
  - le `User` demandeur (`request.demandeur`)
  - le `Product` demandé (`request.product`)
  - parfois la `StockExit` créée (`request.stock_exit`)
- Une `StockEntry` pointe vers :
  - le `Product` (`stockEntry.product`)
  - le `User` magasinier (`stockEntry.magasinier`)
- Une `StockLot` pointe vers :
  - le `Product` (`stockLot.product`)
  - parfois la `StockEntry` (`stockLot.entry`)
- Une `StockExit` pointe vers :
  - le `Product` (`stockExit.product`)
  - le `User` magasinier (`stockExit.magasinier`)
  - parfois la `Request` (`stockExit.request`)
  - et la liste des lots consommés (`stockExit.consumed_lots[]`)
- Un `PurchaseOrder` pointe vers :
  - un `Supplier`
  - des lignes avec `Product`
  - des entrées reçues (`received_entries` -> `StockEntry`)

## 5) Où regarder si tu veux “comprendre vite”

- Le backend démarre ici : `backend/server.js`
- La connexion DB est ici : `backend/db.js`
- Les API sont ici : `backend/routes/*.js`
- Les “tables”/collections sont ici : `backend/models/*.js`
- Le frontend démarre ici : `src/index.js` puis `src/App.js`
- Les pages sont ici : `src/pages/**`

