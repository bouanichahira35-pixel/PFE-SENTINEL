# SENTINEL Backend

Backend API de gestion de stock (produits, FIFO lots, demandes, audit, reporting, IA).

## Prerequis

- Node.js 20+
- MongoDB 7+
- Redis (optionnel, recommande pour la queue mail)

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

## CI

Pipeline GitHub Actions:

- `.github/workflows/backend-ci.yml`
- job backend: syntax check + tests E2E
- job frontend: build + tests (mode CI)
