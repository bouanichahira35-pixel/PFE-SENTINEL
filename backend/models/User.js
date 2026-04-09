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
