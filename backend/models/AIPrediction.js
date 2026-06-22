// BLOC 1 - Role du fichier.
// Ce fichier decrit le modele MongoDB AIPrediction, ses champs, index et regles de validation.
// Point de vigilance: eviter de changer un champ sans verifier les migrations, seeds, routes et tests.

const mongoose = require('../db');

const aiPredictionSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    predicted_quantity: Number,
    prediction_type: { type: String, enum: ['rupture','consommation'], required: true },
    period_start: Date,
    period_end: Date,
    confidence_score: Number,
  },
  { timestamps: true }
);

module.exports = mongoose.model('AIPrediction', aiPredictionSchema);
