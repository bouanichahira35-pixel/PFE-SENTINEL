# Cahier des charges — PFE-SENTINEL

> Document généré à partir de l’analyse du dépôt `c:\PFE-SENTINEL` (frontend React, backend Node/Express, MongoDB, Redis optionnel, IA Python + Gemini optionnel).
>
> Références utiles déjà présentes dans le dépôt :
> - `docs/AZ_APPLICATION_REVIEW.md` (rapport fonctionnel + technique détaillé)
> - `docs/USE_CASES_GLOBAL_AND_SPRINTS.md`, `docs/BACKLOG_5_SPRINTS.md` (cas d’utilisation / user stories)
> - `backend/docs/ARCHITECTURE.md`, `backend/docs/BUSINESS_RULES.md` (architecture & règles métier)

## 1) Contexte & objectif

PFE-SENTINEL est une application web de **gestion de stock** orientée processus (demandes, validation, entrées/sorties, inventaires, approvisionnement) avec :
- **Traçabilité** : historique métier immuable + audit sécurité.
- **Opérations stock** : gestion **FIFO par lots**, documents, pièces jointes, QR (selon usage).
- **Aide à la décision** (optionnel) : alertes, prédictions, copilote, assistant “Responsable”.

Objectif : fournir une solution exploitable en contexte “ETAP”/industriel, avec séparation claire des responsabilités par rôle.

## 2) Périmètre

### Inclus (fonctionnel)
- Authentification, sessions et gestion des droits (RBAC).
- Catalogue produits + catégories + statut/validation.
- Demandes de sortie : création, validation, préparation, service, confirmation de réception.
- Stock : entrées/sorties, lots FIFO, annulation, historisation.
- Inventaire : sessions, comptage, clôture, application (ajustements).
- Fournisseurs & commandes : fournisseurs, bons de commande, réception en stock.
- Notifications in-app.
- Chat (collaboration) + assistant IA (optionnel).
- Console Admin IT : supervision, sécurité, sessions, gouvernance IA (selon droits).

### Hors périmètre (à confirmer / non prioritaire)
- Multi-entrepôts avancé / WMS complet (tracking par emplacement granulaire), sauf si étendu via `locations`.
- Comptabilité / facturation / ERP intégré (connecteurs).
- SSO (SAML/OIDC) (auth actuelle : login + JWT + refresh).

## 3) Parties prenantes & acteurs

Acteurs humains (rôles techniques) : `demandeur`, `magasinier`, `responsable`, `admin` (voir `backend/constants/roles.js`).

### Responsabilités clés
- **Demandeur** : consulte catalogue, crée des demandes, suit ses demandes, confirme réception.
- **Magasinier** : gère opérations stock, prépare/sert demandes, gère inventaires (comptage).
- **Responsable** : valide/rejette demandes, gouverne catalogue (validation produits), suit KPIs/alertes, gère fournisseurs/commandes, applique inventaires.
- **Admin IT** : supervision technique, gestion utilisateurs/sessions, audit sécurité, configuration technique/IA.
- **Fournisseur (optionnel)** : interactions via emails / portail fournisseur (selon configuration).

## 4) Architecture (vue synthèse)

### Frontend (React)
- Application SPA (Create React App), routage par rôle dans `src/App.js`.
- Pages par rôle dans `src/pages/*`.
- Client API centralisé dans `src/services/api.js` (auth Bearer + refresh).
- Application PWA (Service Worker) pour cache et usage en “zones blanches” (mode hors-ligne).
- File locale des actions (ex. IndexedDB) + synchronisation/réconciliation automatique (retry-queue + idempotence).

### Backend (Node.js / Express)
- Point d’entrée : `backend/server.js` (middlewares + routes `/api/*`).
- Persistance : MongoDB (schémas Mongoose dans `backend/models/*.js`).
- Services transverses : `backend/services/*` (transactions, RBAC, mails, IA…).
- Middlewares : `backend/middlewares/*` (auth, permissions, idempotence, monitoring).

### Principales routes API (non exhaustif)
Montage dans `backend/server.js` :
- Auth : `/api/auth`
- Produits / Catalogue : `/api/products`, `/api/categories`
- Stock : `/api/stock`
- Demandes : `/api/requests`
- Historique : `/api/history`
- Inventaire : `/api/inventory`
- Fournisseurs & commandes : `/api/suppliers`, `/api/purchase-orders`
- Chat : `/api/chat`
- IA : `/api/ai` (optionnel : Python/Gemini)
- Admin IT : `/api/admin`, `/api/users`, `/api/security-audit`, `/api/settings`
- Notifications : `/api/notifications`
- Fichiers : `/api/files`
- Portail fournisseur : `/api/supplier-portal`

## 5) Processus métier (workflows)

### 5.1 Workflow “Demande”
Statuts de référence (voir aussi `backend/docs/BUSINESS_RULES.md`) :
1. `pending` : demande créée par le demandeur
2. `validated` / `rejected` : décision du responsable
3. `preparing` : préparation magasinier
4. `served` : servie (doit être liée à une `StockExit`)
5. `received` : confirmation réception par demandeur (si activée)
6. `cancelled` : annulation (selon règles)

