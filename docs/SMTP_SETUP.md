# Configuration SMTP (emails: OTP, notifications)

## Symptômes typiques

- **Mot de passe oublié**: aucun email reçu
- **Email de test** (Paramètres): échec d'envoi

Dans ce projet, l'envoi email dépend de la configuration SMTP via des variables d'environnement.

## Vérifier l'état du SMTP

- Ouvrir `http://localhost:5000/api/health`
- Chercher la section `smtp`:
  - `configured: false` => SMTP non configuré (aucun email ne peut partir)
  - `configured: true` et `ok: false` => identifiants/port/secure incorrects ou SMTP inaccessible

## Configurer le SMTP en local (recommandé via `.env.local`)

Créer `backend/.env.local` (non commité) et renseigner au minimum:

```
MAIL_HOST=smtp.votre-domaine.tld
MAIL_PORT=587
MAIL_SECURE=false
MAIL_USER=votre-compte
MAIL_PASS=votre-mot-de-passe-ou-app-password
MAIL_FROM="PFE Sentinel <no-reply@votre-domaine.tld>"
```

Notes:
- Port `587` (STARTTLS) => `MAIL_SECURE=false`
- Port `465` (TLS implicite) => `MAIL_SECURE=true`

Redémarrer le backend, puis re-tester `GET /api/health`.

## Mode dev (sans SMTP)

Par défaut, `backend/.env` n'a pas de SMTP. En **développement**:
- L'API renvoie `dev_otp` pour la récupération de mot de passe
- L'UI affiche le code dans la page "Mot de passe oublié"

En **production**, aucun `dev_otp` n'est exposé: il faut un SMTP fonctionnel.

