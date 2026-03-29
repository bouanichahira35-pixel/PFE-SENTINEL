# Backlog global + backlogs par sprint (5 sprints) - format "User Stories"

Contexte: SENTINEL (PFE) - frontend React, backend Node/Express, MongoDB, IA Python + Gemini (optionnel).

Notation:
- **PB-xx**: Product Backlog (global).
- **Sx-yy**: Sprint Backlog (Sprint x).
- "Points" = estimation simple (S/M/L) ou (1/2/3/5/8) selon preference; ici j'utilise **S/M/L** pour rester global.

## Format exemplaire (pour guider la division en sprints)

Chaque item est ecrit en **User Story**:
- **En tant que** (acteur)
- **Je veux** (besoin)
- **Afin de** (valeur)

Avec:
- **Criteres d'acceptation** (Given/When/Then ou check-list)
- **Taches techniques** (API/UI/DB/Tests/Docs)

Definition of Done (DoD) (commune)
- API protegee (Auth + RBAC) + validations.
- Trace metier `History` ecrite pour les mouvements/process critiques.
- UI fonctionnelle (role routing) + messages d'erreur clairs.
- Logs/audit securite pour auth + actions admin sensibles.

---

## 1) Product Backlog (global)

### Epic E0 - Administration (informatique / exploitation)
- **PB-00** Console Admin (informatique) pour superviser l'etat du systeme (Mongo, SMTP, IA, services) + actions de maintenance.
- **PB-00a** Gestion des utilisateurs (liste, blocage/deblocage, revocation de sessions, audit des actions sensibles).
- **PB-00b** Gouvernance IA (activation/desactivation des modules IA, recalcul des alertes, entrainement modele, diagnostics).
- **PB-00c** Gestion des incidents (journal, alertes critiques, digest email admin en cas de panne services).

### Epic E1 - Auth & securite
- **PB-01** Login (identifier/password) + JWT access + refresh.
- **PB-02** Refresh auto cote frontend + revoke sessions (logout / logout-all).
- **PB-03** Mot de passe oublie (OTP) via email/SMS/WhatsApp (optionnel selon config).
- **PB-04** RBAC par permissions + middlewares (requireAuth/requirePermission).
- **PB-05** Security audit (login/logout/reset) + IP + user-agent + masquage email.
- **PB-06** Rate limiting sur auth / chat / IA + healthcheck.

### Epic E2 - Catalogue & gouvernance produit
- **PB-07** CRUD Product (creation magasinier) + validation responsable + archivage.
- **PB-08** Categories + audiences (visibilite catalogue par role/profil).
- **PB-09** Seuil minimum + statut derive (ok/sous_seuil/rupture) + blocage.

### Epic E3 - Demandes (process)
- **PB-10** Workflow Request (pending->validated->preparing->served->received + rejet/cancel).
- **PB-11** Notifications in-app + preferences (email optionnel).
- **PB-12** Confirmation reception (receipt_token optionnel).

### Epic E4 - Stock FIFO (operations)
- **PB-13** Entree stock (StockEntry) + pieces jointes + numeros (BE-YYYY-xxxxx).
- **PB-14** Lots FIFO (StockLot) + peremption + QR (optionnel).
- **PB-15** Sortie stock (StockExit) FIFO auto + scan QR (optionnel) + annulation.
- **PB-16** Bon interne (QR signe) (optionnel) + anti-rejeu.

### Epic E5 - Inventaires
- **PB-17** Sessions inventaire (INV-YYYY-xxxxx) + comptage + cloture.
- **PB-18** Application inventaire (ajustements StockEntry/StockExit) + History.

### Epic E6 - Fournisseurs & commandes
- **PB-19** Suppliers (CRUD) + association produits (SupplierProduct).
- **PB-20** Purchase Orders (draft->ordered->delivered/cancelled) + reception -> StockEntry.

### Epic E7 - Collaboration (chat)
- **PB-21** Conversations (direct/thread/chatbot) + messages + read_by.
- **PB-22** Contextualisation (lien vers product/request/inventory/po).

