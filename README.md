# SENTINEL

Application web de gestion de stock, demandes, inventaires, fournisseurs et pilotage IA.

## Lancement avec Docker

Prérequis :

- Docker Desktop démarré.
- Aucun service local déjà occupé sur les ports `8080`, `5000`, `27017` ou `6379`.

Commande depuis la racine du projet :

```powershell
docker compose up --build
```

Services lancés :

- `web` : interface React servie par Nginx sur `http://localhost:8080`
- `backend` : API Express sur `http://localhost:5000`
- `mongo` : MongoDB sur `localhost:27017`
- `redis` : Redis sur `localhost:6379`

Vérifications rapides :

```powershell
docker compose ps
Invoke-WebRequest http://localhost:8080
Invoke-WebRequest http://localhost:5000/api/health
Test-NetConnection localhost -Port 6379
```

## Configuration Docker

Le fichier `docker-compose.yml` contient des valeurs de développement suffisantes pour lancer la pile localement.

Pour personnaliser les secrets, SMTP ou les clés IA sans toucher au `.env`
frontend existant :

```powershell
Copy-Item .env.docker.example .env.docker
```

Puis modifier `.env.docker` et lancer :

```powershell
docker compose --env-file .env.docker up --build
```

Important : `DOCKER_MAIL_QUEUE_ENABLED=false` par défaut en Docker local. Redis démarre quand même, mais la queue mail n'est activée que si SMTP est configuré (`DOCKER_MAIL_HOST`, `DOCKER_MAIL_USER`, `DOCKER_MAIL_PASS`, etc.). Sans SMTP, activer la queue donne un état de santé dégradé inutile.

## Commandes utiles

Arrêter les conteneurs :

```powershell
docker compose down
```

Arrêter et supprimer les volumes Mongo/Redis :

```powershell
docker compose down -v
```

Voir les logs :

```powershell
docker compose logs -f backend
docker compose logs -f web
```

Reconstruire sans cache :

```powershell
docker compose build --no-cache
docker compose up
```