### 5.2 Workflow “Stock FIFO”
- **Entrée stock** : création d’une `StockEntry`, création/maj de `StockLot` (lots FIFO).
- **Sortie stock** : création d’une `StockExit` qui **consomme les lots** du plus ancien au plus récent.
- **Contrôles** :
  - refus si stock insuffisant ;
  - création d’un lot “technique” si données legacy sans lots (cohérence FIFO).
- **Option péremption (FEFO)** : si une date de péremption est renseignée sur un lot, priorité au lot le plus proche d’expiration.
- **Unités & conversions** : quantités gérées dans une unité de base par produit, avec conversions contrôlées (L, m³, tonnes, bidons…) et densité si nécessaire (massique ↔ volumique).

### 5.3 Workflow “Inventaire”
- Session inventaire : création d’une `InventorySession`.
- Comptage : enregistrement de lignes `InventoryCount`.
- Clôture : fermeture de session (plus de saisie).
- Application : ajustements stock (via mouvements) + historisation.

### 5.4 Workflow “Approvisionnement”
- Gestion fournisseurs : `Supplier`, `SupplierProduct`.
- Bon de commande : `PurchaseOrder` (brouillon → commandé → livré/reçu/annulé).
- Réception : transformation en entrée stock (création `StockEntry`/`StockLot`).

## 6) Besoins fonctionnels (extraits structurés)

Les besoins ci-dessous sont dérivés des pages frontend (`src/pages/**`) + routes backend (`backend/routes/**`) + permissions (`backend/constants/permissions.js`).

### 6.1 Authentification & sessions
- Connexion utilisateur (identifiant + mot de passe).
- Gestion tokens : access token + refresh token ; refresh automatique côté UI.
- Déconnexion : logout simple et “logout-all” (révocation sessions).
- “Mot de passe oublié” : OTP (email/SMS/WhatsApp selon config).

### 6.2 RBAC (droits par permission)
- Application d’un contrôle d’accès sur chaque endpoint sensible.
- Rôles techniques et permissions attendues (source : `backend/constants/permissions.js`) :
  - Demandeur : lecture produits + création demande + lecture ses demandes.
  - Magasinier : opérations stock + inventaires + consultation demandes + fichiers.
  - Responsable : validation demandes + gouvernance catalogue + pilotage.
  - Admin IT : sécurité, gestion utilisateurs, supervision sessions.

### 6.3 Catalogue produits & catégories
- Lecture catalogue (filtré par audience/profil si activé).
- Création/modification produit (magasinier/responsable).
- Validation/archivage/suppression (responsable).
- Catégories : création/édition + association produits.
- Statut produit dérivé (OK / sous-seuil / rupture) selon stock & seuil minimum.

### 6.4 Demandes (demandeur ↔ responsable ↔ magasinier)
- Créer une demande (produit, quantité, motif/contexte).
- Consulter ses demandes + statuts.
- Validation/rejet par responsable.
- Préparation/service par magasinier, avec sortie stock liée.
- Confirmation réception (optionnelle) par demandeur.
- Notifications in-app sur événements clés (création, validation, service…).

### 6.5 Stock (entrées/sorties, lots FIFO, documents)
- Créer entrée stock avec pièces jointes.
- Gérer lots (FIFO/FEFO si activé) : quantité disponible, péremption (si utilisée), unité de base + conversions.
- Créer sortie stock (FIFO/FEFO auto) en consommant des lots de manière atomique (transaction) et en refusant si insuffisant.
- Annulation : créer une contre-passation (mouvement inverse) plutôt que modifier/supprimer le mouvement initial (audit).
- Historique des mouvements consultable (traçabilité).
- QR code : scan/génération (selon écrans et usage), idéalement au niveau du lot (traçabilité terrain).
- Preuve de réception : possibilité de signature numérique/attestation (selon contexte et exigences légales).

### 6.6 Inventaires
- Créer session inventaire.
- Enregistrer comptages (par produit/lot si requis).
- Clôturer puis appliquer les ajustements avec trace.

### 6.7 Fournisseurs & commandes
- CRUD fournisseurs.
- Créer des bons de commande, gérer statut.
- Réceptionner une commande en stock.
- (Optionnel) Portail fournisseur / emails automatisés.

### 6.8 Reporting, historique & audit
- Consultation de l’historique métier (append-only).
- Accès Admin à l’audit sécurité (événements auth/sessions…).
- Exports/rapports (selon endpoints `reports`).

### 6.9 IA / assistant (optionnel)
- Tableau de bord responsable : alertes et prédictions simples (seuils de réapprovisionnement, tendances de consommation).
- Copilote : recommandations (lecture + traces d’application).
- Assistant responsable : questions → mini-rapports basés sur faits, avec guardrails “lecture seule”.
- Traces assistant consultables (latence, mode, sources).