### Epic E8 - IA & aide a la decision
- **PB-23** Alertes IA (AIAlert) + statut (new/reviewed) + revue responsable.
- **PB-24** Predictions (AIPrediction) + exports/metrics basiques.
- **PB-25** Copilote (recommandations) + application tracee (AIRecommendationTrace).
- **PB-26** Assistant Responsable (chat/report/voix optionnel) + guardrails (lecture seule).
- **PB-27** Traces assistant (AIAssistantTrace) + consultation des traces.
- **PB-28** Inbox magasinier (decisions assignees) + resolution.

---

## 2) Sprint backlogs (5 sprints)

## Sprint 1 - Auth & Sessions (securite de base)
Objectif: acces fiable + base securite + audit.

### User stories (exemplaire)

- **S1-US1 (M)** En tant qu'utilisateur, je veux me connecter avec mon identifiant et mot de passe afin d'acceder a l'application selon mon role.
  - Criteres d'acceptation:
    - Given un compte actif, When je POST `/api/auth/login`, Then je recois `{token, refreshToken, session_id}`.
    - Given un mot de passe incorrect, Then je recois une erreur claire (sans fuite d'info).
  - Taches techniques: API login + validations, UI login, ecriture `SecurityAudit`.

- **S1-US2 (M)** En tant qu'utilisateur, je veux que ma session reste valide sans ressaisir mon mot de passe afin de ne pas etre deconnecte pendant le travail.
  - Criteres d'acceptation:
    - When un endpoint renvoie 401, Then le frontend tente `POST /api/auth/refresh` puis rejoue la requete.
    - Then l'utilisateur reste sur la meme page (si refresh OK).
  - Taches techniques: interceptor API frontend + endpoint refresh.

- **S1-US3 (M)** En tant qu'admin/responsable, je veux pouvoir revoquer mes sessions (logout-all) afin de securiser mon compte.
  - Criteres d'acceptation:
    - When j'appelle `POST /api/auth/logout-all`, Then toutes les `UserSession` actives sont desactivees.
  - Taches techniques: model `UserSession` + revoke + audit.

- **S1-US3b (S)** En tant qu'admin (informatique), je veux pouvoir revoquer les sessions d'un utilisateur afin de repondre a un incident (compte compromis / poste perdu).
  - Criteres d'acceptation:
    - Given un admin, When je POST `/api/users/:id/revoke-sessions`, Then les sessions actives de cet utilisateur sont desactivees et une trace d'audit est ecrite.
  - Taches techniques: permission `SESSION_REVOKE`, endpoint revoke, audit.

- **S1-US4 (M)** En tant qu'utilisateur, je veux reinitialiser mon mot de passe via OTP afin de recuperer mon compte.
  - Criteres d'acceptation:
    - When je fais `forgot-password/request`, Then un OTP est genere (hash) avec expiration.
    - When je fais `verify` avec OTP correct, Then je recois un `resetToken` court.
    - When je fais `reset`, Then mon mot de passe est mis a jour + event audit.
  - Taches techniques: `PasswordReset`, envoi OTP (SMTP/Twilio optionnel), rate limit.

- **S1-US5 (S)** En tant que systeme, je veux controler les droits (RBAC) afin d'empecher l'acces non autorise aux routes sensibles.
  - Criteres d'acceptation:
    - Given un token valide sans permission, When j'appelle une route admin, Then 403.
  - Taches techniques: `requirePermission` + matrice permissions.

- **S1-US6 (S)** En tant que devops (projet), je veux un healthcheck afin de verifier Mongo et les secrets critiques.
  - Criteres d'acceptation:
    - When j'appelle `/api/health`, Then je vois l'etat mongo + dependances (best-effort).
  - Taches techniques: route health + checks.

Livrables: `diagrams/sprints/S1_Auth_Sessions.drawio`

## Sprint 2 - Catalogue & Demandes (collaboration)
Objectif: demander un produit + valider/rejeter + notifier + tracer.

### User stories (exemplaire)

- **S2-US1 (M)** En tant que demandeur, je veux consulter le catalogue des produits approuves afin de choisir un produit disponible pour mon service.
  - Criteres d'acceptation: seuls les produits `approved` sont visibles; filtres simples (categorie/famille).
  - Taches techniques: endpoint produits + filtrage par role/audience + UI liste.

- **S2-US2 (M)** En tant que demandeur, je veux creer une demande de sortie afin d'obtenir la quantite necessaire.
  - Criteres d'acceptation: une `Request` est creee en `pending`; controle quantite demandee > 0.
  - Taches techniques: `POST /api/requests` + model + UI formulaire.

- **S2-US3 (M)** En tant que responsable (ou profil valideur), je veux valider ou rejeter une demande afin de controler la consommation.
  - Criteres d'acceptation: transition `pending -> validated|rejected` + audit (who/when).
  - Taches techniques: endpoints action + RBAC + ecriture `History`.

- **S2-US4 (S)** En tant que demandeur, je veux annuler ma demande tant qu'elle n'est pas servie afin d'eviter des sorties inutiles.
  - Criteres d'acceptation: `pending -> cancelled` (sinon refus).
  - Taches techniques: endpoint cancel + UI + History.

- **S2-US5 (S)** En tant que demandeur, je veux etre notifie du statut (valide/rejete) afin de savoir quoi faire ensuite.
  - Criteres d'acceptation: `Notification` creee + liste consultable + marquer lu.
  - Taches techniques: service notif + UI centre notifications.

- **S2-US6 (S)** En tant qu'equipe, je veux tracer les decisions dans `History` afin d'avoir une trace immuable.
  - Criteres d'acceptation: append-only (pas d'update/delete).
  - Taches techniques: `History.append` sur create/validate/cancel.

