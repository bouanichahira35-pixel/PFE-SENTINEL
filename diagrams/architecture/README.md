# Architecture — PFE-SENTINEL

Ce dossier décrit **l’architecture réelle du repo** `C:\PFE-SENTINEL` (web + backend + mobile), en se basant sur le code et la stack Docker.

## 0) Version simplifiée (pour soutenance)

Si tu dois l’expliquer en 20–30 secondes, présente-la comme une **architecture 3‑tiers** :

```mermaid
flowchart LR
  C[Clients\n- Web (React)\n- Mobile (Expo)] -->|HTTP /api| A[API\nNode.js / Express]
  A --> D[Données\nMongoDB (+ Redis optionnel)]
```

Et si tu veux “zoomer” sur le backend (sans rentrer dans tous les détails), utilise une vue **MVC-like / en couches** :

```mermaid
flowchart TB
  R[Routes / Controllers\nbackend/routes] --> S[Services métier\nbackend/services]
  S --> M[Models\nbackend/models (Mongoose)]
  M --> DB[(MongoDB)]
  R <--> MW[Middlewares\nAuth, Rate-limit, Logs...]
```

À dire à l’oral (simple) :
- **Web/Mobile** affichent l’interface et appellent l’API.
- **API Express** applique les règles métier (stock, inventaires, fournisseurs…).
- **MongoDB** stocke les données, **Redis** peut aider pour cache/queues (optionnel).

## 1) Vue système (3-tiers)

```mermaid
flowchart LR
  %% ===== Clients =====
  subgraph C[Clients]
    Web[Web SPA React (CRA)\n- Dev: :3000\n- Docker: Nginx :8080]
    Mobile[Mobile Expo React Native\n- Expo :8081 (dev)\n- APK/iOS\n- Offline (SQLite/AsyncStorage)]
    SupplierPortal[Supplier Portal (Web)\nRoute React dédiée]
  end

  %% ===== Edge / Proxy =====
  subgraph E[Edge / Reverse proxy]
    Nginx[Nginx (docker)\n- sert build React\n- proxy /api -> backend]
  end

  %% ===== App tier =====
  subgraph A[API / Logique applicative]
    API[Node.js / Express API\n/base: /api\n:5000]
    Jobs[Jobs & Queue\nBullMQ (optionnel)\nmail/alerts/rappels]
    AI[Services IA\nchatbot + alerting\nfallback]
  end

  %% ===== Data tier =====
  subgraph D[Données]
    Mongo[(MongoDB\npfe_sentinel)]
    Redis[(Redis\ncache/queue)]
    Uploads[(Uploads / fichiers)]
    AIData[(Données IA\n(export, datasets))]
  end

  %% ===== External deps =====
  subgraph X[Dépendances externes]
    SMTP[SMTP\n(e-mails)]
    Twilio[Twilio\n(SMS / WhatsApp)]
    Gemini[Gemini / LLM\n(chatbot)]
  end

  %% ===== Flows =====
  Web -->|HTTP| API
  Mobile -->|HTTP| API
  SupplierPortal -->|HTTP| API

  Nginx -->|/api/*| API
  Web -.->|Docker only: :8080| Nginx

  API --> Mongo
  Jobs --> Redis
  API -. optionnel .-> Redis

  API --> Uploads
  AI --> AIData

  API -->|emails| SMTP
  API -->|SMS/WhatsApp| Twilio
  AI -->|LLM| Gemini
```

## 2) Vue backend (MVC “like” / couches)

Le backend n’est pas un MVC strict, mais suit une **organisation en couches** très proche :

```mermaid
flowchart TB
  R[Routes / Controllers\nbackend/routes/*.js] --> S[Services métier\nbackend/services/*.js]
  S --> M[Models (Mongoose)\nbackend/models/*.js]
  M --> DB[(MongoDB)]

  R --> MW[Middlewares transverses\nAuth, Rate-limit, Idempotency,\nLogs/Perf, Helmet/CORS]
  MW --> R
```

Repères concrets dans le code :
- Montage des routes API : `backend/server.js` (prefix `/api/...`)
- Modèles Mongoose : `backend/models/`
- Middlewares (idempotency, auth, perf, etc.) : `backend/middlewares/`
- Services (mails, IA, jobs, stock rules, registry fournisseurs…) : `backend/services/`

## 3) Exécution (ports & proxy)

- **Local dev**
  - Frontend CRA `:3000` appelle souvent `/api/*` via le proxy CRA (`package.json#proxy`) et/ou `REACT_APP_API_URL` (valeur par défaut `/api`).
  - Backend Express `:5000` expose `/api/*` (healthcheck: `GET /api/health`).
- **Docker**
  - `web` (Nginx) sert le build React sur `:8080` et reverse-proxy `/api/*` vers `backend:5000`.
  - `mongo:27017`, `redis:6379` (si activé).

## 4) Remarque importante (structure repo)

Il existe aussi un dossier `frontend/` (avec `frontend/src` et `frontend/public`) **sans `package.json`**. Dans l’état actuel, le **frontend “réel”** utilisé par les scripts est celui à la **racine** (`src/`, `package.json`).

## 5) Si tu utilises une image “MVC” (comme celle que tu as montrée)

Tu peux la présenter comme **une simplification** (et non “l’architecture complète”), en la re-labelisant mentalement comme suit :
- **Controller** = tes routes/controllers Express (`backend/routes/*.js`)
- **Model** = tes modèles Mongoose + DB (`backend/models/*.js` + MongoDB)
- **View** = ton UI React (composants/pages côté `src/`)

Note importante : ce n’est pas du MVC strict “framework”, c’est **MVC-like / en couches** (car tu as beaucoup de logique dans des services + middlewares transverses).
