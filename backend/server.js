const express = require('express');
const mongoose = require('mongoose');
const app = express();

// Middleware pour analyser le corps des requêtes JSON
app.use(express.json());

// Lancer le serveur
const PORT = 5000;
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

// Connexion à MongoDB avec Mongoose
mongoose.connect('mongodb://localhost:27017/pfe-sentinel')
  .then(() => {
    console.log('Connexion à MongoDB réussie!');
  })
  .catch((err) => {
    console.log('Erreur de connexion à MongoDB:', err);
  });