Livrables: `diagrams/sprints/S2_Catalogue_Demandes.drawio`

## Sprint 3 - Stock FIFO & Service (entrees/lots/sorties)
Objectif: mouvements stock fiables + lots FIFO + servir une demande.

### User stories (exemplaire)

- **S3-US1 (M)** En tant que magasinier, je veux enregistrer une entree stock avec justificatifs afin d'augmenter le stock systeme.
  - Criteres d'acceptation: creation `StockEntry` + numero `entry_number` + maj `Product.quantity_current`.
  - Taches techniques: endpoint entries + sequence BE + pieces jointes (optionnel).

- **S3-US2 (M)** En tant que systeme, je veux gerer des lots FIFO afin de garantir la consommation par anciennete et peremption.
  - Criteres d'acceptation: `StockLot` cree/maj; lots tries FIFO; lots expires exclus.
  - Taches techniques: model lot + indexes + calcul FIFO.

- **S3-US3 (M)** En tant que magasinier, je veux effectuer une sortie FIFO afin de servir une demande ou un besoin interne.
  - Criteres d'acceptation: creation `StockExit` + consommation lots + maj stock + History.
  - Taches techniques: endpoint exits + transaction best-effort.

- **S3-US4 (M)** En tant que magasinier, je veux servir une demande validee afin de passer la demande en "served".
  - Criteres d'acceptation: `Request.stock_exit` renseigne + status `served` + notification demandeur.
  - Taches techniques: lien request<->exit + endpoint action.

- **S3-US5 (S)** En tant que magasinier, je veux scanner un QR lot (si utilise) afin de securiser et auditer la sortie.
  - Criteres d'acceptation: scan valide sinon rejet + audit FIFO.
  - Taches techniques: `FifoScanAudit` (si present) + validations.

- **S3-US6 (S)** En tant que magasinier/responsable, je veux annuler un mouvement sous conditions afin de corriger une erreur.
  - Criteres d'acceptation: mouvement marque `canceled` + stocks recalcules + trace.
  - Taches techniques: endpoints cancel + guardrails.

Livrables: `diagrams/sprints/S3_Stock_FIFO_Service.drawio`

## Sprint 4 - Pilotage Responsable (PO + Inventaire)
Objectif: gouvernance + approvisionnement + inventaire de bout en bout.

### User stories (exemplaire)

- **S4-US1 (S)** En tant que responsable, je veux gerer les categories et audiences afin de controler la visibilite du catalogue.
  - Criteres d'acceptation: CRUD categories; assignation a un produit.
  - Taches techniques: endpoints categories + UI + validations.

- **S4-US2 (S)** En tant que responsable, je veux valider/archiver les produits afin de garder un catalogue conforme.
  - Criteres d'acceptation: `validation_status` change + History + notification createur (optionnel).
  - Taches techniques: endpoints validation + RBAC.

