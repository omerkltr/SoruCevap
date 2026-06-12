require('dotenv').config();

const http = require('http');
const mongoose = require('mongoose');
const { Server } = require('socket.io');

const createApp = require('./app');
const registerGameSocket = require('./sockets/gameSocket');

const gameRooms = new Map();
const app = createApp({ gameRooms });
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.locals.io = io;
registerGameSocket(io, gameRooms);

const port = process.env.PORT || 5000;

mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => {
    console.log('MongoDB bağlantısı başarılı');
    server.listen(port, () => console.log(`Sunucu ${port} portunda çalışıyor`));
  })
  .catch((error) => {
    console.error('MongoDB hatası:', error.message);
    process.exit(1);
  });