### 6.10 Mode hors-ligne & synchronisation (MUST)
- Permettre la consultation en lecture (catalogue, demandes, historique récent) en mode hors-ligne via cache PWA.
- Permettre la saisie en mode déconnecté (mouvements stock, comptages inventaire, réception) avec file d’attente locale.
- Synchronisation automatique au retour réseau : replays, retry/backoff, idempotence (anti-doublons) et résolution de conflits.
- Réconciliation auditée : aucune suppression “silencieuse” ; traçabilité conservée (horodatage, utilisateur, device si utile).
- UX : indicateur offline/online, statut “en attente de synchronisation”, et messages d’erreur explicites.

## 7) Règles métier (exigences)

Source : `backend/docs/BUSINESS_RULES.md` (synthèse) :
- Produit doit être **approuvé** pour autoriser entrée/sortie.
- QR code unique.
- Sorties FIFO : consommation par ancienneté, refus si insuffisant (ou FEFO si péremption activée).
- Demande servie doit être liée à une sortie stock valide.
- Historique métier immuable ; audit sécurité séparé.
- Annulation d’un mouvement : contre-passation (mouvement inverse) ; pas de modification/suppression du mouvement d’origine.
- Unités : quantités persistées dans une unité de base avec conversions contrôlées (densité si massique ↔ volumique).
- Flux FIFO/FEFO multi-lots : opérations atomiques (transaction MongoDB) pour éviter les incohérences.
- Blocage utilisateurs : responsable autorisé, motif obligatoire, interdictions (auto-blocage / blocage responsable).
- Notifications : in-app ; email asynchrone via queue si Redis dispo.

## 8) Besoins non fonctionnels (NFR)

### 8.1 Sécurité
- Auth JWT + sessions revocables ; gestion inactivité.
- RBAC par permissions ; moindre privilège (admin IT sans flux métier).
- Journalisation : `History` (métier), `SecurityAudit` (sécurité).
- Protection endpoints sensibles : rate limiting (au moins sur auth/IA/chat).
- Gestion des secrets via `.env.local` hors VCS (voir `docs/SECURITY_CHECKLIST.md`).

### 8.2 Fiabilité & robustesse
- Idempotence sur actions critiques (anti-doublons).
- Transactions ou opérations atomiques pour flux stock/demandes (notamment sorties FIFO/FEFO multi-lots).
- Healthcheck API (`GET /api/health`) + niveaux `ok/degraded/unhealthy`.

### 8.3 Performance
- Réponses interactives UI (objectif : < 2s pour pages usuelles).
- Pagination/filtrage sur listes (produits, demandes, historique…).
- Cache TTL côté IA si activée (prédictions/copilote) pour réduire latence.

### 8.4 Exploitabilité (Ops)
- Logs structurés (request id, latence) pour diagnostic.
- Docker compose disponible pour backend + Mongo + Redis.
- Scripts de seed/démo pour préparer des données stables.

### 8.5 Maintenabilité & évolutivité
- Séparation claire : routes (orchestration), services (métier), modèles (schémas).
- Contrats API stables ; validations de payloads.
- Tests non-régression backend + CI (workflows GitHub).

### 8.6 Données & conformité (à préciser)
- Politique de rétention : historiques et audit (durée, anonymisation).
- Sauvegarde/restauration MongoDB (RPO/RTO).

### 8.7 Résilience réseau (zones blanches)
- L’application doit rester exploitable avec connectivité dégradée (offline-first pour les écrans terrain critiques).
- La synchronisation doit être sûre (idempotence, reprises sur erreur, détection de doublons, journalisation).
- Les opérations stock/inventaire doivent préserver la cohérence (transactions ou mécanismes de compensation).

## 9) Critères d’acceptation (DoD recommandé)

Pour chaque fonctionnalité livrée :
- Accès protégé (Auth + RBAC) + validations d’entrée.
- Événements `History` pour actions critiques (stock, transitions demande, inventaire).
- Audit sécurité pour auth/sessions et actions admin sensibles.
- UI : messages d’erreur explicites, pas de “pages vides”.
- Hors-ligne : scénarios “zone blanche” testés (saisie → file locale → synchronisation → réconciliation).
- Tests minimum : chemins critiques + guardrails (surtout pour IA/assistant).

## 10) Livrables attendus (PFE / projet)

- Application web (frontend + backend) exécutable en local (et Docker côté backend).
- Documentation : use cases, backlog, règles métier, guide de démo.
- Jeu de données de démo + scripts de préparation.
- Rapport de soutenance (architecture, choix techniques, résultats, limites, perspectives).

## 11) Axes d’innovation (optionnel mais valorisant en soutenance)

- FEFO + alertes péremption (produits chimiques) : alerting et priorisation de sortie par date d’expiration.
- Preuve numérique terrain : signature/attestation (réception ou sortie) comme élément de preuve en contexte isolé.
- QR code “par lot” : identification physique du bon bidon/lot (date, lot, péremption), pas seulement du produit.
- Analyse “dead stock” : détection de stock dormant (rotation faible) pour optimisation d’espace et réapprovisionnement.
