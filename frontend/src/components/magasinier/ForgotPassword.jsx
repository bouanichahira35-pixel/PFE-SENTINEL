import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, AlertTriangle, ArrowRight, ArrowLeft, CheckCircle } from 'lucide-react';
import logoETAP from '../../assets/logoETAP.png';
import './ForgotPassword.css';

const ForgotPassword = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const validateEmail = (email) => {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return regex.test(email);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!email) {
      setError('Veuillez entrer votre adresse e-mail');
      return;
    }

    if (!validateEmail(email)) {
      setError('Veuillez entrer une adresse e-mail valide');
      return;
    }

    setIsLoading(true);
    setError('');

    // Simulation d'envoi
    setTimeout(() => {
      setIsLoading(false);
      setIsSubmitted(true);
    }, 1500);
  };

  const handleBackToLogin = () => {
    navigate('/login');
  };

  if (isSubmitted) {
    return (
      <div className="forgot-page">
        <div className="forgot-container">
          <div className="forgot-card success-card">
            <div className="forgot-logo-container">
              <img src={logoETAP} alt="ETAP Logo" className="forgot-logo" />
            </div>
            
            <div className="success-icon">
              <CheckCircle size={64} />
            </div>
            <h2 className="success-title">E-mail envoyé !</h2>
            <p className="success-message">
              Un lien de réinitialisation a été envoyé à <strong>{email}</strong>. 
              Veuillez vérifier votre boîte de réception.
            </p>
            
            <button onClick={handleBackToLogin} className="forgot-back-button">
              <ArrowLeft size={16} />
              <span>Retour à la connexion</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="forgot-page">
      <div className="forgot-container">
        <div className="forgot-card">
          {/* Logo animé */}
          <div className="forgot-logo-container">
            <img src={logoETAP} alt="ETAP Logo" className="forgot-logo" />
          </div>

          {/* Titre */}
          <div className="forgot-header">
            <h1 className="forgot-title">Mot de passe oublié ?</h1>
            <p className="forgot-subtitle">
              Entrez votre adresse e-mail et nous vous enverrons un lien pour réinitialiser votre mot de passe.
            </p>
          </div>

          {/* Formulaire */}
          <form onSubmit={handleSubmit} className="forgot-form">
            <div className="forgot-field">
              <label htmlFor="email" className="forgot-label">
                Adresse e-mail
              </label>
              <div className="forgot-input-wrapper">
                <Mail size={18} className="forgot-input-icon" />
                <input
                  type="email"
                  id="email"
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
              className={`forgot-submit-button ${isLoading ? 'loading' : ''}`}
              disabled={isLoading}
            >
              {isLoading ? (
                <span className="forgot-spinner"></span>
              ) : (
                <>
                  <span>Envoyer le lien</span>
                  <ArrowRight size={18} className="forgot-button-icon" />
                </>
              )}
            </button>

            <button
              type="button"
              className="forgot-back-button"
              onClick={handleBackToLogin}
            >
              <ArrowLeft size={16} />
              <span>Retour à la connexion</span>
            </button>
          </form>
        </div>

        {/* Footer */}
        <p className="forgot-footer">
          © 2025 ETAP - Tous droits réservés
        </p>
      </div>
    </div>
  );
};

export default ForgotPassword;
