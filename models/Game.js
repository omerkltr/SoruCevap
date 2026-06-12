const mongoose = require('mongoose');

const gameSchema = new mongoose.Schema({
  hostId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, required: true, trim: true },
  joinOpen: { type: Boolean, default: true },
  status: { type: String, enum: ['waiting', 'started', 'ended'], default: 'waiting' },
  answerOpen: { type: Boolean, default: false },
  participants: [
    {
      userId: String,
      username: String,
      score: { type: Number, default: 0 },
      joinedAt: { type: Date, default: Date.now },
    },
  ],
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Game', gameSchema);
