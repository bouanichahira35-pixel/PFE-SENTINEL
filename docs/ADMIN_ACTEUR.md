# Acteur : Administrateur (Informatique)

## Objectif (rôle 100% technique)

L’**Administrateur (Informatique)** garantit le **bon fonctionnement technique** de la plateforme :

- disponibilité et santé des services (API, base de données, dépendances),
- sécurité (audit, sessions, tentatives de connexion),
- gouvernance technique de l’IA (activation/désactivation, diagnostics, relance de calculs).

Il **n’intervient pas** dans les décisions métier (stock, demandes, validation des sorties, etc.).

## Accès (UI)

- Console Admin : `/admin`
- Utilisateurs : `/admin/utilisateurs`
- Supervision IA : `/admin/ia`
- Paramètres admin : `/admin/parametres`

## Fonctions principales

### 1) Gestion des acteurs (RBAC)

- création de comptes,
- activation / blocage,
- changement de rôle,
- réinitialisation de mot de passe,
- révocation des sessions actives.

### 2) Supervision du système

Dans la **Console Admin** :

- état MongoDB, SMTP/Mail, incidents,
- sessions actives et comptes bloqués,
- sécurité : échecs de connexion récents (24h).

### 3) Supervision IA (technique)

Dans **Supervision IA** :

- état du moteur IA et du chatbot Gemini,
- activation/désactivation des fonctionnalités IA,
- recalcul d’alertes,
- entraînement des modèles (avec garde-fous côté admin).

## Création / connexion du compte Admin (local)

Le backend contient un script de seed qui crée/met à jour un compte admin.

1. Dans `backend/.env`, définir :
   - `TEST_ADMIN_EMAIL`
   - `TEST_ADMIN_PASSWORD`

2. Lancer :

   - `cd backend`
   - `node seed-human-users.js`

3. Se connecter via l’écran `/login` :
   - utiliser l’identifiant et le mot de passe configurés ci-dessus,
   - le système redirige automatiquement vers `/admin` si le rôle est `admin`.

## API (technique)

- `GET /api/health` : santé globale
- `GET /api/admin/overview` : sessions + audit sécurité (admin uniquement)
- `GET /api/security-audit` : journal sécurité (permission `security_audit.read`)
- `GET /api/users?...` : gestion utilisateurs (permission `user.manage`)

