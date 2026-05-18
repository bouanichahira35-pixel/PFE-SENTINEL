import { useMemo, useState } from 'react';
import './fournisseurs.css';

const emptyDraft = {
  name: '',
  email: '',
  phone: '',
  address: '',
  domain: '',
  main_contact: '',
  internal_note: '',
  status: 'ACTIF',
  reliability_level: 'NON_EVALUE',
  last_verification_date: '',
  default_lead_time_days: 7,
};

const FournisseurForm = ({
  initialValue,
  submitLabel = 'Enregistrer',
  onSubmit,
  onCancel,
  disabled = false,
}) => {
  const start = useMemo(() => ({ ...emptyDraft, ...(initialValue || {}) }), [initialValue]);
  const [draft, setDraft] = useState(start);

  const set = (key) => (e) => setDraft((p) => ({ ...p, [key]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    onSubmit?.(draft);
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="resp-card">
        <div className="resp-form-grid">
          <div className="resp-field">
            <span>Nom fournisseur *</span>
            <input value={draft.name} onChange={set('name')} disabled={disabled} required />
          </div>
          <div className="resp-field">
            <span>Contact principal *</span>
            <input value={draft.main_contact} onChange={set('main_contact')} disabled={disabled} required />
          </div>
          <div className="resp-field">
            <span>Email *</span>
            <input value={draft.email} onChange={set('email')} disabled={disabled} required type="email" />
          </div>
          <div className="resp-field">
            <span>Téléphone *</span>
            <input value={draft.phone} onChange={set('phone')} disabled={disabled} required />
          </div>
          <div className="resp-field">
            <span>Domaine / spécialité *</span>
            <input value={draft.domain} onChange={set('domain')} disabled={disabled} required placeholder="Mécanique, Sécurité, ..." />
          </div>
          <div className="resp-field">
            <span>Statut *</span>
            <select value={draft.status} onChange={set('status')} disabled={disabled} required>
              <option value="ACTIF">Actif</option>
              <option value="INACTIF">Inactif</option>
              <option value="SUSPENDU">Suspendu</option>
              <option value="A_VERIFIER">À vérifier</option>
            </select>
          </div>
          <div className="resp-field">
            <span>Fiabilité initiale</span>
            <select value={draft.reliability_level} onChange={set('reliability_level')} disabled={disabled}>
              <option value="NON_EVALUE">Non évalué</option>
              <option value="FIABLE">Fiable</option>
              <option value="MOYEN">Moyen</option>
              <option value="A_SURVEILLER">À surveiller</option>
            </select>
          </div>
          <div className="resp-field">
            <span>Délai moyen livraison (jours)</span>
            <input
              type="number"
              min="0"
              max="3650"
              value={draft.default_lead_time_days}
              onChange={set('default_lead_time_days')}
              disabled={disabled}
            />
          </div>
          <div className="resp-field" style={{ gridColumn: '1 / -1' }}>
            <span>Adresse</span>
            <input value={draft.address} onChange={set('address')} disabled={disabled} />
          </div>
          <div className="resp-field" style={{ gridColumn: '1 / -1' }}>
            <span>Note interne</span>
            <textarea
              value={draft.internal_note}
              onChange={set('internal_note')}
              disabled={disabled}
              rows={4}
              style={{ border: '1px solid rgba(2, 6, 23, 0.12)', borderRadius: 12, padding: 10, fontWeight: 800 }}
            />
          </div>
          <div className="resp-field">
            <span>Date dernière vérification</span>
            <input
              type="date"
              value={draft.last_verification_date ? String(draft.last_verification_date).slice(0, 10) : ''}
              onChange={set('last_verification_date')}
              disabled={disabled}
            />
          </div>
        </div>

        <div className="f360-actions" style={{ marginTop: 14, justifyContent: 'flex-end' }}>
          <button className="f360-btn secondary" type="button" onClick={onCancel} disabled={disabled}>
            Annuler
          </button>
          <button className="f360-btn primary" type="submit" disabled={disabled}>
            {submitLabel}
          </button>
        </div>
      </div>
    </form>
  );
};

export default FournisseurForm;

