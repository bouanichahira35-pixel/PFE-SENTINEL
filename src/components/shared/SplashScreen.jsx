import { useEffect, useState } from 'react';
import logoETAP from '../../assets/logoETAP.png';
import './SplashScreen.css';

const SplashScreen = ({ onComplete }) => {
  const [fadeOut, setFadeOut] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setFadeOut(true);
      setTimeout(() => {
        onComplete();
      }, 500);
    }, 2500);

    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <div className={`splash-screen ${fadeOut ? 'fade-out' : ''}`}>
      <div className="splash-content">
        <div className="splash-logo-container">
          <img src={logoETAP} alt="ETAP Logo" className="splash-logo" />
        </div>
        <div className="splash-loader">
          <div className="splash-loader-bar"></div>
        </div>
        <p className="splash-text">Chargement...</p>
      </div>
    </div>
  );
};

export default SplashScreen;
