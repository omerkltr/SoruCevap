const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Game = require('../models/Game');
const Question = require('../models/Question');
const Answer = require('../models/Answer');

const webHostUsernames = (process.env.WEB_HOST_USERNAMES || process.env.WEB_HOST_USERNAME || 'example')
  .split(',')
  .map((name) => name.trim().toLowerCase())
  .filter(Boolean);

function isWebHostRequest(req) {
  return req.get('x-web-host') === '1';
}

function canCreateFromWeb(user) {
  if (!webHostUsernames.length) return true;
  return webHostUsernames.includes((user.name || '').trim().toLowerCase());
}

// Oyun oluştur
router.post('/create', auth, async (req, res) => {
  try {
    const { title } = req.body;
    if (isWebHostRequest(req) && !canCreateFromWeb(req.user)) {
      return res.status(403).json({
        message: 'Bu kullanici web uzerinden oyun olusturamaz',
        allowedUsernames: webHostUsernames,
      });
    }
    if (!title) return res.status(400).json({ message: 'Başlık zorunludur' });

    const game = await Game.create({
      hostId: req.user._id,
      title,
      joinOpen: true,
      status: 'waiting',
    });

    res.status(201).json({ game });
  } catch (err) {
    res.status(500).json({ message: 'Sunucu hatası' });
  }
});

// Oyunlarımı listele
router.get('/my', auth, async (req, res) => {
  try {
    const games = await Game.find({ hostId: req.user._id }).sort({ createdAt: -1 });
    res.json({ games });
  } catch {
    res.status(500).json({ message: 'Sunucu hatası' });
  }
});

// Web: Aktif oyunları listele (herkese açık) — /:id'den ÖNCE
router.get('/active', async (req, res) => {
  try {
    const games = await Game.find({ status: { $ne: 'ended' } }).sort({ createdAt: -1 });
    const result = await Promise.all(games.map(async (g) => {
      const questionCount = await Question.countDocuments({ gameId: g._id });
      return {
        id: g._id,
        title: g.title,
        participantCount: g.participants.length,
        questionCount,
        status: g.status,
        joinOpen: g.joinOpen,
      };
    }));
    res.json({ games: result });
  } catch {
    res.status(500).json({ message: 'Sunucu hatası' });
  }
});

// Web: Oyuna katıl — /:id'den ÖNCE
router.post('/join', async (req, res) => {
  try {
    const { gameId } = req.body;
    const game = await Game.findById(gameId);
    if (!game) return res.status(404).json({ message: 'Oyun bulunamadı' });
    if (game.status === 'ended') return res.status(403).json({ message: 'Oyun sona erdi' });
    res.json({ gameId: game._id, title: game.title, status: game.status });
  } catch {
    res.status(500).json({ message: 'Sunucu hatası' });
  }
});

// Oyun detayı
router.get('/:id', auth, async (req, res) => {
  try {
    const game = await Game.findOne({ _id: req.params.id, hostId: req.user._id });
    if (!game) return res.status(404).json({ message: 'Oyun bulunamadı' });
    const questions = await Question.find({ gameId: game._id }).sort({ order: 1 });
    res.json({ game, questions });
  } catch {
    res.status(500).json({ message: 'Sunucu hatası' });
  }
});

// Oyun güncelle
router.patch('/:id', auth, async (req, res) => {
  try {
    const game = await Game.findOne({ _id: req.params.id, hostId: req.user._id });
    if (!game) return res.status(404).json({ message: 'Oyun bulunamadı' });

    const { answerOpen, status, title } = req.body;
    if (answerOpen !== undefined) game.answerOpen = answerOpen;
    if (status !== undefined) game.status = status;
    if (title !== undefined) {
      if (!String(title).trim()) return res.status(400).json({ message: 'Başlık zorunludur' });
      game.title = String(title).trim();
    }
    await game.save();

    res.json({ game });
  } catch {
    res.status(500).json({ message: 'Sunucu hatası' });
  }
});

// Oyunu sil
router.delete('/:id', auth, async (req, res) => {
  try {
    const filter = canCreateFromWeb(req.user) ? { _id: req.params.id } : { _id: req.params.id, hostId: req.user._id };
    const game = await Game.findOneAndDelete(filter);
    if (!game) return res.status(404).json({ message: 'Oyun bulunamadı' });
    await Question.deleteMany({ gameId: game._id });
    await Answer.deleteMany({ gameId: game._id });
    res.json({ message: 'Oyun silindi' });
  } catch {
    res.status(500).json({ message: 'Sunucu hatası' });
  }
});

