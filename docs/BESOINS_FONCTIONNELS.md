# Besoins fonctionnels — PFE-SENTINEL

> Liste numérotée (traçable) dérivée de l’analyse du code (routes `backend/routes/**`, pages `src/pages/**`) et de la documentation existante.

Notation :
- **BF-xx** : Besoin Fonctionnel.
- Priorité : **MUST** (obligatoire), **SHOULD** (important), **COULD** (optionnel).

## BF-01 — Authentification & sessions

- **BF-01.1 (MUST)** L’utilisateur doit pouvoir se connecter (identifiant + mot de passe).
- **BF-01.2 (MUST)** L’application doit gérer un access token + refresh token et permettre le refresh automatique.
- **BF-01.3 (MUST)** L’utilisateur doit pouvoir se déconnecter (session côté serveur révoquée si possible).
- **BF-01.4 (SHOULD)** L’utilisateur doit pouvoir révoquer toutes ses sessions (“logout-all”).
- **BF-01.5 (SHOULD)** L’utilisateur doit pouvoir initier un “mot de passe oublié” via OTP (email/SMS/WhatsApp selon configuration).

## BF-02 — Autorisations (RBAC)

- **BF-02.1 (MUST)** Chaque endpoint métier doit vérifier l’authentification.
- **BF-02.2 (MUST)** Chaque action sensible doit vérifier la permission (RBAC par permissions).
- **BF-02.3 (MUST)** Les rôles techniques supportés doivent inclure : `demandeur`, `magasinier`, `responsable`, `admin`.

## BF-03 — Catalogue produits & catégories

- **BF-03.1 (MUST)** Les utilisateurs autorisés doivent pouvoir consulter la liste des produits avec recherche/filtre.
- **BF-03.2 (MUST)** Le magasinier/responsable doit pouvoir créer un produit.
- **BF-03.3 (MUST)** Le magasinier/responsable doit pouvoir modifier un produit.
- **BF-03.4 (SHOULD)** Le responsable doit pouvoir valider/rejeter un produit (gouvernance).
- **BF-03.5 (SHOULD)** Le responsable doit pouvoir archiver/supprimer un produit (selon règles).
- **BF-03.6 (SHOULD)** Le responsable/magasinier doit pouvoir gérer des catégories et associer des produits.
- **BF-03.7 (SHOULD)** Le système doit calculer un statut produit dérivé (OK/sous-seuil/rupture) selon stock et seuil minimum.
- **BF-03.8 (COULD)** Le catalogue peut être filtré par audience/profil demandeur (si activé côté données).

## BF-04 — Gestion des demandes (workflow)

- **BF-04.1 (MUST)** Le demandeur doit pouvoir créer une demande de sortie (produit, quantité, motif).
- **BF-04.2 (MUST)** Le demandeur doit pouvoir consulter ses demandes et leurs statuts.
- **BF-04.3 (MUST)** Le responsable doit pouvoir valider ou rejeter une demande.
- **BF-04.4 (MUST)** Le magasinier doit pouvoir marquer une demande en préparation puis la servir.
- **BF-04.5 (MUST)** Le service d’une demande doit générer/associer une sortie stock valide.
- **BF-04.6 (SHOULD)** Le demandeur doit pouvoir confirmer la réception après service (si activé).
- **BF-04.7 (SHOULD)** L’application doit notifier l’utilisateur des étapes clés (création/validation/service…).
- **BF-04.8 (COULD)** Le responsable doit pouvoir annuler une demande selon règles.

## BF-05 — Stock (entrées, sorties, FIFO, pièces jointes)

- **BF-05.1 (MUST)** Le magasinier/responsable doit pouvoir enregistrer une entrée stock.
- **BF-05.2 (MUST)** Le système doit gérer des lots FIFO pour un produit (quantité disponible, date d’entrée, péremption optionnelle).
- **BF-05.3 (MUST)** Le magasinier/responsable doit pouvoir enregistrer une sortie stock en consommant les lots en FIFO.
- **BF-05.4 (MUST)** Le système doit refuser une sortie si le stock total/lots est insuffisant.
- **BF-05.5 (SHOULD)** Le magasinier/responsable doit pouvoir annuler une entrée/sortie stock selon règles (avec recalcul cohérent).
- **BF-05.6 (SHOULD)** Le magasinier doit pouvoir joindre des pièces (documents) aux mouvements stock.
- **BF-05.7 (COULD)** Le système peut supporter QR code (scan/génération) pour assister la préparation/service.

## BF-06 — Historique & traçabilité

- **BF-06.1 (MUST)** Le système doit enregistrer un historique métier immuable pour les actions critiques.
- **BF-06.2 (MUST)** Les utilisateurs autorisés doivent pouvoir consulter l’historique (mouvements, transitions).

## BF-07 — Inventaires

- **BF-07.1 (MUST)** Le magasinier doit pouvoir créer une session d’inventaire.
- **BF-07.2 (MUST)** Le magasinier doit pouvoir saisir des comptages (lignes d’inventaire).
- **BF-07.3 (SHOULD)** Le magasinier doit pouvoir clôturer une session d’inventaire.
- **BF-07.4 (MUST)** Le responsable doit pouvoir appliquer un inventaire clôturé (ajustements stock + historisation).

## BF-08 — Fournisseurs & bons de commande

- **BF-08.1 (SHOULD)** Le responsable/magasinier doit pouvoir gérer des fournisseurs.
- **BF-08.2 (SHOULD)** Le responsable/magasinier doit pouvoir créer et suivre des bons de commande.
- **BF-08.3 (SHOULD)** Le magasinier doit pouvoir réceptionner une commande et la convertir en entrée stock.
- **BF-08.4 (COULD)** Le système peut assister l’approvisionnement via ranking/recommandations.

## BF-09 — Notifications

- **BF-09.1 (MUST)** L’application doit fournir des notifications in-app (non lues/lues) sur événements clés.
- **BF-09.2 (COULD)** Des emails peuvent être envoyés selon préférences et disponibilité SMTP/queue.

## BF-10 — Chat & collaboration

- **BF-10.1 (COULD)** Les utilisateurs autorisés peuvent échanger via chat (conversations + messages).
- **BF-10.2 (COULD)** Les messages peuvent être contextualisés (lien vers produit/demande/inventaire/commande).

## BF-11 — Administration IT (console technique)

- **BF-11.1 (MUST)** L’admin IT doit pouvoir consulter l’état de santé du système (health/monitoring).
- **BF-11.2 (MUST)** L’admin IT doit pouvoir gérer les utilisateurs (activation/désactivation, etc.) selon droits.
- **BF-11.3 (MUST)** L’admin IT doit pouvoir consulter et révoquer des sessions.
- **BF-11.4 (MUST)** L’admin IT doit pouvoir consulter l’audit sécurité.
- **BF-11.5 (COULD)** L’admin IT peut piloter la gouvernance IA (activation, recalcul alertes, entraînement).

## BF-12 — Reporting & exports

- **BF-12.1 (COULD)** Le responsable doit pouvoir consulter des rapports/KPIs (stock, demandes, tendances).
- **BF-12.2 (COULD)** Le système peut exporter des données (rapports / dataset IA) selon endpoints/scripts.

