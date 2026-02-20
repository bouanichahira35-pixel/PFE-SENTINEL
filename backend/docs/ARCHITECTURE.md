# Architecture Backend (MERN)

## Objectif
Ce backend est organise par domaine metier, avec des routes REST claires, des services transverses et une historisation immuable pour l'audit/IA.

## Structure
- `routes/`: orchestration HTTP par domaine (`stock`, `requests`, `products`, `users`, `history`, `ai`, etc.)
- `models/`: schemas MongoDB (source unique des contraintes de donnees)
- `services/`: logique transversale (transaction, audit, mail, queue, preferences)
- `middlewares/`: auth, permissions, validation stricte, idempotence
- `constants/`: permissions, roles, codes d'erreur
- `utils/`: utilitaires validation/parsing

## Principes de raisonnement
1. **Source of truth metier**: la regle est dans la route + service, pas dans le front.
2. **Historique append-only**: aucune modification/suppression de `History`.
3. **Robustesse transactionnelle**: flux critiques dans `runInTransaction`.
4. **Explicabilite des erreurs**: chaque echec metier retourne `error + code + reason`.
5. **Decouplage IA**: donnees via `history`, training/predict via endpoints backend, UI consomme uniquement.

## Flux critiques
### Sortie stock (FIFO)
1. Validation payload.
2. Verification produit + statut.
3. Construction FIFO lots (legacy auto-lot si necessaire).
4. Consommation lots du plus ancien au plus recent.
5. Maj stock produit + historique + alertes.

### Traitement demande
1. Changement statut demande.
2. Verification stock si acceptation.
3. Historique de transition.
4. Notification in-app + email async.

### Blocage utilisateur
1. Responsable uniquement.
2. Motif obligatoire.
3. Interdiction auto-blocage + interdiction blocage responsable.
4. Revocation sessions.
5. Historique + audit + notification utilisateur.

