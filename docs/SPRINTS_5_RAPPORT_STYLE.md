# Devision des sprints "comme rapport00.pdf" (format rapport)

But: reprendre le **meme style de rapport** (Sprint -> Backlog sprint -> description(s) de cas d'utilisation) mais applique a **SENTINEL**.

Diagrammes draw.io associes:
- Sprint 1: `diagrams/sprints/S1_Auth_Sessions.drawio`
- Sprint 2: `diagrams/sprints/S2_Catalogue_Demandes.drawio`
- Sprint 3: `diagrams/sprints/S3_Stock_FIFO_Service.drawio`
- Sprint 4: `diagrams/sprints/S4_Pilotage_PO_Inventaire.drawio`
- Sprint 5: `diagrams/sprints/S5_IA_Assistant_Copilote.drawio`

Backlogs (format user stories + criteres): `docs/BACKLOG_5_SPRINTS.md`

---

## Sprint 1: Authentification & sessions (acces + securite)

### 3.1 Backlog sprint 1

| ID | User Story (resume) | Taches (resume) | Est |
|---|---|---|---|
| S1-US1 | Se connecter | API `/auth/login` + UI login + validations | M |
| S1-US2 | Refresh auto | endpoint `/auth/refresh` + retry frontend | M |
| S1-US3 | Logout / logout-all | revoke sessions + audit | M |
| S1-US4 | Mot de passe oublie (OTP) | request/verify/reset + rate limit | M |
| S1-US5 | RBAC permissions | `requirePermission` + matrice droits | S |
| S1-US6 | Healthcheck | `/api/health` + checks de base | S |

### 3.2 Description du cas d'utilisation: "Se connecter"

- Acteur principal: Utilisateur (tous roles)
- Preconditions: compte actif; backend disponible
- Donnees: `User`, `UserSession`, `SecurityAudit`
- Scenario nominal:
  1. L'utilisateur saisit `identifier` + `password`.
  2. Le systeme verifie l'identite et les droits.
  3. Le systeme cree une `UserSession` et retourne `token` + `refreshToken`.
  4. Le frontend redirige vers l'espace du role.
- Alternatives/erreurs:
  - Identifiants invalides -> message d'erreur; audit `success=false`.
  - Compte bloque -> refus (403/401 selon implementation).
- Postconditions: session active; dernier acces trace; event audit ecrit.

### 3.3 Description du cas d'utilisation: "Recuperer mot de passe (OTP)"

- Acteur principal: Utilisateur
- Preconditions: canal email/sms disponible (optionnel)
- Scenario nominal:
  1. Request OTP -> creation `PasswordReset` (hash + expiration).
  2. Envoi OTP (SMTP/Twilio si configure).
  3. Verify OTP -> emission `resetToken`.
  4. Reset -> mot de passe modifie + audit.

---

## Sprint 2: Catalogue & demandes (creation -> validation -> notification)

### 4.1 Backlog sprint 2

| ID | User Story (resume) | Taches (resume) | Est |
|---|---|---|---|
| S2-US1 | Consulter catalogue approuve | `GET /products` filtre approved + UI | M |
| S2-US2 | Creer demande | `POST /requests` + UI form | M |
| S2-US3 | Valider/Rejeter demande | actions + RBAC + notif | M |
| S2-US4 | Annuler demande | endpoint cancel + guard statut | S |
| S2-US5 | Notifications in-app | create/list/read | S |
| S2-US6 | History append-only | traces create/validate/cancel | S |

### 4.2 Description du cas d'utilisation: "Creer une demande"

- Acteur principal: Demandeur
- Preconditions: produit `approved` visible
- Donnees: `Request`, `Product`, `History`, `Notification`
- Scenario nominal:
  1. Le demandeur choisit un produit et saisit la quantite.
  2. Le systeme cree une `Request(status=pending)`.
  3. Le systeme trace `History(action_type=request)`.
  4. Le responsable voit la demande en attente.
- Alternatives:
  - Produit archive/bloque -> creation refusee.

---

## Sprint 3: Stock FIFO & service (entrees/lots/sorties + servir demande)

### 5.1 Backlog sprint 3

| ID | User Story (resume) | Taches (resume) | Est |
|---|---|---|---|
| S3-US1 | Enregistrer entree stock | `StockEntry` + sequence BE + maj Product | M |
| S3-US2 | Gerer lots FIFO | `StockLot` + FIFO + peremption | M |
| S3-US3 | Sortie FIFO | `StockExit` + consume lots + maj Product | M |
| S3-US4 | Servir une demande | lier `StockExit` a `Request` + served | M |
| S3-US5 | Scan QR lot (opt) | audit FIFO + validations | S |
| S3-US6 | Annuler mouvement | cancel + recalcul stock + History | S |

### 5.2 Description du cas d'utilisation: "Sortie FIFO (servir demande)"

- Acteur principal: Magasinier
- Preconditions: stock suffisant; lots ouverts; (option) demande `validated/preparing`
- Donnees: `StockLot`, `StockExit`, `Product`, `Request`, `History`
- Scenario nominal:
  1. Le magasinier saisit produit + quantite.
  2. Le systeme selectionne les lots FIFO (non expires).
  3. Le systeme consomme les lots et cree `StockExit`.
  4. Le systeme met a jour `Product.quantity_current/status`.
  5. Si lie a une demande: `Request -> served` + notification.
- Alternatives:
  - Stock insuffisant -> refus + message.
  - QR scanne non conforme -> refus + audit.

---

## Sprint 4: Pilotage responsable (PO + inventaire + gouvernance)

### 6.1 Backlog sprint 4

| ID | User Story (resume) | Taches (resume) | Est |
|---|---|---|---|
| S4-US1 | Gerer categories/audiences | CRUD + assignation | S |
| S4-US2 | Valider/archiver produits | approve/reject + History | S |
| S4-US3 | Gerer fournisseurs + PO | `Supplier`/`PurchaseOrder` + UI | M |
| S4-US4 | Receptionner PO | receive -> StockEntry/Lot | M |
| S4-US5 | Faire inventaire | sessions + counts + close | M |
| S4-US6 | Appliquer inventaire | ajustements + maj stock + History | M |

### 6.2 Description du cas d'utilisation: "Appliquer un inventaire"

- Acteur principal: Responsable
- Preconditions: session inventaire `closed` avec comptages
- Donnees: `InventorySession`, `InventoryCount`, `StockEntry/StockExit`, `Product`, `History`
- Scenario nominal:
  1. Charger comptages + quantites systeme.
  2. Calculer ecarts (delta).
  3. Creer ajustements (entree/sortie).
  4. Fixer `Product.quantity_current` au compte.
  5. Tracer `History(action_type=inventory)` et marquer session `applied`.

---

## Sprint 5: IA (alertes + copilote + assistant + traces)

### 7.1 Backlog sprint 5

| ID | User Story (resume) | Taches (resume) | Est |
|---|---|---|---|
| S5-US1 | Voir status IA | `/python/status` `/gemini/status` | M |
| S5-US2 | Construire facts snapshot | stock + mouvements + demandes + alertes | M |
| S5-US3 | Alertes IA | AIAlert + review | M |
| S5-US4 | Copilote recommandations | reco + apply + trace | M |
| S5-US5 | Assistant chat/report | ask + fallback + chiffres | M |
| S5-US6 | Traces assistant | create/list/filtres | M |
| S5-US7 | Guardrails lecture seule | refus ecriture + suggestion ecran | S |

### 7.2 Description du cas d'utilisation: "Generer mini-rapport (assistant)"

- Acteur principal: Responsable
- Preconditions: donnees disponibles; IA locale ou Gemini configure (optionnel)
- Donnees: `AIAssistantTrace`, `AIAlert`, `AIPrediction`, `History`
- Scenario nominal:
  1. Construire facts depuis la DB.
  2. Calculs IA locale (risques, anomalies, recommandations).
  3. Generation reponse (Gemini si configure sinon fallback).
  4. Stocker `AIAssistantTrace` (latence, source, warnings).
  5. Afficher mini-rapport.

