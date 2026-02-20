# Regles Metier Principales

## Produits
- Un produit doit etre `approved` pour autoriser entree/sortie.
- Le QR code doit etre unique.
- `status` produit derive de `quantity_current` et `seuil_minimum`.

## Stock FIFO
- Les sorties consomment les lots par ordre anciennete (`date_entry`, puis `createdAt`).
- Une sortie est refusee si le stock total ou stock lots est insuffisant.
- Pour stock legacy sans lots, un lot technique est cree automatiquement pour coherencer FIFO.

## Demandes
- Le demandeur cree une demande (`pending`).
- Magasinier traite: `accepted` ou `refused`.
- Une demande `served` doit etre reliee a un `stock_exit` valide.

## Historique / Audit
- `History` est immuable (append-only).
- Chaque transition metier critique doit creer un evenement `History`.
- Les evenements securite (auth/email/sessions) vont dans `SecurityAudit`.

## Utilisateurs
- Responsable peut bloquer/debloquer magasinier/demandeur.
- Motif blocage/deblocage obligatoire.
- Auto-blocage interdit.
- Blocage d'un responsable interdit.

## Notifications / Mail
- Notification in-app pour evenements critiques.
- Email asynchrone via queue, fallback SMTP direct en cas de queue indisponible.
- Respect des preferences utilisateur (`notifications.email`, `demandesAlerts`).

