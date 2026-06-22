# Écrans & navigation métier — PFE-SENTINEL Mobile

Objectif : application terrain offline-first. Le web reste la source de vérité.

Écrans présents (MVP):
- Splash (init DB/session)
- Login
- Dashboard (réseau, site actif, outbox, sync)
- Mission (préchargement produits + emplacements)
- Catalogue (recherche offline)
- Produit (détails + FDS)
- Entrée stock (offline -> outbox)
- Sortie stock (offline -> outbox, HSE/Signature optionnelles)
- Outbox (file locale + sync)
- Historique local (envoyés)
- Paramètres (URL backend + site)

