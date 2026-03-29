# Plan global - 5 sprints (max) + diagrammes draw.io

Objectif: organiser le projet SENTINEL en **5 sprints** (globaux et generaux). Le detail fin (raffinement, sous-cas, ecrans, exceptions) se fait ensuite dans chaque sprint.

Chaque sprint a son fichier draw.io local (multi-pages) dans `diagrams/sprints/`:
- `UseCase` (cas d'utilisation du sprint)
- `Activity` (flux principal du sprint)
- `Sequence` (appel UI -> API -> DB/services)
- `Class` (modele conceptuel + quelques methodes/actions)

## Sprint 1 - Auth & sessions (securite de base)
- Login / refresh / logout(s)
- Forgot password (OTP) + audit securite
- RBAC (permissions) + healthcheck
- Diagrammes: `diagrams/sprints/S1_Auth_Sessions.drawio`

## Sprint 2 - Catalogue + demandes (collaboration)
- Catalogue produits "approved" (demandeur)
- Creation / annulation demande (demandeur)
- Validation / rejet demande + notification (responsable ou profil autorise)
- Chat "thread" contextualise (optionnel) + History (traçabilite)
- Diagrammes: `diagrams/sprints/S2_Catalogue_Demandes.drawio`

## Sprint 3 - Stock FIFO (entrees, lots, sorties) + service demande
- Entree stock (StockEntry) + creation lot(s) (StockLot)
- Sortie stock FIFO (StockExit) manual / scan QR (si dispo)
- Lier service a une demande (Request -> served) + bon interne (si utilise)
- Diagrammes: `diagrams/sprints/S3_Stock_FIFO_Service.drawio`

## Sprint 4 - Pilotage responsable (fournisseurs, commandes, inventaire)
- Categories / seuils / validations produits
- Fournisseurs + Purchase Orders + reception (genere des entrees)
- Inventaire (session, comptage, cloture, application + ajustements)
- Diagrammes: `diagrams/sprints/S4_Pilotage_PO_Inventaire.drawio`

## Sprint 5 - IA (alertes, copilote, assistant responsable)
- Predictions/alertes (rupture, surconsommation, anomalie)
- Copilote (recommandations) + inbox magasinier (decisions)
- Assistant responsable (chat/report/voix) + traces
- Guardrails (lecture seule, pas d'ecriture stock)
- Diagrammes: `diagrams/sprints/S5_IA_Assistant_Copilote.drawio`

