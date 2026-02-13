const mongoose = require('../db');

const sequenceSchema = new mongoose.Schema(
  {
    counter_name: { type: String, required: true, unique: true },
    seq: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Sequence', sequenceSchema);
