# PFE-SENTINEL — Rapport contradictions / incoherences (champs, collections, workflows, UI, logique)

Ce document liste les contradictions (reelles ou potentielles) observees dans le depot `C:\PFE-SENTINEL`, et propose des resolutions.

## A) Contradictions "donnees" (collections/champs)

### A1) `User` sans `timestamps` alors que le reste en a
- Constat:
  - Beaucoup de schemas utilisent `{ timestamps: true }` (Product, Request, History, StockEntry, ...).
  - `backend/models/User.js` n'a pas `timestamps` et utilise `date_creation` / `last_login`.
- Risque:
  - Reporting et tris "createdAt/updatedAt" non uniformes.
  - Certains ecrans/exports peuvent supposer l'existence de `createdAt`.
- Suggestion:
  - OK (corrige): `User` utilise maintenant `{ timestamps: true }` tout en conservant `date_creation/last_login` (legacy).
  - Backfill optionnel pour l'existant: `backend/scripts/backfill-user-timestamps.js`.

### A2) Statuts "legacy" dans `Request.status`
- Constat:
  - Enum Request inclut `accepted/refused` (legacy) et `validated/rejected` (canonique).
  - La route `backend/routes/requests.js` remappe `accepted -> validated`, `refused -> rejected`.
- Risque:
  - UI peut afficher des libelles differents (acceptation vs validation) selon documents.
  - Analytics/filtrage par status peut rater des elements si pas normalise partout.
- Suggestion:
  - OK (corrige): l'API renvoie un `status` canonique et le filtrage inclut aussi les valeurs legacy (validated inclut accepted, rejected inclut refused).
  - Migration de donnees (batch) disponible: `backend/scripts/migrate-request-statuses.js` (convertit accepted/refused -> validated/rejected).

### A3) "Status produit derive" vs etats bloquants (`bloque`, `archived`)
- Constat:
  - Regle metier: status derive de `quantity_current` et `seuil_minimum` (ok/sous_seuil/rupture).
  - Le schema autorise aussi `bloque` et l'archivage (`lifecycle_status=archived`) positionne `status=bloque`.
  - Les routes stock recalculent le status via des fonctions `computeProductStatus(...)`.
  - Des gardes existent: les routes stock refusent les operations si `lifecycle_status != active` (vu dans `backend/routes/stock.js`).
- Risque:
  - Si un jour une operation modifie le stock sans controler `lifecycle_status`, le recalcul peut "debloquer" un produit involontairement.
- Suggestion:
  - Centraliser la regle: `computeProductStatus` doit respecter un statut bloquant (si bloque -> reste bloque).
  - OU imposer partout la condition "active" avant tout mouvement (et la tester).

### A4) Nommage dates heterogene
- Constat:
  - `Request` contient des champs legacy (`date_acceptance`, `date_processing`) en plus des champs canoniques (`validated_at`, `prepared_at`...).
  - `StockEntry`/`StockExit` utilisent `date_entry`/`date_exit` + `createdAt`.
- Risque:
  - Difficulte a standardiser reporting/periodes.
- Suggestion:
  - Fournir des champs "computed" dans API (ex: `effective_date`) pour ecrans/exports.

## B) Contradictions "workflows" (metier)

### B1) Qui valide une demande ? (responsable vs magasinier)
- Constat:
  - Doc metier: "Magasinier traite: accepte/refuse" (legacy).
  - Architecture actuelle: workflow canonique introduit `validated` (coherent avec Responsable), puis `preparing/served` (Magasinier).
- Risque:
  - Ambiguite organisationnelle: dans certaines equipes, la validation peut rester magasinier.
