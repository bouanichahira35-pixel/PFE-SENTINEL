# Plan 1 mois — IA + Chatbot (Responsable)

Objectif PFE (réaliste en 4 semaines, solo) : livrer un **assistant Responsable** fiable, basé sur les **données réelles** (stock, mouvements, demandes, alertes IA), avec **explicabilité**, **mini-rapports**, et **traces** pour justifier la valeur en soutenance.

## Définition de "Done" (DoD)

- Accessible uniquement au rôle `responsable` (RBAC OK)
- Réponses basées sur des chiffres du système (pas d'invention)
- Mini-rapport générable (mode `report`)
- Traces consultables (preuves: usage, sources, latence)
- Démo prête (scénario pétrole: pièces critiques / lead time / rupture)

## Semaine 1 — Fondations & Accès

- [ ] T1. Mettre le lien **Chatbot** dans le menu Responsable (UI)
- [ ] T2. Endpoint backend: **traces assistant** (créer + lister)
- [ ] T3. Sécurité: limiter l’assistant au rôle `responsable` (déjà en place) + ajouter rate limiting spécifique si besoin
- [ ] T4. Démo script (1 page): 3 questions “pétrole” + réponses attendues

## Semaine 2 — Outils "lecture seule" (data facts)

Tickets indépendants (parallélisables conceptuellement) :

- [ ] T5. API: snapshot stock (produits critiques + stock + seuil + lots FIFO)
- [ ] T6. API: top mouvements (7/30j, pics, corrections, retours)
- [ ] T7. API: demandes en attente/retard + urgences
- [ ] T8. API: alertes IA (rupture/anomalie) + statut + date

## Semaine 3 — Explicabilité & Actions

- [ ] T9. "Explain alert" : timeline (mouvements + demandes + corrections) pour 1 produit / période
- [ ] T10. Recommandations actionnables (3 actions max, urgences, justification)
- [ ] T11. UI: bouton “Expliquer cette alerte” depuis l’écran surveillance (Responsable)

## Semaine 4 — Rapport & Qualité (note)

- [ ] T12. Mini-rapport hebdo (mode `report`) : top risques + anomalies + actions + KPI simples
- [ ] T13. Guardrails: refuser toute action d’écriture (“je ne peux pas modifier le stock”), proposer le bon écran
- [ ] T14. Tests non-régression: 3 scénarios assistant (ask/report/explain) + doc
- [ ] T15. Packaging soutenance: captures + métriques (nb questions, sources gemini/local, latence)

## Scope "Pétrole" (exemples de questions démo)

- "Quelles pièces critiques risquent la rupture sous 7 jours sur le site X ?"
- "Explique l’alerte anomalie sur la référence Y (7 derniers jours) et propose 3 actions."
- "Génère un mini-rapport hebdomadaire pour la direction (actions prioritaires + risques)."

## Hors scope (pour éviter l’éparpillement)

- Optimisation multi-sites avancée, réconciliation tank-level, intégration ERP complète, fine-tuning/évaluation industrielle.

