// BLOC 1 - Role du fichier.
// Ce fichier decrit le modele MongoDB Notification, ses champs, index et regles de validation.
// Point de vigilance: eviter de changer un champ sans verifier les migrations, seeds, routes et tests.

const mongoose = require('../db');

const notificationSchema = new mongoose.Schema(
  {
    // External dataset import id (ex: NOT-000001). Optional and sparse-unique to keep imports idempotent.
    external_notification_id: { type: String, trim: true, index: true, unique: true, sparse: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: String,
    message: String,
    type: { type: String, enum: ['info','warning','alert'], default: 'info' },
    is_read: { type: Boolean, default: false },
    // Optional business metadata (kept backward compatible with existing UI).
    event_type: { type: String, default: '', trim: true, index: true },
    inventory_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Inventory', default: null, index: true },
  },
  { timestamps: true }
);

notificationSchema.index({ user: 1, is_read: 1, createdAt: -1 });
notificationSchema.index({ type: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);