// Soru ekle
router.post('/:id/questions', auth, async (req, res) => {
  try {
    const game = await Game.findOne({ _id: req.params.id, hostId: req.user._id });
    if (!game) return res.status(404).json({ message: 'Oyun bulunamadı' });

    const { text, imageUrl, options, optionImages, correctIndex, timeLimit, questionType } = req.body;
    const type = questionType === 'open_text' ? 'open_text' : 'multiple_choice';
    if (!text && !imageUrl) return res.status(400).json({ message: 'Soru metni veya dosya zorunludur' });
    if (type === 'open_text') {
      const count = await Question.countDocuments({ gameId: game._id });
      const question = await Question.create({
        gameId: game._id, text: text || '', imageUrl: imageUrl || '',
        questionType: type, options: [], optionImages: [], correctIndex: 0,
        timeLimit: timeLimit || 30, order: count,
      });
      return res.status(201).json({ question });
    }
    if (!Array.isArray(options) || options.length < 2 || options.length > 10 || correctIndex === undefined) {
      return res.status(400).json({ message: '2 ile 10 arasinda secenek ve dogru cevap zorunludur' });
    }
    const correct = Number(correctIndex);
    if (!Number.isInteger(correct) || correct < 0 || correct >= options.length) {
      return res.status(400).json({ message: 'Dogru cevap secenekler arasinda olmalidir' });
    }
    const optImgs = Array.isArray(optionImages) ? optionImages.slice(0, options.length) : [];
    while (optImgs.length < options.length) optImgs.push('');
    for (let i = 0; i < options.length; i++) {
      options[i] = options[i] || '';
      if (!options[i] && !optImgs[i]) return res.status(400).json({ message: `${i + 1}. secenek icin metin veya dosya zorunludur` });
    }

    const count = await Question.countDocuments({ gameId: game._id });
    const question = await Question.create({
      gameId: game._id, text: text || '', imageUrl: imageUrl || '',
      questionType: type, options, optionImages: optImgs, correctIndex: correct,
      timeLimit: timeLimit || 30, order: count,
    });

    res.status(201).json({ question });
  } catch {
    res.status(500).json({ message: 'Sunucu hatası' });
  }
});

// Soruları listele
router.get('/:id/questions', auth, async (req, res) => {
  try {
    const game = await Game.findOne({ _id: req.params.id, hostId: req.user._id });
    if (!game) return res.status(404).json({ message: 'Oyun bulunamadı' });
    const questions = await Question.find({ gameId: game._id }).sort({ order: 1 });
    res.json({ questions });
  } catch {
    res.status(500).json({ message: 'Sunucu hatası' });
  }
});

// Soru düzenle
router.patch('/:id/questions/:qid', auth, async (req, res) => {
  try {
    const game = await Game.findOne({ _id: req.params.id, hostId: req.user._id });
    if (!game) return res.status(404).json({ message: 'Oyun bulunamadı' });

    const question = await Question.findOne({ _id: req.params.qid, gameId: game._id });
    if (!question) return res.status(404).json({ message: 'Soru bulunamadı' });

    const { text, imageUrl, options, optionImages, correctIndex, timeLimit, questionType } = req.body;
    const type = questionType === 'open_text' ? 'open_text' : 'multiple_choice';
    if (!text && !imageUrl) return res.status(400).json({ message: 'Soru metni veya dosya zorunludur' });

    question.text = text || '';
    question.imageUrl = imageUrl || '';
    question.questionType = type;
    question.timeLimit = timeLimit || 30;

    if (type === 'open_text') {
      question.options = [];
      question.optionImages = [];
      question.correctIndex = 0;
    } else {
      if (!Array.isArray(options) || options.length < 2 || options.length > 10 || correctIndex === undefined) {
        return res.status(400).json({ message: '2 ile 10 arasinda secenek ve dogru cevap zorunludur' });
      }
      const correct = Number(correctIndex);
      if (!Number.isInteger(correct) || correct < 0 || correct >= options.length) {
        return res.status(400).json({ message: 'Dogru cevap secenekler arasinda olmalidir' });
      }
      const optImgs = Array.isArray(optionImages) ? optionImages.slice(0, options.length) : [];
      while (optImgs.length < options.length) optImgs.push('');
      for (let i = 0; i < options.length; i++) {
        options[i] = options[i] || '';
        if (!options[i] && !optImgs[i]) return res.status(400).json({ message: `${i + 1}. secenek icin metin veya dosya zorunludur` });
      }
      question.options = options;
      question.optionImages = optImgs;
      question.correctIndex = correct;
    }

    await question.save();
    res.json({ question });
  } catch (err) {
    console.error('question update error:', err);
    res.status(500).json({ message: 'Sunucu hatası' });
  }
});

