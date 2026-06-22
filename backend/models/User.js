// BLOC 1 - Role du fichier.
// Ce fichier decrit le modele MongoDB User, ses champs, index et regles de validation.
// Point de vigilance: eviter de changer un champ sans verifier les migrations, seeds, routes et tests.

const mongoose = require('../db');

// Définition du schéma pour la collection 'users'
const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password_hash: {
      type: String,
      required: true,
      select: false,
    },
    role: {
      type: String,
      enum: ['demandeur', 'magasinier', 'responsable', 'admin'],
      required: true,
    },
    // RBAC utilisateur (optionnel) : sous-ensemble des permissions de son rôle.
    // - undefined / absent : l'utilisateur hérite de toutes les permissions du rôle
    // - [] : aucune permission (sous-ensemble vide)
    rbac_permissions: {
      type: [String],
      default: undefined,
    },
  // Pour les demandeurs: limite le catalogue visible (ex: bureautique / menage / petrole).
  // Les roles magasinier/responsable voient tout le catalogue.
  demandeur_profile: {
    type: String,
    enum: ['bureautique', 'menage', 'petrole'],
    default: 'bureautique',
  },
    // Service / Direction (ex: RH, Finance, HSE, Maintenance, Site).
    service_direction: {
      type: String,
      trim: true,
      default: '',
    },
    telephone: {
      type: String,
      required: true,
      trim: true,
    },
    employee_id: {
      type: String,
      trim: true,
      sparse: true,
      unique: true,
    },
    job_title: {
      type: String,
      trim: true,
      default: '',
    },
    hire_date: {
      type: Date,
      default: null,
    },
    account_expires_at: {
      type: Date,
      default: null,
    },
    account_type: {
      type: String,
      enum: ['interne', 'externe'],
      default: 'interne',
    },
    two_factor_required: {
      type: Boolean,
      default: false,
    },
    site_location: {
      type: String,
      trim: true,
      default: '',
    },
    manager_user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    preferred_language: {
      type: String,
      enum: ['fr', 'ar', 'en'],
      default: 'fr',
    },
    notification_channels: {
      email: { type: Boolean, default: true },
    },
    image_profile: {
      type: String, // Lien vers l'image du profil
      required: false,
    },
    status: {
      type: String,
      enum: ['active', 'blocked'],
      default: 'active',
    },
    // Champs legacy (conservés pour compatibilité)
    date_creation: {
      type: Date,
      default: Date.now,
    },
    last_login: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

// Exporter le modèle pour pouvoir l'utiliser dans d'autres fichiers
module.exports = mongoose.model('User', userSchema);
