# Checklist sécurité (démo / PFE)

## Secrets & configuration
- Utiliser `backend/.env` uniquement avec des **valeurs non sensibles** (placeholders).
- Mettre les vraies valeurs dans `backend/.env.local` (non versionné) : `JWT_SECRET`, `PII_HASH_SECRET`, `INTERNAL_BOND_QR_SECRET`, `MAIL_PASS`, `GEMINI_API_KEY`, etc.
- Si une clé a été partagée par erreur (chat / capture / repo), **la révoquer** et en générer une nouvelle.

## Comptes & accès
- Désactiver (ou changer) les comptes de test avant une démonstration externe.
- Vérifier que chaque acteur a bien les permissions attendues (RBAC).

## Journalisation (audit)
- Vérifier que les événements sensibles sont historisés : login, reset password, changement de statut compte, erreurs email.
- Côté Admin : consulter les journaux et filtrer par période / utilisateur.