// Soru sil
router.delete('/:id/questions/:qid', auth, async (req, res) => {
  try {
    const game = await Game.findOne({ _id: req.params.id, hostId: req.user._id });
    if (!game) return res.status(404).json({ message: 'Oyun bulunamadı' });
    await Question.findOneAndDelete({ _id: req.params.qid, gameId: game._id });
    res.json({ message: 'Soru silindi' });
  } catch {
    res.status(500).json({ message: 'Sunucu hatası' });
  }
});

// HTTP üzerinden soru yayınla
router.post('/:id/broadcast-question', auth, async (req, res) => {
  try {
    const game = await Game.findOne({ _id: req.params.id, hostId: req.user._id });
    if (!game) return res.status(404).json({ message: 'Oyun bulunamadı' });

    const { questionId } = req.body;
    const question = await Question.findById(questionId);
    if (!question) return res.status(404).json({ message: 'Soru bulunamadı' });

    const gameRooms = req.gameRooms;
    if (!gameRooms.has(req.params.id)) {
      gameRooms.set(req.params.id, { hostSocketId: null, players: new Map(), currentQuestion: null, sentQuestions: new Set(), correctCounts: new Map(), questionScores: new Map() });
    }
    const room = gameRooms.get(req.params.id);
    if (!room.sentQuestions) room.sentQuestions = new Set();

    // Daha önce gönderildi mi?
    if (room.sentQuestions.has(questionId)) {
      return res.status(409).json({ message: 'Bu soru zaten gönderildi' });
    }

    room.sentQuestions.add(questionId);
    room.currentQuestion = { id: questionId, startTime: Date.now() };

    req.io.to(`game:${req.params.id}`).emit('question:new', {
      id: question._id,
      text: question.text,
      imageUrl: question.imageUrl || '',
      questionType: question.questionType || 'multiple_choice',
      options: question.options,
      optionImages: question.optionImages || [],
      timeLimit: question.timeLimit,
      correctIndex: question.correctIndex,
    });

    res.json({ message: 'Soru yayınlandı' });
  } catch (err) {
    console.error('broadcast-question error:', err);
    res.status(500).json({ message: 'Sunucu hatası' });
  }
});

// HTTP üzerinden oyunu başlat bildirimi
router.post('/:id/broadcast-start', auth, async (req, res) => {
  try {
    const game = await Game.findOne({ _id: req.params.id, hostId: req.user._id });
    if (!game) return res.status(404).json({ message: 'Oyun bulunamadı' });
    req.io.to(`game:${req.params.id}`).emit('game:started');
    res.json({ message: 'Yayınlandı' });
  } catch {
    res.status(500).json({ message: 'Sunucu hatası' });
  }
});

// Oyunu bitir (HTTP)
router.post('/:id/end', auth, async (req, res) => {
  try {
    const game = await Game.findOne({ _id: req.params.id, hostId: req.user._id });
    if (!game) return res.status(404).json({ message: 'Oyun bulunamadı' });
    game.status = 'ended';
    game.answerOpen = false;
    await game.save();
    const allAnswers = await Answer.find({ gameId: game._id });
    const questions = await Question.find({ gameId: game._id }).select('_id questionType');
    const scoredQuestionIds = new Set(questions.filter(q => (q.questionType || 'multiple_choice') !== 'open_text').map(q => q._id.toString()));
    const userStats = new Map();
    for (const a of allAnswers) {
      if (!scoredQuestionIds.has(a.questionId.toString())) continue;
      if (!userStats.has(a.userId)) userStats.set(a.userId, { username: a.username, correctCount: 0, totalTime: 0 });
      const s = userStats.get(a.userId);
      if (a.isCorrect) s.correctCount++;
      s.totalTime += (a.timeTaken || 0);
    }
    const leaderboard = [...userStats.values()]
      .sort((a, b) => b.correctCount - a.correctCount || a.totalTime - b.totalTime)
      .map((p, i) => ({ rank: i + 1, username: p.username, score: p.correctCount, totalTime: p.totalTime }));
    req.io.to(`game:${req.params.id}`).emit('game:end', leaderboard);
    req.gameRooms.delete(req.params.id);
    res.json({ message: 'Oyun bitti', leaderboard });
  } catch (err) {
    console.error('end game error:', err);
    res.status(500).json({ message: 'Sunucu hatası' });
  }
});

