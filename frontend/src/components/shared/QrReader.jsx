// src/components/shared/QrReader.jsx
import React from "react";
import QRReader from "react-qr-reader";  // Assurez-vous d'importer le composant QRReader
import { toast } from 'react-toastify';  // Pour afficher des notifications

const QrReader = ({ onScan, onError }) => {
  // Fonction de gestion de la lecture du QR code
  const handleScan = (data) => {
    if (data) {
      console.log("QR Code Data: ", data);
      toast.success("QR Code scanné avec succès !");  // Affiche un message de succès
      onScan(data);  // Utiliser le callback onScan pour traiter les données scannées
    }
  };

  // Fonction pour gérer les erreurs
  const handleError = (err) => {
    console.error("Erreur du scanner QR: ", err);
    toast.error("Erreur lors du scan du QR Code");  // Affiche un message d'erreur
    onError(err);  // Utiliser le callback onError pour traiter les erreurs
  };

  return (
    <div>
      <h3>Scanner un QR Code</h3>
      <QRReader
        delay={300}
        onScan={handleScan}
        onError={handleError}
        style={{ width: '100%', maxWidth: 400 }}
      />
    </div>
  );
};

export default QrReader;
