const mongoose = require('mongoose');

const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/pfe_sentinel';

mongoose.connect(uri)
  .then(() => console.log('Mongo connecté'))
  .catch((err) => console.error('Mongo erreur:', err));

module.exports = mongoose;
