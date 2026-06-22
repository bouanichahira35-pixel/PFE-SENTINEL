// BLOC 1 - Role du fichier.
// Ce fichier decrit le modele MongoDB Sequence, ses champs, index et regles de validation.
// Point de vigilance: eviter de changer un champ sans verifier les migrations, seeds, routes et tests.

const mongoose = require('../db');

const sequenceSchema = new mongoose.Schema(
  {
    counter_name: { type: String, required: true, unique: true },
    seq: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Sequence', sequenceSchema);
