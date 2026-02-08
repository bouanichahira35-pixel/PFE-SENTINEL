const mongoose = require('mongoose');

// Connexion à MongoDB
mongoose.connect('mongodb://localhost:27017/pfe_sentinel', { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => {
    console.log('Connexion à MongoDB réussie');
  })
  .catch((err) => {
    console.error('Erreur de connexion MongoDB:', err);
  });
