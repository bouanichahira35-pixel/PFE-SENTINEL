// BLOC 1 - Role du fichier.
// Ce fichier participe au fonctionnement du module index.
// Point de vigilance: modifier avec prudence car ce fichier peut etre importe par plusieurs modules.

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.js';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
