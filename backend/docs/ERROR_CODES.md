# Error Codes (API)

Ces codes doivent etre utilises pour expliquer la raison metier d'un refus.

## Validation
- `VALIDATION_FAILED`

## Produit / Stock
- `PRODUCT_NOT_FOUND`
- `PRODUCT_NOT_APPROVED`
- `STOCK_INSUFFICIENT`
- `FIFO_LOT_INSUFFICIENT`

## Utilisateurs
- `USER_NOT_FOUND`
- `USER_STATUS_FORBIDDEN_SELF`
- `USER_STATUS_FORBIDDEN_ROLE`
- `USER_STATUS_REASON_REQUIRED`

## Serveur
- `INTERNAL_ERROR`

## Format de reponse recommande
```json
{
  "error": "Failed to create stock exit",
  "code": "STOCK_INSUFFICIENT",
  "reason": "Stock courant 2 < quantite demandee 5.",
  "details": "optional"
}
```