// Leaderboard (doğru sayısı + hız)
router.get('/:id/leaderboard', auth, async (req, res) => {
  try {
    const game = await Game.findOne({ _id: req.params.id, hostId: req.user._id });
    if (!game) return res.status(404).json({ message: 'Oyun bulunamadı' });
    const answers = await Answer.find({ gameId: game._id });
    const questions = await Question.find({ gameId: game._id }).select('_id questionType');
    const scoredQuestionIds = new Set(questions.filter(q => (q.questionType || 'multiple_choice') !== 'open_text').map(q => q._id.toString()));
    const userStats = new Map();
    for (const a of answers) {
      if (!scoredQuestionIds.has(a.questionId.toString())) continue;
      if (!userStats.has(a.userId)) userStats.set(a.userId, { username: a.username, correctCount: 0, totalTime: 0 });
      const s = userStats.get(a.userId);
      if (a.isCorrect) s.correctCount++;
      s.totalTime += (a.timeTaken || 0);
    }
    const leaderboard = [...userStats.values()]
      .sort((a, b) => b.correctCount - a.correctCount || a.totalTime - b.totalTime)
      .map((p, i) => ({ rank: i + 1, username: p.username, score: p.correctCount, totalTime: p.totalTime }));
    res.json({ leaderboard });
  } catch {
    res.status(500).json({ message: 'Sunucu hatası' });
  }
});

// Soru bazlı cevap dağılımı (her seçenek için kimlerin cevap verdiği)
router.get('/:id/question-scores', auth, async (req, res) => {
  try {
    const game = await Game.findOne({ _id: req.params.id, hostId: req.user._id });
    if (!game) return res.status(404).json({ message: 'Oyun bulunamadı' });

    const questions = await Question.find({ gameId: game._id }).sort({ order: 1 });
    const result = [];

    for (const q of questions) {
      const answers = await Answer.find({ gameId: game._id, questionId: q._id }).sort({ timeTaken: 1 });
      if ((q.questionType || 'multiple_choice') === 'open_text') {
        result.push({
          questionId: q._id.toString(),
          questionText: q.text,
          questionImage: q.imageUrl || '',
          questionType: 'open_text',
          order: q.order,
          correctIndex: null,
          options: [],
          openAnswers: answers.map(a => ({
            username: a.username,
            answerText: a.answerText || '',
            timeTaken: a.timeTaken || 0,
            answeredAt: a.answeredAt,
          })),
          totalAnswers: answers.length,
        });
        continue;
      }
      const options = q.options.map((optText, idx) => ({
        optionIndex: idx,
        optionText: optText,
        isCorrect: idx === q.correctIndex,
        users: answers
          .filter(a => a.selectedIndex === idx)
          .map(a => ({ username: a.username, timeTaken: a.timeTaken || 0 })),
      }));
      result.push({
        questionId: q._id.toString(),
        questionText: q.text,
        questionImage: q.imageUrl || '',
        questionType: q.questionType || 'multiple_choice',
        order: q.order,
        correctIndex: q.correctIndex,
        options: options.map((o, idx) => ({ ...o, optionImage: (q.optionImages || [])[idx] || '' })),
        totalAnswers: answers.length,
      });
    }

    res.json({ questions: result });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Sunucu hatası' });
  }
});

// Stats
router.get('/:id/stats', auth, async (req, res) => {
  try {
    const game = await Game.findOne({ _id: req.params.id, hostId: req.user._id });
    if (!game) return res.status(404).json({ message: 'Oyun bulunamadı' });
    const questionCount = await Question.countDocuments({ gameId: game._id });
    res.json({
      activeParticipants: game.participants.length,
      questionCount,
      status: game.status,
      joinOpen: game.joinOpen,
      answerOpen: game.answerOpen,
    });
  } catch {
    res.status(500).json({ message: 'Sunucu hatası' });
  }
});

module.exports = router;
