const mongoose = require('mongoose');

// Définition du schéma pour la collection 'users'
const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true
  },
  email: {
    type: String,
    required: true,
    unique: true
  },
  password_hash: {
    type: String,
    required: true
  },
  role: {
    type: String,
    enum: ['demandeur', 'magasinier', 'responsable'],
    required: true
  },
  telephone: {
    type: String,
    required: true
  },
  image_profile: {
    type: String, // Lien vers l'image du profil
    required: false
  },
  status: {
    type: String,
    enum: ['active', 'blocked'],
    default: 'active'
  },
  date_creation: {
    type: Date,
    default: Date.now
  },
  last_login: {
    type: Date,
    default: Date.now
  }
});

// Création du modèle 'User' avec le schéma défini
const User = mongoose.model('User', userSchema);

// Exporter le modèle pour pouvoir l'utiliser dans d'autres fichiers
module.exports = User;
