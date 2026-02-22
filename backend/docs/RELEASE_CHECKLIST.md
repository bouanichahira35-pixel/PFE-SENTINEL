# Release Checklist (Backend + Frontend)

## 1. Branche propre

1. Créer une branche dédiée release:
   - `git checkout -b release/<version>`
2. Vérifier l'état du workspace:
   - `git status --short`
3. Aucun fichier temporaire ne doit rester non suivi (uploads, datasets, cache).

## 2. Validation technique

1. Backend:
   - `cd backend`
   - `npm ci`
   - `npm audit --omit=dev`
   - `npm test`
2. Frontend:
   - `cd ..`
   - `npm ci`
   - `npm run build`
   - `npm test -- --watchAll=false --passWithNoTests`

## 3. Vérification santé/monitoring

1. Vérifier `/api/health` après démarrage:
   - `status=unhealthy` => blocage release
   - `status=degraded` => release possible avec warning documenté
2. Vérifier `monitoring.alert_level`:
   - `critical` => pager/on-call
   - `warning` => ticket investigation

## 4. Découpage commits recommandé

1. `infra`: Docker, CI, `.env.example`, `.gitignore`
2. `backend`: sécurité, health, observabilité
3. `tests`: scripts E2E et ajustements
4. `docs`: README, checklist, notes de migration

## 5. Préparation livraison

1. Tag version:
   - `git tag vX.Y.Z`
2. Générer note de release:
   - changements
   - risques connus
   - rollback plan
