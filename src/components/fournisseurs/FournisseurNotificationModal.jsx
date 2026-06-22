// BLOC 1 - Role du fichier.
// Ce fichier fournit un composant React specialise pour FournisseurNotificationModal.
// Point de vigilance: garder les props, appels API et classes CSS synchronises avec les ecrans existants.

import { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { post } from '../../services/api';
import { appendLocalAudit } from '../../services/fournisseurAuditService';
import { useToast } from '../shared/Toast';
import './fournisseurs.css';

const KINDS = [
  { id: 'devis', label: 'Demande de devis' },
  { id: 'eta', label: 'Confirmation ETA' },
  { id: 'relance_retard', label: 'Relance retard' },
  { id: 'docs', label: 'Demande documents' },
  { id: 'coordination', label: 'Coordination approvisionnement' },
];

const templates = Object.freeze({
  devis: 'Bonjour,\nPouvez-vous nous transmettre un devis pour le(s) produit(s) concerné(s) et les délais de livraison ?\nMerci.',
  eta: 'Bonjour,\nPouvez-vous confirmer l’ETA (date estimée) de livraison pour la commande en cours ?\nMerci.',
  relance_retard: 'Bonjour,\nNous constatons un retard sur la livraison. Pouvez-vous nous indiquer la cause et la nouvelle date estimée ?\nMerci.',
  docs: 'Bonjour,\nMerci de nous transmettre les documents administratifs requis (RC, MF, attestation bancaire, etc.).\nCordialement.',
  coordination: 'Bonjour,\nMerci de nous confirmer votre disponibilité et les contraintes logistiques pour la prochaine livraison.\nMerci.',
});

const FournisseurNotificationModal = ({
  open,
  fournisseur,
  onClose,
  onSent,
}) => {
  const toast = useToast();
  const sid = String(fournisseur?._id || '').trim();
  const [kind, setKind] = useState('devis');
  const [subject, setSubject] = useState('SENTINEL — Coordination');
  const [message, setMessage] = useState(templates.devis);
  const [sending, setSending] = useState(false);
  const canSend = useMemo(() => Boolean(sid && subject.trim() && message.trim()), [sid, subject, message]);

  if (!open) return null;

  const onKindChange = (next) => {
    setKind(next);
    setMessage(templates[next] || '');
  };

  const send = async () => {
    if (!canSend || sending) return;
    setSending(true);
    try {
      await post(`/suppliers/${encodeURIComponent(sid)}/notify-email`, {
        kind,
        subject: subject.trim(),
        message: message.trim(),
      });
      appendLocalAudit(sid, { action: 'NOTIFICATION_ENVOYEE', comment: `Notification envoyée (${kind}).` });
      onSent?.();
      onClose?.();
    } catch (e) {
      toast.error(e.message || "Envoi notification échoué");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="resp-modal-backdrop" role="dialog" aria-modal="true">
      <div className="resp-modal" style={{ maxWidth: 920 }}>
        <div className="resp-modal-title">
          <div style={{ fontWeight: 1000, color: '#0f172a' }}>
            Notification fournisseur — {fournisseur?.name || 'Fournisseur'}
          </div>
          <button className="f360-btn" type="button" onClick={onClose}><X size={16} />Fermer</button>
        </div>
        <div className="resp-modal-body">
          <div className="resp-form-grid">
            <div className="resp-field">
              <span>Type</span>
              <select value={kind} onChange={(e) => onKindChange(e.target.value)}>
                {KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
              </select>
            </div>
            <div className="resp-field">
              <span>Objet</span>
              <input value={subject} onChange={(e) => setSubject(e.target.value)} />
            </div>
            <div className="resp-field" style={{ gridColumn: '1 / -1' }}>
              <span>Message</span>
              <textarea
                rows={7}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                style={{ border: '1px solid rgba(2, 6, 23, 0.12)', borderRadius: 12, padding: 10, fontWeight: 800 }}
              />
            </div>
          </div>
        </div>
        <div className="resp-modal-footer" style={{ justifyContent: 'space-between' }}>
          <div className="f360-muted">Journalisation automatique après envoi.</div>
          <button className="f360-btn success" type="button" onClick={send} disabled={!canSend || sending}>
            {sending ? 'Envoi...' : 'Envoyer'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default FournisseurNotificationModal;
