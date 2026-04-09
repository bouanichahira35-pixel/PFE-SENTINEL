# Scénario de démonstration (PFE) — 5 à 7 minutes

Objectif : une démo **fluide**, sans “pages vides”, avec des données stables pour les graphes/alertes.

## 0) Pré-requis (une seule fois)
- Démarrer MongoDB (local ou docker).
- Configurer les secrets réels dans `backend/.env.local` (jamais committer).

## 1) Préparer les données (recommandé)
Dans `backend/` :
- Lancer : `node scripts/demo-setup.js`
- Si besoin de normaliser des statuts anciens : `node scripts/migrate-request-statuses.js`

## 2) Vérifier IA / chatbot (statut technique)
Dans `backend/` :
- `node scripts/ai-setup-check.js` (Gemini + Python + moteur local)

## 3) Démarrage (démo)
1. Frontend : `npm start` (port 3000/3001/3002 selon disponibilité)
2. Backend : `npm start` (ou `node server.js`)

## 4) Parcours conseillé
### A) Admin (informatique)
- Connexion Admin
- Aller sur `/admin`
  - Montrer “System Health” + incidents (si présents)
- Aller sur `/admin/parametres`
  - Activer **Maintenance** + message
  - Revenir sur `/admin` pour voir le bandeau

### B) Responsable
- Connexion Responsable
- Dashboard : vérifier bloc **Alertes** + badge
- Pilotage :
  - Onglet alertes (nouvelles alertes + explications)
  - Fournisseurs : ranking + recommandation IA

### C) Magasinier
- Inbox (centre d’actions)
- Sortie stock depuis une demande (et statut demande)
- Entrée stock (réception + fournisseur)

### D) Demandeur
- Catalogue produits (avec images/pictos)
- Créer une demande (quantité + motif + direction)
- “Mes demandes” : statut évolue

## 5) Astuces anti-stress
- Si tu vois “non_json_response (HTML)” : redémarrer le backend.
- Si les courbes sont vides : relancer `node scripts/demo-setup.js`.

