// BLOC 1 - Role du fichier.
// Ce fichier decrit le modele MongoDB SupportTicket, ses champs, index et regles de validation.
// Point de vigilance: eviter de changer un champ sans verifier les migrations, seeds, routes et tests.

const mongoose = require('../db');

const SUPPORT_TICKET_CATEGORIES = [
  'DASHBOARD',
  'ALERTES',
  'DEMANDES',
  'STOCK',
  'FOURNISSEURS',
  'EXPORT',
  'ASSISTANT',
  'COMPTE',
  'AUTRE',
];

const SUPPORT_TICKET_PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'];
const SUPPORT_TICKET_STATUSES = ['NEW', 'IN_PROGRESS', 'WAITING_USER', 'RESOLVED', 'CLOSED'];

const supportTicketResponseSchema = new mongoose.Schema(
  {
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    authorRole: { type: String, required: true, trim: true, index: true },
    authorUsername: { type: String, default: '', trim: true },
    message: { type: String, required: true, trim: true },
    createdAt: { type: Date, default: Date.now, index: true },
  },
  { _id: false }
);

const supportTicketSchema = new mongoose.Schema(
  {
    ticketNumber: { type: String, required: true, unique: true, trim: true, index: true },
    title: { type: String, required: true, trim: true },
    category: { type: String, enum: SUPPORT_TICKET_CATEGORIES, required: true, index: true },
    priority: { type: String, enum: SUPPORT_TICKET_PRIORITIES, required: true, index: true },
    message: { type: String, required: true, trim: true },
    status: { type: String, enum: SUPPORT_TICKET_STATUSES, default: 'NEW', index: true },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    createdByRole: { type: String, required: true, trim: true, index: true },
    createdByUsername: { type: String, required: true, trim: true, index: true },

    pageUrl: { type: String, default: '', trim: true },
    browserInfo: { type: String, default: '', trim: true },
    attachmentUrl: { type: String, default: '', trim: true },

    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },

    responses: { type: [supportTicketResponseSchema], default: [] },

    lastReplyAt: { type: Date, default: null, index: true },
    lastAdminReplyAt: { type: Date, default: null, index: true },

    resolvedAt: { type: Date, default: null, index: true },
    closedAt: { type: Date, default: null, index: true },
  },
  { timestamps: true }
);

supportTicketSchema.index(
  {
    status: 1,
    priority: 1,
    category: 1,
    createdByRole: 1,
    createdAt: -1,
  },
  { name: 'support_ticket_admin_list' }
);

supportTicketSchema.index({ createdBy: 1, createdAt: -1 }, { name: 'support_ticket_my_list' });
supportTicketSchema.index({ ticketNumber: 1 }, { name: 'support_ticket_number' });
supportTicketSchema.index({ createdByUsername: 1, createdAt: -1 }, { name: 'support_ticket_user_search' });

module.exports = {
  SupportTicket: mongoose.model('SupportTicket', supportTicketSchema),
  SUPPORT_TICKET_CATEGORIES,
  SUPPORT_TICKET_PRIORITIES,
  SUPPORT_TICKET_STATUSES,
};

