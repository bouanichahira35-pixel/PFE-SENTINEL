# QR Security (Bon Interne)

## Variable obligatoire en production

Configurer une cle dediee de signature pour les QR bons internes:

- `INTERNAL_BOND_QR_SECRET` (recommande)
- ou `QR_TOKEN_SECRET`

En production, si aucune de ces 2 cles n'est definie, la signature QR est refusee.

## Recommandations

- Utiliser une cle longue et aleatoire (au moins 32 caracteres).
- Ne pas reutiliser `JWT_SECRET` pour les QR en production.
- Changer la cle si vous suspectez une fuite.

## Verification rapide

Endpoint:

- `GET /api/health`

Bloc retourne:

- `security.internal_bond_qr_secret.ok`
- `security.internal_bond_qr_secret.source`
- `security.internal_bond_qr_secret.dedicated`
- `security.internal_bond_qr_secret.fallback`
