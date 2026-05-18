# PFE-SENTINEL Mobile (Expo / React Native)

Projet mobile isolé dans `mobile/pfe-sentinel-mobile`.

## Objectif (MVP)

- Offline-first : opérations terrain même sans réseau
- Outbox (file locale) : actions stockées puis synchronisées
- Scan (QR/Code-barres) + Signature numérique (offline)
- Catalogue + Emplacements en cache local (SQLite)
## Démarrage

Dans `mobile/pfe-sentinel-mobile` :

- Installer les dépendances : `npm.cmd install`
- Lancer (recommandé) : `npx.cmd expo start -c --lan`

## URLs backend (important)

- Android Emulator → backend local : `http://10.0.2.2:5000`
- Téléphone réel (Expo Go) → backend sur ton PC :
  - même Wi‑Fi / hotspot
  - URL = `http://IP_DE_TON_PC:5000` (ex: `http://192.168.1.25:5000`)

L’URL se configure dans l’app : `Paramètres` → `URL backend`.

