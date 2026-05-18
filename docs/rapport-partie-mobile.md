# Rapport – Partie Mobile (Expo / React Native) – PFE‑SENTINEL

Date : 12 mai 2026

Chemins utiles :
- Mobile : `mobile/pfe-sentinel-mobile`
- Backend : `backend`
- Web : `src`

---

## 1) Résumé exécutif

La partie mobile est une application terrain (zones blanches) conçue en **offline‑first**.
Elle capture les actions (scan, entrée/sortie stock, inventaire, signature, preuves photo),
les stocke localement, puis les **synchronise** vers le backend dès que le réseau revient.

Le web reste la **source de vérité** : il lit la même base via le backend (MongoDB) et expose
les traces via le flux d’événements (`GET /api/feed`) et les écrans métier.

Principe clé : mobile et web ne se parlent pas directement ; ils sont reliés par le backend commun.

Note : selon la branche/état du dépôt, le module mobile (`mobile/pfe-sentinel-mobile`) et la route de sync (`/api/sync/*`)
peuvent ne pas être présents. Ce document décrit le **MVP cible** et les points d’intégration attendus.

---

## 2) Objectifs et périmètre (MVP)

- **Offline‑first** : opérations utilisables sans réseau.
- **Outbox** : file locale d’événements à synchroniser.
- **Scan** : QR / code‑barres vers *Voir / Entrée / Sortie*.
- **Preuves** : photo (optionnelle) + signature (optionnelle) utilisables offline.
- **Cache local** : produits + emplacements (SQLite) pour la mission.
- **HSE** : consigne sécurité avant sortie + preuve dans la sync (si sortie “critique”).

---

## 3) Acteurs (rôles) et cas d’usage

- **Magasinier** : opérations terrain (entrées/sorties, inventaire), sync ; supervision côté web.
- **Responsable** : supervision (web) et éventuellement opérations terrain (mobile) selon l’organisation.
- **Demandeur** : plutôt web (demandes), extension possible côté mobile.
- **Admin** : sécurité, RBAC, sessions, monitoring et support.

---

## 4) Architecture d’intégration (mobile ↔ backend ↔ web)

Schéma simplifié :

- **Mobile (Expo / React Native)**
  - SQLite : cache produits/emplacements + outbox
  - AsyncStorage : session + paramètres (URL backend, site actif)
  - `SyncService` : `POST /api/sync/push` *(optionnel / si activé côté backend)*
- **Backend (Node/Express)**
  - Auth : `/api/auth/login`, `/api/auth/refresh`
  - Sync : `/api/sync/push` *(optionnel / si activé : rejoue les actions vers stock/inventaire)*
  - Trace : History + Feed (`GET /api/feed`)
- **Web (React)**
  - Affiche flux (`/api/feed`) + écrans métier (stock, inventaire, reporting)

---

## 5) Workflow mobile (écrans)

Le détail complet est dans `mobile/pfe-sentinel-mobile/SCREENS.md` *(si le module mobile est présent dans le repo)*.
Synthèse :

- Splash : init DB + session locale.
- Login : connexion (même compte que web) + accès Paramètres (URL backend).
- Dashboard : état réseau, site actif, accès mission/cata/scan/stock/outbox.
- Mission : préchargement (produits + emplacements).
- Scan : QR/code‑barres vers fiche produit / entrée / sortie.
- StockIn / StockOut : capture offline → outbox.
- Outbox : liste des événements + bouton **Synchroniser**.
- History : événements déjà envoyés.
- FDS : téléchargement/ouverture PDF protégé (auth).

---

## 6) Synchronisation offline (Outbox → Sync)

Le mobile écrit des événements en local, puis tente l’envoi quand le réseau revient.

Types d’événements (si la route sync est activée côté backend) :
- `stock_entry_create` → `POST /api/stock/entries`
- `stock_exit_create` → `POST /api/stock/exits` (avec accusé HSE optionnel)
- `inventory_count` → `POST /api/inventory/sessions` puis `POST /api/inventory/sessions/:id/count`
- `delivery_signed` → enregistre une signature PNG côté serveur

Résultat attendu : après sync, les actions sont visibles sur le web via `/api/feed` et/ou les pages métier.

---

## 7) Endpoints API impliqués

- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `GET  /api/products`
- `GET  /api/locations`
- `POST /api/sync/push` *(optionnel / si activé)*
- `GET  /api/files/download/:storedName`
- `GET  /api/feed`
- `GET  /api/sync/metrics` *(optionnel / admin / si activé)*

---

## 8) Sécurité et authentification

- **Access token** : JWT court (≈ 15 min) en `Authorization: Bearer <token>`.
- **Refresh token** : JWT long (≈ 7 jours).
  - Web : cookie HttpOnly possible.
  - Mobile : stocké en session locale.
- **Refresh auto** : en cas de 401, le client mobile peut appeler `/api/auth/refresh` puis rejouer la requête.
- **Fichiers protégés** : `/api/files/download/...` exige l’auth.

Recommandation : à terme, stocker les tokens de manière chiffrée (SecureStore/Keychain/Keystore) plutôt qu’AsyncStorage.

---

## 9) Configuration réseau (émulateur vs téléphone)

- Émulateur Android → backend local : `http://10.0.2.2:5000`
- Téléphone réel (Expo Go) → backend sur PC : `http://IP_DU_PC:5000` (même Wi‑Fi/hotspot)
- L’URL est configurable dans l’app : Paramètres → URL backend

---

## 10) Scénarios de validation

### Scénario A (cache mission)

- Login
- Mission → refresh produits + emplacements
- Mode avion → vérifier recherche offline

### Scénario B (sortie offline → sync → visible web) *(si sync activée)*

- Créer une sortie offline (photo optionnelle, HSE si critique)
- Vérifier présence dans Outbox
- Rétablir réseau → Synchroniser
- Côté web → vérifier le flux opérationnel (`GET /api/feed`)

### Commandes utiles

```bash
Backend:
  cd backend
  npm ci
  npm start

Web:
  npm ci
  npm start

Mobile:
  cd mobile/pfe-sentinel-mobile
  npm install
  npx expo start -c --lan
```

Note Windows : si `npx expo ...` n’est pas trouvé dans PowerShell, essayer `npx.cmd expo ...` (idem pour `npm.cmd`).

---

## 11) Améliorations recommandées

- Temps réel web : SSE/WebSocket pour pousser les nouveaux événements (au lieu du polling).
- Extension sync : ajouter de nouveaux types d’événements (ex : demandes, validations) selon besoin métier.
- UX conflits : écran mobile “conflit” avec correction guidée.
- Observabilité : dashboard admin sur `/api/sync/metrics` + alertes si taux de rejets élevé.
- Sécurité device : PIN/biométrie si requis terrain + stockage chiffré.

---

## 12) Annexes (fichiers clés)

Mobile *(si présent)* :
- `mobile/pfe-sentinel-mobile/README.md`
- `mobile/pfe-sentinel-mobile/SCREENS.md`
- `mobile/pfe-sentinel-mobile/src/core/services/syncService.ts`
- `mobile/pfe-sentinel-mobile/src/core/db/db.ts`
- `mobile/pfe-sentinel-mobile/src/core/services/fdsService.ts`

Backend / Web :
- `backend/routes/auth.js`
- `backend/routes/feed.js`
- `backend/routes/files.js`
- `backend/routes/stock.js`
- `backend/routes/inventory.js`
- `src/pages/responsable/FluxResp.jsx`

Sync *(si activé)* :
- `backend/routes/sync.js`
