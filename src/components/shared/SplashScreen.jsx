// BLOC 1 - Role du fichier.
// Ce fichier fournit un composant React partage pour SplashScreen.
// Point de vigilance: garder les props, appels API et classes CSS synchronises avec les ecrans existants.

import { useEffect, useState } from 'react';
import logoETAP from '../../assets/logoETAP.png';
import './SplashScreen.css';

const SPLASH_DURATION_MS = 450;
const SPLASH_FADE_MS = 180;

const SplashScreen = ({ onComplete }) => {
  const [fadeOut, setFadeOut] = useState(false);

  useEffect(() => {
    let completeTimer = null;
    const timer = setTimeout(() => {
      setFadeOut(true);
      completeTimer = setTimeout(() => {
        onComplete();
      }, SPLASH_FADE_MS);
    }, SPLASH_DURATION_MS);

    return () => {
      clearTimeout(timer);
      if (completeTimer) clearTimeout(completeTimer);
    };
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
