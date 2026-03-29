# SENTINEL Backend

Backend API de gestion de stock (produits, FIFO lots, demandes, audit, reporting, IA).

## Prerequis

- Node.js 20+
- MongoDB 7+
- Redis (optionnel, recommande pour la queue mail)
- Python 3 (optionnel) si vous executez les scripts IA hors Docker

## Installation

```bash
npm ci
```

## Configuration

Copier `.env.example` vers `.env` puis renseigner les valeurs.

Variables minimum pour demarrer:

- `MONGODB_URI`
- `JWT_SECRET`
- `PORT`
- `FRONTEND_URL` ou `FRONTEND_URLS`

## Lancement

```bash
npm start
```

Healthcheck:

- `GET /api/health`
- `status` peut valoir `ok`, `degraded`, ou `unhealthy`
- `monitoring.alert_level`:
  - `none` quand `status=ok`
  - `warning` quand `status=degraded`
  - `critical` quand `status=unhealthy`
- Politique d'alerte recommandee:
  - `unhealthy` => alerte immediate (pager/on-call)
  - `degraded` => warning non bloquant + investigation

## Tests Non-Regression

```bash
npm test
```

La suite execute:

- `scripts/test-critical-flow.js`
- `scripts/test-guardrails.js`
- `scripts/test-ai-chatbot-config.js`

En CI, les credentials de test doivent etre fournis via variables d'environnement:

- `TEST_DEMANDEUR_EMAIL`, `TEST_DEMANDEUR_PASSWORD`
- `TEST_ADMIN_EMAIL`, `TEST_ADMIN_PASSWORD`
- `TEST_MAGASINIER_EMAIL`, `TEST_MAGASINIER_PASSWORD`
- `TEST_RESPONSABLE_EMAIL`, `TEST_RESPONSABLE_PASSWORD`

## Docker

Build + run:

```bash
docker compose up --build
```

Services inclus dans `docker-compose.yml`:

- `backend`
- `mongo`
- `redis`

Note IA:
- Le container `backend` installe `python3` pour executer les scripts dans `ai_py/`.
- En local (sans Docker), Python est optionnel: si Python n'est pas dispo, les predictions restent actives en mode automatique (fallback).

Performance IA (optionnel):
- `AI_CACHE_TTL_MS` (defaut 60000): TTL du cache in-memory pour predictions/copilot.
- `AI_CACHE_MAX_ITEMS` (defaut 250): taille max du cache.

## Activer le chatbot (Gemini)

1. Renseigner `GEMINI_API_KEY` dans `backend/.env`.
2. Redemarrer le backend: `npm start`.
3. Verifier la configuration: `npm run ai:setup-check`.

## Sessions

- Par defaut, une session expire apres 2h d'inactivite (configurable via `SESSION_INACTIVITY_MS`).

## CI

Pipeline GitHub Actions:

- `.github/workflows/backend-ci.yml`
- job backend: syntax check + tests E2E
- job frontend: build + tests (mode CI)
