const express = require('express');
const cors = require('cors');
const path = require('path');

const authRoutes = require('./routes/auth');
const gameRoutes = require('./routes/game');
const uploadRoutes = require('./routes/upload');
const { getLocalIP } = require('./utils/network');

function createApp({ gameRooms }) {
  const app = express();

  app.use(cors());
  app.use(express.json());
  app.use(express.static(path.join(__dirname, 'public')));

  app.use((req, res, next) => {
    req.io = app.locals.io;
    req.gameRooms = gameRooms;
    next();
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/games', gameRoutes);
  app.use('/api/upload', uploadRoutes);

  app.get('/api/info', (req, res) => {
    const port = process.env.PORT || 5000;
    const webHostUsernames = (
      process.env.WEB_HOST_USERNAMES ||
      process.env.WEB_HOST_USERNAME ||
      'example'
    )
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean);

    res.json({
      url: `http://${getLocalIP()}:${port}`,
      webHostUsernames,
    });
  });

  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });

  return app;
}

module.exports = createApp;