- Suggestion:
  - Clarifier regle metier: soit Responsable valide toujours, soit Magasinier peut valider selon type/profil (et l'exprimer via permissions + UI).
  - Si les 2 sont possibles: expliciter le "decision maker" (champ `validated_by` deja present).

### B2) Confirmation de reception
- Constat:
  - `confirm-receipt` exige parfois un `receipt_token`.
  - Le token peut etre vide (confirmation sans code) selon donnees.
- Risque:
  - Incoherence UX si certains services demandent un code et d'autres non, sans regle claire.
- Suggestion:
  - Ajouter une regle explicite: exiger token uniquement pour sorties "bon interne" ou pour priorites critiques, etc.

## C) Contradictions "UI / navigation"

### C1) Page `RoleSelection` presente mais non routee
- Constat:
  - `src/pages/RoleSelection.jsx` existe (selection profil).
  - `src/App.js` (mode non authentifie) route vers `/login` et `/mot-de-passe-oublie`, mais ne route pas vers `RoleSelection`.
- Risque:
  - Divergence entre idee UX ("choisir un role") et comportement reel (login direct).
- Suggestion:
  - Soit supprimer `RoleSelection` si obsolete,
  - soit l'activer (ex: route `/` -> `RoleSelection`) et rediriger vers `/login/:role` si vous reinstaurez un login par role.

### C2) `ProtectedRoute` present mais non utilise
- Constat:
  - `src/ProtectedRoute.jsx` existe.
  - La protection est implementee dans `App.js` via rendu conditionnel selon `isAuthenticated` et `userRole`.
- Risque:
  - Dette de code mort (maintenance, confusion).
- Suggestion:
  - Supprimer `ProtectedRoute` si non necessaire, OU refactor pour l'utiliser.

### C3) Timeout UI (15 min) vs politique backend
- Constat:
  - UI: `SESSION_TIMEOUT_MS = 15 * 60 * 1000` et logique de deconnexion automatique (App).
  - Backend: access token 15m, refresh 7j, session inactivity par defaut 2h (configurable).
- Risque:
  - Deconnexion prematuree cote UI meme si backend accepterait un refresh.
- Suggestion:
  - Aligner la UI sur la politique backend:
    - soit retirer le timeout UI et laisser backend + refresh gerer,
    - soit faire du timeout UI un reflet de `JWT_EXPIRES_IN` et de `SESSION_INACTIVITY_MS` (exposes par endpoint).

## D) Contradictions "logique / securite"

### D1) Secrets QR (dev fallback) vs exigences prod
- Constat:
  - `qrTokenService` force `INTERNAL_BOND_QR_SECRET` en production, fallback en dev sur `JWT_SECRET` ou un secret de dev.
- Risque:
  - Mauvaise configuration prod -> health degraded/unhealthy; c'est positif (fail safe), mais doit etre documente.
- Suggestion:
  - Documenter clairement dans un guide deployment et ajouter un check CI (si vous avez un mode "prod config lint").

### D2) Transactions Mongo et mode standalone
- Constat:
  - `runInTransaction` fallback quand Mongo standalone (transactions non supportees).
- Risque:
  - En dev, des operations multi-doc peuvent etre partiellement appliquees en cas d'erreur.
- Suggestion:
  - En dev, preferer Mongo replica set (docker compose) pour tester les transactions.

## E) Contradictions "UI couleurs / design"

### E1) Palette et theming non uniformes entre roles/pages
- Constat:
  - Certaines pages utilisent des styles/palettes tres specifiques (ex: RoleSelection avec couleurs role, Dashboard/Pilotage avec autres accents).
  - Un dark mode existe (`useTheme`) mais toutes les pages n'ont pas forcement des variables CSS communes.
- Risque:
  - Incoherence visuelle: memes composants (boutons/tables) pas toujours identiques.
- Suggestion:
  - Introduire des variables CSS globales (tokens) et les utiliser partout (couleurs, radius, ombres).
  - Passer progressivement les pages vers des composants partages (AppTable, HeaderPage, etc.).

## F) Actions recommandees (ordre propose)

1. Aligner timeout UI vs backend (impact UX + support).
2. Clarifier et normaliser les statuts Request (migration + API always canonical).
3. Uniformiser `User` (timestamps, champs dates, conventions).
4. Activer ou supprimer `RoleSelection` et `ProtectedRoute`.
5. Centraliser la regle "status produit" (bloque/archived prioritaire).
