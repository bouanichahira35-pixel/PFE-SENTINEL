import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, Lock, AlertTriangle } from 'lucide-react';
import logoETAP from '../../assets/logoETAP.png';
import './LoginPage.css';

const LoginPage = ({ role, roleName, onLogin, redirectPath }) => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    username: '',
    password: ''
  });
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);

    setTimeout(() => {
      if (formData.username && formData.password) {
        onLogin(formData.username, role);
        navigate(redirectPath);
      } else {
        setError('Veuillez remplir tous les champs');
      }
      setIsLoading(false);
    }, 1000);
  };

  const handleForgotPassword = () => {
    navigate('/mot-de-passe-oublie');
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

          <h1 className="login-title">{roleName}</h1>
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
                  type="password"
                  id="password"
                  name="password"
                  value={formData.password}
                  onChange={handleChange}
                  placeholder="Entrez votre mot de passe"
                  className="login-input"
                  autoComplete="current-password"
                />
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
