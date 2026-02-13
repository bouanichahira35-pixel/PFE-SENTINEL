import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Mail, ArrowLeft, AlertTriangle, CheckCircle, ShieldCheck, Lock } from 'lucide-react';
import logoETAP from '../../assets/logoETAP.png';
import { post } from '../../services/api';
import './ForgotPassword.css';

const ForgotPassword = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const roleFromLogin = location.state?.role || 'demandeur';
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [step, setStep] = useState('request');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const validateEmail = (value) => {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return regex.test(value);
  };

  const validatePassword = (value) => {
    // Keep initial policy simple and aligned with backend minimum length.
    if (!value || value.length < 8) return false;
    const regex = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;
    return regex.test(value);
  };

  const handleRequestCode = async (e) => {
    e.preventDefault();
    setError('');

    if (!email) {
      setError('Veuillez entrer votre adresse email');
      return;
    }

    if (!validateEmail(email)) {
      setError('Veuillez entrer une adresse email valide');
      return;
    }

    setIsLoading(true);

    try {
      await post('/auth/forgot-password/request', {
        email,
        role: roleFromLogin,
      });
      setStep('verify');
    } catch (err) {
      setError(err.message || "Erreur lors de l'envoi du code");
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyCode = async (e) => {
    e.preventDefault();
    setError('');

    if (!code.trim()) {
      setError('Veuillez entrer le code recu');
      return;
    }

    setIsLoading(true);

    try {
      const data = await post('/auth/forgot-password/verify', {
        email,
        role: roleFromLogin,
        code: code.replace(/\s/g, ''),
      });

      setResetToken(data.resetToken);
      setStep('reset');
    } catch (err) {
      setError(err.message || 'Code invalide ou expire');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setError('');

    if (!validatePassword(newPassword)) {
      setError('Le mot de passe doit contenir au moins 8 caracteres avec lettres et chiffres');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Les mots de passe ne correspondent pas');
      return;
    }

    setIsLoading(true);

    try {
      await post('/auth/forgot-password/reset', {
        resetToken,
        newPassword,
        confirmPassword,
      });

      setStep('success');
    } catch (err) {
      setError(err.message || 'Erreur lors de la reinitialisation');
    } finally {
      setIsLoading(false);
    }
  };

  const handleBackToLogin = () => {
    navigate(-1);
  };

  if (step === 'success') {
    return (
      <div className="forgot-page">
        <div className="forgot-shape forgot-shape-1"></div>
        <div className="forgot-shape forgot-shape-2"></div>
        <div className="forgot-shape forgot-shape-3"></div>

        <div className="forgot-container">
          <div className="forgot-card success-card">
            <div className="success-icon-container">
              <CheckCircle size={64} className="success-icon" />
            </div>
            <h2 className="success-title">Email envoye</h2>
            <p className="success-message">
              Votre mot de passe a ete reinitialise avec succes pour :
            </p>
            <p className="success-email">{email}</p>
            <p className="success-hint">
              Vous pouvez maintenant vous reconnecter.
            </p>
            <button
              type="button"
              className="forgot-back-button"
              onClick={handleBackToLogin}
            >
              <ArrowLeft size={18} />
              <span>Retour a la connexion</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="forgot-page">
      <div className="forgot-shape forgot-shape-1"></div>
      <div className="forgot-shape forgot-shape-2"></div>
      <div className="forgot-shape forgot-shape-3"></div>

      <div className="forgot-container">
        <div className="forgot-card">
          <div className="forgot-logo-container">
            <img src={logoETAP} alt="ETAP Logo" className="forgot-logo" />
          </div>

          <h1 className="forgot-title">Mot de passe oublie</h1>
          <p className="forgot-subtitle">
            {step === 'request' && "Entrez votre adresse email pour recevoir un code de reinitialisation"}
            {step === 'verify' && 'Entrez le code recu par email'}
            {step === 'reset' && 'Definissez un nouveau mot de passe'}
          </p>

          {step === 'request' && (
            <form onSubmit={handleRequestCode} className="forgot-form">
              <div className="forgot-field">
                <label htmlFor="email" className="forgot-label">
                  Adresse email
                </label>
                <div className="forgot-input-wrapper">
                  <Mail size={20} className="forgot-input-icon" />
                  <input
                    type="email"
                    id="email"
                    name="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setError('');
                    }}
                    placeholder="exemple@etap.com.tn"
                    className="forgot-input"
                    autoComplete="email"
                  />
                </div>
              </div>

              {error && (
                <div className="forgot-error">
                  <AlertTriangle size={16} />
                  <span>{error}</span>
                </div>
              )}

              <button
                type="submit"
                className={`forgot-button ${isLoading ? 'loading' : ''}`}
                disabled={isLoading}
              >
                {isLoading ? (
                  <span className="forgot-spinner"></span>
                ) : (
                  <span>Envoyer le code</span>
                )}
              </button>

              <button
                type="button"
                className="forgot-back-link"
                onClick={handleBackToLogin}
              >
                <ArrowLeft size={16} />
                <span>Retour a la connexion</span>
              </button>
            </form>
          )}

          {step === 'verify' && (
            <form onSubmit={handleVerifyCode} className="forgot-form">
              <div className="forgot-field">
                <label htmlFor="otp" className="forgot-label">
                  Code de verification
                </label>
                <div className="forgot-input-wrapper">
                  <ShieldCheck size={20} className="forgot-input-icon" />
                  <input
                    type="text"
                    id="otp"
                    name="otp"
                    value={code}
                    onChange={(e) => {
                      setCode(e.target.value);
                      setError('');
                    }}
                    placeholder="Ex: 123456"
                    className="forgot-input"
                    autoComplete="one-time-code"
                  />
                </div>
              </div>

              {error && (
                <div className="forgot-error">
                  <AlertTriangle size={16} />
                  <span>{error}</span>
                </div>
              )}

              <button
                type="submit"
                className={`forgot-button ${isLoading ? 'loading' : ''}`}
                disabled={isLoading}
              >
                {isLoading ? (
                  <span className="forgot-spinner"></span>
                ) : (
                  <span>Verifier le code</span>
                )}
              </button>

              <button
                type="button"
                className="forgot-back-link"
                onClick={() => setStep('request')}
              >
                <ArrowLeft size={16} />
                <span>Revenir a l'etape email</span>
              </button>
            </form>
          )}

          {step === 'reset' && (
            <form onSubmit={handleResetPassword} className="forgot-form">
              <div className="forgot-field">
                <label htmlFor="newPassword" className="forgot-label">
                  Nouveau mot de passe
                </label>
                <div className="forgot-input-wrapper">
                  <Lock size={20} className="forgot-input-icon" />
                  <input
                    type="password"
                    id="newPassword"
                    name="newPassword"
                    value={newPassword}
                    onChange={(e) => {
                      setNewPassword(e.target.value);
                      setError('');
                    }}
                    placeholder="Minimum 8 caracteres"
                    className="forgot-input"
                    autoComplete="new-password"
                  />
                </div>
              </div>

              <div className="forgot-field">
                <label htmlFor="confirmPassword" className="forgot-label">
                  Confirmer le mot de passe
                </label>
                <div className="forgot-input-wrapper">
                  <Lock size={20} className="forgot-input-icon" />
                  <input
                    type="password"
                    id="confirmPassword"
                    name="confirmPassword"
                    value={confirmPassword}
                    onChange={(e) => {
                      setConfirmPassword(e.target.value);
                      setError('');
                    }}
                    placeholder="Retapez le mot de passe"
                    className="forgot-input"
                    autoComplete="new-password"
                  />
                </div>
              </div>

              {error && (
                <div className="forgot-error">
                  <AlertTriangle size={16} />
                  <span>{error}</span>
                </div>
              )}

              <button
                type="submit"
                className={`forgot-button ${isLoading ? 'loading' : ''}`}
                disabled={isLoading}
              >
                {isLoading ? (
                  <span className="forgot-spinner"></span>
                ) : (
                  <span>Confirmer le nouveau mot de passe</span>
                )}
              </button>
            </form>
          )}

          <div className="forgot-divider"></div>

          <p className="forgot-company">
            ETAP - Entreprise Tunisienne d'Activites Petrolieres
          </p>
        </div>
      </div>
    </div>
  );
};

export default ForgotPassword;
