const Answer = require('../models/Answer');
const Game = require('../models/Game');
const Question = require('../models/Question');

function createRoom(hostSocketId = null) {
  return {
    hostSocketId,
    players: new Map(),
    currentQuestion: null,
    correctCounts: new Map(),
    questionScores: new Map(),
  };
}

function buildLeaderboard(participants) {
  return [...participants]
    .sort((a, b) => b.score - a.score)
    .map((participant, index) => ({
      rank: index + 1,
      username: participant.username,
      score: participant.score,
    }));
}

async function buildFinalLeaderboard(gameId) {
  const answers = await Answer.find({ gameId });
  const questions = await Question.find({ gameId }).select('_id questionType');
  const scoredQuestionIds = new Set(
    questions
      .filter((question) => (question.questionType || 'multiple_choice') !== 'open_text')
      .map((question) => question._id.toString())
  );
  const userStats = new Map();

  for (const answer of answers) {
    if (!scoredQuestionIds.has(answer.questionId.toString())) continue;

    if (!userStats.has(answer.userId)) {
      userStats.set(answer.userId, {
        username: answer.username,
        correctCount: 0,
        totalTime: 0,
      });
    }

    const stats = userStats.get(answer.userId);
    if (answer.isCorrect) stats.correctCount++;
    stats.totalTime += answer.timeTaken || 0;
  }

  return [...userStats.values()]
    .sort(
      (a, b) =>
        b.correctCount - a.correctCount || a.totalTime - b.totalTime
    )
    .map((participant, index) => ({
      rank: index + 1,
      username: participant.username,
      score: participant.correctCount,
      totalTime: participant.totalTime,
    }));
}

function registerGameSocket(io, gameRooms) {
  io.on('connection', (socket) => {
    socket.on('host:join', async ({ gameId }) => {
      socket.join(`game:${gameId}`);

      if (!gameRooms.has(gameId)) {
        gameRooms.set(gameId, createRoom(socket.id));
      } else {
        gameRooms.get(gameId).hostSocketId = socket.id;
      }

      socket.gameId = gameId;
      socket.role = 'host';

      const game = await Game.findById(gameId);
      if (game) {
        socket.emit('host:stats', {
          activeParticipants: game.participants.length,
        });
      }
    });

    socket.on('player:join', async ({ gameId, userId, username }) => {
      try {
        const game = await Game.findById(gameId);
        if (!game) {
          return socket.emit('error', { message: 'Oyun bulunamadı' });
        }
        if (game.status === 'ended') {
          return socket.emit('error', { message: 'Oyun sona erdi' });
        }

        socket.join(`game:${gameId}`);
        socket.gameId = gameId;
        socket.userId = userId;
        socket.username = username;
        socket.role = 'player';

        if (!gameRooms.has(gameId)) {
          gameRooms.set(gameId, createRoom());
        }
        gameRooms.get(gameId).players.set(userId, socket.id);

        const participantExists = game.participants.find(
          (participant) => participant.userId === userId
        );
        if (!participantExists) {
          game.participants.push({ userId, username, score: 0 });
          await game.save();
        }

        socket.emit('game:state', {
          answerOpen: game.answerOpen,
          status: game.status,
        });

        if (game.status === 'started') {
          socket.emit('game:started');
          const room = gameRooms.get(gameId);

          if (room?.currentQuestion) {
            const question = await Question.findById(room.currentQuestion.id);
            if (question) {
              const elapsed = Math.floor(
                (Date.now() - room.currentQuestion.startTime) / 1000
              );
              const remaining = question.timeLimit - elapsed;

              if (remaining > 2) {
                socket.emit('question:new', {
                  id: question._id,
                  text: question.text,
                  imageUrl: question.imageUrl || '',
                  questionType: question.questionType || 'multiple_choice',
                  options: question.options,
                  optionImages: question.optionImages || [],
                  timeLimit: remaining,
                  correctIndex: question.correctIndex,
                });
              }
            }
          }
        }

        const room = gameRooms.get(gameId);
        if (room?.hostSocketId) {
          io.to(room.hostSocketId).emit('host:stats', {
            activeParticipants: game.participants.length,
          });
        }
      } catch (error) {
        console.error('player:join error:', error);
        socket.emit('error', { message: 'Bağlantı hatası' });
      }
    });

    socket.on('host:gameStarted', ({ gameId }) => {
      io.to(`game:${gameId}`).emit('game:started');
    });

    socket.on('host:toggleAnswer', async ({ gameId, answerOpen }) => {
      const game = await Game.findById(gameId);
      if (!game) return;

      game.answerOpen = answerOpen;
      await game.save();
      io.to(`game:${gameId}`).emit('game:state', {
        answerOpen,
        status: game.status,
      });
    });

    socket.on(
      'player:answer',
      async ({
        gameId,
        questionId,
        selectedIndex,
        answerText,
        timeTaken,
        userId,
        username,
      }) => {
        try {
          const game = await Game.findById(gameId);
          if (!game || !game.answerOpen) {
            return socket.emit('error', { message: 'Cevap verme kapalı' });
          }

          const question = await Question.findById(questionId);
          if (!question) return;

          const existingAnswer = await Answer.findOne({
            gameId,
            questionId,
            userId,
          });
          if (existingAnswer) return;

          const isOpenText =
            (question.questionType || 'multiple_choice') === 'open_text';
          const cleanAnswerText = String(answerText || '').trim().slice(0, 2000);
          if (isOpenText && !cleanAnswerText) {
            return socket.emit('error', {
              message: 'Cevap metni zorunlu',
            });
          }

          const normalizedSelectedIndex = isOpenText
            ? null
            : Number(selectedIndex);
          const isCorrect =
            !isOpenText && normalizedSelectedIndex === question.correctIndex;
          const score = isCorrect ? 1 : 0;

          await Answer.create({
            gameId,
            questionId,
            userId,
            username,
            selectedIndex: normalizedSelectedIndex,
            answerText: cleanAnswerText,
            isCorrect,
            timeTaken,
            score,
          });

          const participant = game.participants.find(
            (item) => item.userId === userId
          );
          if (participant && score) {
            participant.score += score;
            await game.save();
          }

          socket.emit('answer:result', { isCorrect });
          io.to(`game:${gameId}`).emit('question:scores', { questionId });
          io.to(`game:${gameId}`).emit(
            'leaderboard:update',
            buildLeaderboard(game.participants)
          );

          const room = gameRooms.get(gameId);
          if (room?.hostSocketId) {
            io.to(room.hostSocketId).emit('host:stats', {
              activeParticipants: game.participants.length,
            });
          }
        } catch (error) {
          console.error('player:answer error:', error);
        }
      }
    );

    socket.on('host:endGame', async ({ gameId }) => {
      try {
        const game = await Game.findById(gameId);
        if (!game) return;

        game.status = 'ended';
        game.answerOpen = false;
        await game.save();

        const leaderboard = await buildFinalLeaderboard(game._id);
        io.to(`game:${gameId}`).emit('game:end', leaderboard);
        gameRooms.delete(gameId);
      } catch (error) {
        console.error('host:endGame error:', error);
      }
    });

    socket.on('disconnect', () => {
      const { gameId, userId, role } = socket;
      if (!gameId) return;

      const room = gameRooms.get(gameId);
      if (room && role === 'player' && userId) {
        room.players.delete(userId);
      }
    });
  });
}

module.exports = registerGameSocket;