- **S4-US3 (M)** En tant que responsable, je veux gerer les fournisseurs et commandes afin de preparer les approvisionnements.
  - Criteres d'acceptation: CRUD suppliers; PO avec lignes; statut PO.
  - Taches techniques: `Supplier`, `PurchaseOrder`, UI PO.

- **S4-US4 (M)** En tant que magasinier, je veux receptionner une commande afin de transformer la livraison en entree stock.
  - Criteres d'acceptation: `PO.receive` cree `StockEntry`/`StockLot`; PO passe a `delivered/received`.
  - Taches techniques: endpoint receive + trace + maj stock.

- **S4-US5 (M)** En tant que magasinier, je veux compter un inventaire afin de comparer le stock reel au stock systeme.
  - Criteres d'acceptation: session inventaire + counts + close.
  - Taches techniques: `InventorySession`, `InventoryCount`, UI comptage.

- **S4-US6 (M)** En tant que responsable, je veux appliquer l'inventaire cloture afin d'ajuster le stock officiellement.
  - Criteres d'acceptation: ajustements crees (entry/exit) + Product.quantity_current fixee + History.
  - Taches techniques: endpoint apply + calcul deltas.

Livrables: `diagrams/sprints/S4_Pilotage_PO_Inventaire.drawio`

## Sprint 5 - IA (Alertes + Copilote + Assistant Responsable)
Objectif: valeur IA demonstrable + traces + guardrails + scenario demo.

### User stories (exemplaire)

- **S5-US1 (M)** En tant que responsable, je veux consulter l'etat IA (python/gemini) afin de savoir si les fonctionnalites sont disponibles.
  - Criteres d'acceptation: endpoints status renvoient "ok/degraded/off".
  - Taches techniques: routes status + page UI (optionnel).

- **S5-US1b (M)** En tant qu'admin (informatique), je veux piloter la gouvernance IA (activation, recalcul alertes, entrainement) afin d'assurer le bon fonctionnement et la disponibilite des predictions.
  - Criteres d'acceptation:
    - When je PATCH `/api/settings/ai/config`, Then la configuration est mise a jour (admin uniquement).
    - When je POST `/api/ai/alerts/rebuild`, Then les alertes sont recalculées (admin uniquement).
    - When je POST `/api/ai/models/train`, Then un entrainement est lance ou relance (admin uniquement).
  - Taches techniques: RBAC admin-only + UI console admin + traces.

- **S5-US2 (M)** En tant que systeme, je veux construire un "facts snapshot" a partir des donnees reelles afin d'alimenter l'assistant et le copilote sans invention.
  - Criteres d'acceptation: facts incluent stock, seuils, mouvements recents, demandes en cours, alertes.
  - Taches techniques: service facts builder + caches (optionnel).

- **S5-US3 (M)** En tant que responsable, je veux recevoir des alertes (rupture/anomalie) afin d'agir avant l'incident.
  - Criteres d'acceptation: `AIAlert` creee; liste consultable; revue marque "reviewed".
  - Taches techniques: generation + endpoints + UI.

- **S5-US4 (M)** En tant que responsable, je veux des recommandations (3 max) afin de prioriser mes actions.
  - Criteres d'acceptation: recommandations justifiees + trace d'application si executee.
  - Taches techniques: copilote endpoints + `AIRecommendationTrace`.

- **S5-US5 (M)** En tant que responsable, je veux poser une question (chat/report) afin d'obtenir un mini-rapport base sur les chiffres du systeme.
  - Criteres d'acceptation: reponse avec chiffres; fallback si Gemini off; latence tracee.
  - Taches techniques: `/assistant/ask` + integration python/gemini.

- **S5-US6 (M)** En tant que responsable, je veux consulter les traces de l'assistant afin d'avoir des preuves pour la soutenance (sources, latence, mode).
  - Criteres d'acceptation: `AIAssistantTrace` listee avec filtres.
  - Taches techniques: endpoints traces + UI traces.

- **S5-US7 (S)** En tant que systeme, je veux refuser toute demande d'ecriture (stock/users/settings) dans le chat afin d'eviter les actions dangereuses.
  - Criteres d'acceptation: message "lecture seule" + proposition du bon ecran.
  - Taches techniques: guardrails + tests.

Livrables: `diagrams/sprints/S5_IA_Assistant_Copilote.drawio`
