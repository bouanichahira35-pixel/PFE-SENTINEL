import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, Lock, AlertTriangle, Eye } from 'lucide-react';
import logoETAP from '../../assets/logoETAP.png';
import { post } from '../../services/api';
import { HOME_PATH_BY_ROLE } from '../../constants/roles';
import './LoginPage.css';

const LoginPage = ({ onLogin }) => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    username: '',
    password: ''
  });
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const revealTimerRef = useRef(null);

  useEffect(() => {
    return () => {
      if (revealTimerRef.current) clearTimeout(revealTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const logoutMessage = sessionStorage.getItem('logoutReason');
    if (logoutMessage) {
      setError(logoutMessage);
      sessionStorage.removeItem('logoutReason');
    }
  }, []);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const identifier = String(formData.username || '').trim();
      const password = String(formData.password || '');

      if (!identifier || !password) {
        setError('Veuillez remplir tous les champs');
        return;
      }

      const data = await post('/auth/login', {
        identifier,
        password,
      });

      const normalizedRole = String(data?.user?.role || '').toLowerCase();
      const redirectPath = HOME_PATH_BY_ROLE[normalizedRole];
      if (!redirectPath) {
        setError('Role utilisateur invalide');
        return;
      }

      onLogin(data.user, data.token, data.refreshToken, data.session_id);
      navigate(redirectPath, { replace: true });
    } catch (err) {
      // UX: for security, keep the same generic message for invalid credentials.
      const message = String(err.message || '');
      if (
        message.includes('Utilisateur introuvable') ||
        message.includes('Mot de passe incorrect') ||
        message.includes('Compte bloque') ||
        message.includes('Role invalide')
      ) {
        setError('Mot de passe incorrect');
      } else {
        setError(message || 'Erreur de connexion');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = () => {
    navigate('/mot-de-passe-oublie');
  };

  const handleRevealPassword = () => {
    setShowPassword(true);
    if (revealTimerRef.current) clearTimeout(revealTimerRef.current);
    revealTimerRef.current = setTimeout(() => setShowPassword(false), 2000);
  };

  return (
    <div className="login-page">
      <div className="login-shape login-shape-1"></div>
      <div className="login-shape login-shape-2"></div>
      <div className="login-shape login-shape-3"></div>

      <div className="login-container">
        <div className="login-card">
          <div className="login-logo-container">
            <img src={logoETAP} alt="ETAP Logo" className="login-logo" />
          </div>

          <p className="login-subtitle">Systeme de Gestion de Stock</p>

          <form onSubmit={handleSubmit} className="login-form">
            <div className="login-field">
              <label htmlFor="username" className="login-label">
                Nom d'utilisateur
              </label>
              <div className="login-input-wrapper">
                <User size={20} className="login-input-icon" />
                <input
                  type="text"
                  id="username"
                  name="username"
                  value={formData.username}
                  onChange={handleChange}
                  placeholder="Entrez votre nom d'utilisateur"
                  className="login-input"
                  autoComplete="username"
                />
              </div>
            </div>

            <div className="login-field">
              <label htmlFor="password" className="login-label">
                Mot de passe
              </label>
              <div className="login-input-wrapper">
                <Lock size={20} className="login-input-icon" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  id="password"
                  name="password"
                  value={formData.password}
                  onChange={handleChange}
                  placeholder="Entrez votre mot de passe"
                  className="login-input"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  className="login-password-peek"
                  onClick={handleRevealPassword}
                  aria-label="Afficher le mot de passe pendant 2 secondes"
                  title="Afficher 2 secondes"
                >
                  <Eye size={18} />
                </button>
              </div>
            </div>

            {error && (
              <div className="login-error">
                <AlertTriangle size={16} />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              className={`login-button ${isLoading ? 'loading' : ''}`}
              disabled={isLoading}
            >
              {isLoading ? (
                <span className="login-spinner"></span>
              ) : (
                <span>Se Connecter</span>
              )}
            </button>

            <button
              type="button"
              className="login-forgot-button"
              onClick={handleForgotPassword}
            >
              Mot de passe oublie ?
            </button>
          </form>

          <div className="login-divider"></div>

          <p className="login-company">
            ETAP - Entreprise Tunisienne d'Activites Petrolieres
          </p>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
