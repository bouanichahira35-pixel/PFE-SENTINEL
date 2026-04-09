# Besoins non fonctionnels (NFR) — PFE-SENTINEL

Notation :
- **BNF-xx** : Besoin Non Fonctionnel.
- Criticité : **HIGH**, **MEDIUM**, **LOW**.

## BNF-01 — Sécurité (HIGH)

- **BNF-01.1** Authentification obligatoire sur toute action sensible (JWT + sessions revocables).
- **BNF-01.2** Autorisation par permissions (RBAC) appliquée côté backend (la règle n’est pas portée uniquement par le frontend).
- **BNF-01.3** Protection contre abus : rate limiting a minima sur auth/chat/IA.
- **BNF-01.4** Journalisation sécurité : login/logout/refresh/reset + actions admin sensibles (audit consultable).
- **BNF-01.5** Secrets hors dépôt : variables sensibles dans `.env.local` (rotation si fuite).
- **BNF-01.6** CORS/headers de sécurité configurés (Helmet ou équivalent).

## BNF-02 — Traçabilité & auditabilité (HIGH)

- **BNF-02.1** Historique métier **append-only** pour mouvements stock, transitions demandes, inventaires.
- **BNF-02.2** Les événements doivent contenir suffisamment de contexte pour reconstituer “qui a fait quoi, quand, pourquoi”.
- **BNF-02.3** Les actions critiques doivent avoir un identifiant de requête (correlation id) et une latence tracée.

## BNF-03 — Fiabilité / cohérence des données (HIGH)

- **BNF-03.1** Les flux critiques stock/demandes doivent être robustes aux erreurs partielles (transactions ou logique équivalente).
- **BNF-03.2** Idempotence sur opérations à risque (anti-doublons : double clic / retry).
- **BNF-03.3** Le système doit rejeter les transitions de statut invalides (workflow strict).

## BNF-04 — Performance (MEDIUM)

- **BNF-04.1** Les pages principales (liste produits/demandes/inbox) doivent répondre de façon interactive (objectif UX : < 2 secondes en usage normal).
- **BNF-04.2** Les listes volumineuses doivent être paginées/filtrées côté API.
- **BNF-04.3** Si l’IA est activée, prévoir cache TTL sur prédictions/recommandations pour maîtriser la latence.

## BNF-05 — Disponibilité & supervision (MEDIUM)

- **BNF-05.1** Un healthcheck doit exposer l’état (`ok/degraded/unhealthy`) et un niveau d’alerte.
- **BNF-05.2** En mode “degraded”, les fonctions optionnelles (IA, queue mail) doivent tomber en dégradé sans casser le cœur métier.
- **BNF-05.3** Les incidents critiques doivent être visibles (console admin) et/ou notifiables (digest email) selon configuration.

## BNF-06 — Exploitabilité (MEDIUM)

- **BNF-06.1** Déploiement local simple : scripts `npm start` (front/back) + Docker compose (backend + mongo + redis).
- **BNF-06.2** Scripts de seed/démo disponibles pour préparer des données stables.
- **BNF-06.3** CI : build + tests front/back.

## BNF-07 — Maintenabilité (MEDIUM)

- **BNF-07.1** Séparation claire des couches : routes (HTTP), services (métier), modèles (schémas).
- **BNF-07.2** Validations d’entrée systématiques et erreurs explicables (code + reason).
- **BNF-07.3** Tests non-régression sur chemins critiques (stock/demandes/guardrails IA).

## BNF-08 — Portabilité & compatibilité (LOW/MEDIUM)

- **BNF-08.1** Stack supportée : Node.js 20+, MongoDB 7+, Redis optionnel, Python 3 optionnel.
- **BNF-08.2** Fonctionnement sans Python/Gemini possible (fallback IA en mode dégradé).

## BNF-09 — Données & conformité (à préciser) (MEDIUM)

- **BNF-09.1** Définir RPO/RTO et stratégie de sauvegarde/restauration MongoDB.
- **BNF-09.2** Définir durée de rétention et anonymisation potentielle des traces (audit, chat, IA).

