// BLOC 1 - Role du fichier.
// Ce fichier fournit des confirmations et saisies courtes integrees a l'UI.
// Point de vigilance: garder ces dialogues asynchrones pour eviter les popups natives du navigateur.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, CheckCircle2, Info, PencilLine, X } from 'lucide-react';
import './ConfirmDialog.css';

const ConfirmDialogContext = createContext(null);

export const useConfirm = () => {
  const context = useContext(ConfirmDialogContext);
  if (!context) {
    throw new Error('useConfirm must be used within a ConfirmDialogProvider');
  }
  return context.confirm;
};

export const usePrompt = () => {
  const context = useContext(ConfirmDialogContext);
  if (!context) {
    throw new Error('usePrompt must be used within a ConfirmDialogProvider');
  }
  return context.prompt;
};

const normalizeConfig = (config) => {
  if (typeof config === 'string') return { message: config };
  return config && typeof config === 'object' ? config : {};
};

export const ConfirmDialogProvider = ({ children }) => {
  const [dialog, setDialog] = useState(null);
  const resolverRef = useRef(null);

  const closeDialog = useCallback((value) => {
    const resolver = resolverRef.current;
    resolverRef.current = null;
    setDialog(null);
    if (resolver) resolver(value);
  }, []);

  const openDialog = useCallback((type, config) => new Promise((resolve) => {
    if (resolverRef.current) {
      resolverRef.current(type === 'prompt' ? null : false);
    }
    resolverRef.current = resolve;
    setDialog({
      type,
      config: normalizeConfig(config),
    });
  }), []);

  const confirm = useCallback((config) => openDialog('confirm', config), [openDialog]);
  const prompt = useCallback((config) => openDialog('prompt', config), [openDialog]);

  const value = useMemo(() => ({ confirm, prompt }), [confirm, prompt]);

  return (
    <ConfirmDialogContext.Provider value={value}>
      {children}
      <ConfirmDialogSurface dialog={dialog} onClose={closeDialog} />
    </ConfirmDialogContext.Provider>
  );
};

function ConfirmDialogSurface({ dialog, onClose }) {
  if (!dialog) return null;
  return createPortal(
    <DialogCard dialog={dialog} onClose={onClose} />,
    document.body
  );
}

function DialogCard({ dialog, onClose }) {
  const { type, config } = dialog;
  const isPrompt = type === 'prompt';
  const [value, setValue] = useState(String(config.defaultValue ?? ''));
  const [touched, setTouched] = useState(false);

  const variant = String(config.variant || (isPrompt ? 'info' : 'warning')).toLowerCase();
  const title = config.title || (isPrompt ? 'Precision demandee' : 'Confirmation requise');
  const badge = config.badge || (isPrompt ? 'Saisie responsable' : 'Action importante');
  const confirmLabel = config.confirmLabel || (isPrompt ? 'Valider' : 'Confirmer');
  const cancelLabel = config.cancelLabel || 'Annuler';
  const required = Boolean(config.required);
  const invalid = isPrompt && required && touched && !value.trim();
  const Icon = variant === 'success' ? CheckCircle2 : variant === 'info' ? Info : isPrompt ? PencilLine : AlertTriangle;

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose(isPrompt ? null : false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isPrompt, onClose]);

  const handleConfirm = () => {
    if (isPrompt) {
      setTouched(true);
      if (required && !value.trim()) return;
      onClose(value);
      return;
    }
    onClose(true);
  };

  return (
    <div className="app-confirm-backdrop" role="presentation" onMouseDown={() => onClose(isPrompt ? null : false)}>
      <section
        className={`app-confirm-card app-confirm-${variant}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="app-confirm-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="app-confirm-head">
          <div className="app-confirm-icon" aria-hidden="true">
            <Icon size={22} />
          </div>
          <div>
            <span className="app-confirm-badge">{badge}</span>
            <h2 id="app-confirm-title">{title}</h2>
          </div>
          <button
            className="app-confirm-close"
            type="button"
            aria-label="Fermer"
            onClick={() => onClose(isPrompt ? null : false)}
          >
            <X size={18} />
          </button>
        </div>

        {config.message ? <p className="app-confirm-message">{config.message}</p> : null}
        {Array.isArray(config.details) && config.details.length ? (
          <ul className="app-confirm-details">
            {config.details.map((item) => (
              <li key={String(item)}>{item}</li>
            ))}
          </ul>
        ) : null}

        {isPrompt ? (
          <div className="app-confirm-field">
            {config.label ? <label htmlFor="app-confirm-input">{config.label}</label> : null}
            <textarea
              id="app-confirm-input"
              autoFocus
              rows={config.rows || 3}
              value={value}
              maxLength={config.maxLength || 500}
              placeholder={config.placeholder || ''}
              onChange={(event) => setValue(event.target.value)}
              onBlur={() => setTouched(true)}
            />
            {invalid ? <span className="app-confirm-error">Ce champ est obligatoire.</span> : null}
          </div>
        ) : null}

        <div className="app-confirm-actions">
          <button className="app-confirm-btn app-confirm-secondary" type="button" onClick={() => onClose(isPrompt ? null : false)}>
            {cancelLabel}
          </button>
          <button className="app-confirm-btn app-confirm-primary" type="button" onClick={handleConfirm}>
            {confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}

export default ConfirmDialogProvider;
