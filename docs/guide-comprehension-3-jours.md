# Guide de comprehension du code - 3 jours

Objectif: comprendre rapidement le projet PFE SENTINEL sans se perdre dans les fichiers generes, les doublons et les anciens essais.

Temps disponible: 3 jours, 4 heures par jour.

## Avant de commencer

Lis d'abord ces fichiers:

1. `docs/inventaire-fichiers-pfe-sentinel.md`
2. `backend/docs/ARCHITECTURE.md`
3. `backend/docs/BUSINESS_RULES.md`
4. `src/App.js`
5. `backend/server.js`

Ces fichiers donnent la carte globale: frontend React, backend Express, routes API, roles, regles metier et pages principales.

## Ce qu'il faut ignorer au debut

Ne commence pas par ces dossiers:

- `node_modules/`: dependances installees.
- `build/`: resultat genere par le build React.
- `.git/`: historique Git.
- `.cache/`, `.semgrep/`: caches et outils.
- `extra/`: documents de travail archives.
- `tmp/` s'il reapparait: fichiers temporaires.
- `extra/tmp-list-users.js` et `extra/tmp-list-products.js`: scripts de diagnostic, pas des routes applicatives.
- `frontend/`: ancien doublon potentiel du frontend principal. Le frontend actif est a la racine dans `src/`.

## Jour 1 - Architecture et authentification

But: comprendre comment l'application demarre, comment l'utilisateur se connecte, et comment les roles dirigent les pages.

Lecture conseillee:

- `package.json`: scripts frontend.
- `backend/package.json`: scripts backend et tests.
- `backend/server.js`: demarrage Express, middlewares, routes.
- `backend/db.js`: connexion MongoDB.
- `src/App.js`: routes React, roles, session, redirections.
- `src/constants/roles.js` et `backend/constants/roles.js`: definitions des roles.
- `src/services/api.js`: client API cote frontend.
- `backend/routes/auth.js`: login, refresh, mot de passe oublie.
- `backend/middlewares/requireAuth.js`, `requireRole.js`, `requirePermission.js`: securite des routes.

Questions a savoir repondre a la fin:

- Quel fichier lance le backend ?
- Quel fichier decide quelle page afficher ?
- Comment un role `admin`, `responsable`, `magasinier` ou `demandeur` arrive sur sa page ?
- Quelles routes backend exigent une authentification ?

## Jour 2 - Metier stock, demandes et inventaires

But: comprendre le coeur fonctionnel de l'application.

Lecture conseillee:

- `backend/models/Product.js`, `StockEntry.js`, `StockExit.js`, `Request.js`, `Inventory.js`, `InventoryLine.js`
- `backend/routes/products.js`
- `backend/routes/stock.js`
- `backend/routes/requests.js`
- `backend/routes/inventory.js`
- `src/pages/magasinier/ProduitsMag.jsx`
- `src/pages/magasinier/EntreeStock.jsx`
- `src/pages/magasinier/SortieStock.jsx`
- `src/pages/responsable/InventairesResp.jsx`
- `src/pages/responsable/DemandesAValider.jsx`

Questions a savoir repondre a la fin:

- Comment un produit est cree et modifie ?
- Comment une entree ou une sortie de stock change la quantite ?
- Quelle difference existe entre une demande, une validation et un mouvement de stock ?
- Qui peut lancer, modifier, annuler ou valider un inventaire ?

## Jour 3 - Admin, IA, fournisseurs et verification

But: comprendre les surfaces avancees et savoir verifier le projet.

Lecture conseillee:

- `backend/routes/admin.js`
- `backend/routes/users.js`
- `backend/routes/security-audit.js`
- `backend/services/securityAuditService.js`
- `backend/services/alertService.js`
- `backend/routes/ai.js`
- `backend/services/aiModelService.js`
- `src/pages/admin/AdminUsers.jsx`
- `src/pages/admin/AdminSecurity.jsx`
- `src/pages/admin/AdminAudit.jsx`
- `src/pages/responsable/ProduitsResp.jsx`
- `src/pages/responsable/fournisseurs/FournisseursPage.jsx`

Commandes de verification utiles:

```powershell
npm.cmd run build
npm.cmd --prefix backend run test:critical-flow
npm.cmd --prefix backend run test:guardrails
npm.cmd --prefix backend run test:auth-recovery
```

Questions a savoir repondre a la fin:

- Comment un admin gere les utilisateurs et les permissions ?
- Quelles actions sont auditees ?
- Quelles parties IA sont critiques et lesquelles sont seulement des aides ?
- Quels tests prouvent que les flux principaux ne sont pas casses ?

## Fichiers deja commentes directement

Un precedent travail a deja ajoute des commentaires simples en francais dans les fichiers importants suivants:

- `backend/server.js`
- `backend/db.js`
- `backend/routes/auth.js`
- `backend/routes/products.js`
- `src/App.js`
- `src/services/api.js`

Il vaut mieux commenter seulement les blocs critiques. Ajouter des commentaires artificiels partout rendrait le projet plus difficile a lire et augmenterait la dette technique.

## Regle senior pour lire le projet

Toujours suivre ce chemin:

1. Page React dans `src/pages/...`
2. Appel API dans `src/services/api.js` ou dans le service dedie
3. Route backend dans `backend/routes/...`
4. Modele MongoDB dans `backend/models/...`
5. Service metier dans `backend/services/...` si la route delegue la logique
6. Test ou script dans `backend/scripts/...`

Cette methode evite de lire les fichiers dans le desordre.
