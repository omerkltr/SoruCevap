const mongoose = require('mongoose');

const questionSchema = new mongoose.Schema({
  gameId: { type: mongoose.Schema.Types.ObjectId, ref: 'Game', required: true },
  text: { type: String, default: '' },
  imageUrl: { type: String, default: '' },
  questionType: { type: String, enum: ['multiple_choice', 'open_text'], default: 'multiple_choice' },
  options: [{ type: String }],
  optionImages: [{ type: String }],
  correctIndex: { type: Number, default: 0 },
  timeLimit: { type: Number, default: 30 },
  order: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Question', questionSchema);
