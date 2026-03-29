# PFE-SENTINEL

Application web de gestion de stock (produits, FIFO lots, demandes, audit, reporting) avec un backend Node/Express et un frontend React.

## Structure

- `src/` : frontend (React / Create React App)
- `backend/` : API (Node.js / Express / MongoDB / Redis optionnel)
- `docs/` : documents projet
- `diagrams/` : diagrammes

## Prérequis

- Node.js 20+
- MongoDB 7+
- (Optionnel) Redis

## Démarrage (local)

### 1) Backend

Dans `backend/`:

```bash
npm ci
cp .env.example .env
npm start
```

API: `http://localhost:5000/api`  
Healthcheck: `GET http://localhost:5000/api/health`

### 2) Frontend

À la racine:

```bash
npm ci
cp .env.example .env
npm start
```

UI: `http://localhost:3000`

## Variables d'environnement (frontend)

- `REACT_APP_API_URL` (voir `.env.example`) : URL du backend (inclure `/api`)

## Tests

Frontend:

```bash
npm test
```

Backend (dans `backend/`):

```bash
npm test
```

## Docker (backend + mongo + redis)

Dans `backend/`:

```bash
docker compose up --build
```

## Notes

- Le script `npm run start:legacy` existe si vous avez une contrainte OpenSSL legacy sur un environnement spécifique.
- Voir aussi `backend/README.md` pour la configuration détaillée du backend.
