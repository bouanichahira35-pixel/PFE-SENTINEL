# Import dataset CSV réaliste (SENTINEL)

Ce repo inclut un script d’import MongoDB **non destructif** pour charger le dataset réaliste fourni dans `docs/sentinel_dataset_realiste_csv.zip`.

## Commande

Depuis la racine du repo :

`npm.cmd run import:realistic-dataset`

Ou directement dans le backend :

`cd backend && npm.cmd run import:realistic-dataset`

## Pré-requis

- MongoDB accessible via la config `backend/.env` (DB attendue : `pfe_sentinel`).
- Au moins 1 utilisateur **actif** pour chaque rôle : `responsable`, `magasinier`, `demandeur`.
  - Si besoin : `node backend/seed-human-users.js`

## Comportement (sécurité / idempotence)

- Par défaut, l’import est **append-only** :
  - création via *upsert* + `$setOnInsert` (ne modifie pas les documents déjà présents),
  - dédoublonnage par IDs :
    - `Product.code_product` + `Product.external_product_id`
    - `Supplier.external_supplier_id`
    - `StockEntry.entry_number` (utilise `ENT-...`)
    - `StockExit.exit_number` (utilise `SOR-...`)
    - `Request.external_request_id` (utilise `REQ-...`)
    - `PurchaseOrder.external_purchase_order_id` (utilise `PO-...`)
    - `StockLot.qr_code_value` (utilise `LOT-...`)
    - `AIAlert.external_alert_id` (utilise `ALT-...`)
    - `Notification.external_notification_id` (utilise `NOT-...`)
- Un résumé final est affiché à la fin (`IMPORT_REALISTIC_DATASET_OK`).

## Options utiles

- Dry-run (aucune écriture DB) :
  - depuis `backend/` : `npm.cmd run import:realistic-dataset -- --dry-run`
  - depuis la racine : `npm.cmd run import:realistic-dataset -- -- --dry-run`
- Désactiver l’enrichissement de l’historique (`History`) :
  - depuis `backend/` : `npm.cmd run import:realistic-dataset -- --no-history`
  - depuis la racine : `npm.cmd run import:realistic-dataset -- -- --no-history`
- Désactiver l’import des collections training/BI (11..16) :
  - depuis `backend/` : `npm.cmd run import:realistic-dataset -- --no-training`
  - depuis la racine : `npm.cmd run import:realistic-dataset -- -- --no-training`
- Recalculer `Product.quantity_current` à partir des mouvements importés (optionnel, potentiellement intrusif) :
  - depuis `backend/` : `npm.cmd run import:realistic-dataset -- --recompute-stocks`
  - depuis la racine : `npm.cmd run import:realistic-dataset -- -- --recompute-stocks`

## Reset (optionnel, explicite)

Pour éviter toute suppression accidentelle, les resets sont volontairement bloqués par défaut.

- Reset des collections training/BI uniquement :
  - depuis `backend/` : `npm.cmd run import:realistic-dataset -- --reset-scope training --yes-reset`
  - depuis la racine : `npm.cmd run import:realistic-dataset -- -- --reset-scope training --yes-reset`
- Reset operational/all :
  - **à n’utiliser que sur une base locale/dev**
  - nécessite : `--reset-scope operational|all --yes-reset --i-understand-this-will-delete-data`
