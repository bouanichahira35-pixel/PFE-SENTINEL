import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, ArrowLeft, AlertTriangle, CheckCircle } from 'lucide-react';
import logoETAP from '../../assets/logoETAP.png';
import './ForgotPassword.css';

const ForgotPassword = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const validateEmail = (email) => {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return regex.test(email);
  };

  const handleSubmit = async (e) => {
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

    setTimeout(() => {
      setIsLoading(false);
      setIsSuccess(true);
    }, 1500);
  };

  const handleBackToLogin = () => {
    navigate(-1);
  };

  if (isSuccess) {
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
              Un lien de reinitialisation a ete envoye a l'adresse :
            </p>
            <p className="success-email">{email}</p>
            <p className="success-hint">
              Verifiez votre boite de reception et suivez les instructions.
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
            Entrez votre adresse email pour recevoir un lien de reinitialisation
          </p>

          <form onSubmit={handleSubmit} className="forgot-form">
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
                <span>Envoyer le lien</span>
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
