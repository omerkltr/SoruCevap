const express = require('express');
const fs = require('fs');
const multer = require('multer');
const path = require('path');

const { getLocalIP } = require('../utils/network');

const router = express.Router();
const uploadsDir = path.join(__dirname, '..', 'public', 'uploads');

fs.mkdirSync(uploadsDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, callback) => callback(null, uploadsDir),
    filename: (req, file, callback) => {
      const extension = path.extname(file.originalname).toLowerCase() || '.jpg';
      const uniqueName = `${Date.now()}-${Math.random().toString(36).slice(2)}${extension}`;
      callback(null, uniqueName);
    },
  }),
  fileFilter: (req, file, callback) => {
    if (file.mimetype.startsWith('image/')) {
      callback(null, true);
      return;
    }

    callback(new Error('Sadece görsel dosyası yüklenebilir'));
  },
});

router.post('/', (req, res) => {
  upload.single('image')(req, res, (error) => {
    if (error) {
      return res.status(400).json({
        message: error.message || 'Dosya yüklenemedi',
      });
    }

    if (!req.file) {
      return res.status(400).json({ message: 'Dosya yüklenmedi' });
    }

    const protocol = req.protocol || 'http';
    const host = req.get('host') || `${getLocalIP()}:${process.env.PORT || 5000}`;

    return res.json({
      url: `${protocol}://${host}/uploads/${req.file.filename}`,
    });
  });
});

module.exports = router;
