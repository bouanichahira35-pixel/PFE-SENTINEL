const mongoose = require('../db');

const categorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true },
    description: String,
    // Si vide: categorie "publique" pour tous les demandeurs.
    // Sinon: visible seulement pour les demandeurs dont le profil est inclus.
    audiences: {
      type: [String],
      enum: ['bureautique', 'menage', 'petrole'],
      default: [],
    },
    created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Category', categorySchema);
