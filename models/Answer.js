const mongoose = require('mongoose');

const answerSchema = new mongoose.Schema({
  gameId: { type: mongoose.Schema.Types.ObjectId, ref: 'Game', required: true },
  questionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Question', required: true },
  userId: { type: String, required: true },
  username: { type: String, required: true },
  selectedIndex: { type: Number, default: null },
  answerText: { type: String, default: '' },
  isCorrect: { type: Boolean, default: false },
  answeredAt: { type: Date, default: Date.now },
  timeTaken: { type: Number, default: 0 }, // ms cinsinden
  score: { type: Number, default: 0 },
});

module.exports = mongoose.model('Answer', answerSchema);
