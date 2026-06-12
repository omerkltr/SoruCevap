const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const router = express.Router();

const signToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_REMEMBER_EXPIRES_IN || '30d' });

function isProtectedAdminName(name) {
  return String(name || '').trim().toLowerCase() === 'example';
}

function hasAdminPassword(password) {
  const adminPassword = process.env.ADMIN_PASSWORD;
  return Boolean(adminPassword) && String(password || '') === adminPassword;
}

// POST /api/auth/login  (username-only: create if new, error if taken by another session)
router.post('/login', async (req, res) => {
  try {
    const { name, password } = req.body;
    if (!name || name.trim().length < 2) {
      return res.status(400).json({ message: 'Kullanıcı adı en az 2 karakter olmalıdır' });
    }

    if (isProtectedAdminName(name) && !hasAdminPassword(password)) {
      return res.status(401).json({ message: 'Yonetici sifresi hatali' });
    }

    let user = await User.findOne({ name: name.trim() });
    if (!user) {
      user = await User.create({ name: name.trim() });
    }

    const token = signToken(user._id);
    res.status(200).json({
      message: 'Giriş başarılı',
      token,
      user: { id: user._id, name: user.name, email: '' },
    });
  } catch (err) {
    if (err.name === 'ValidationError') {
      const messages = Object.values(err.errors).map((e) => e.message);
      return res.status(400).json({ message: messages[0] });
    }
    res.status(500).json({ message: 'Sunucu hatası' });
  }
});

// POST /api/auth/register — alias for login (username-only flow)
router.post('/register', async (req, res) => {
  try {
    const { name, password } = req.body;
    if (!name || name.trim().length < 2) {
      return res.status(400).json({ message: 'Kullanıcı adı en az 2 karakter olmalıdır' });
    }

    if (isProtectedAdminName(name) && !hasAdminPassword(password)) {
      return res.status(401).json({ message: 'Yonetici sifresi hatali' });
    }

    const existing = await User.findOne({ name: name.trim() });
    if (existing) {
      return res.status(409).json({ message: 'Bu kullanıcı adı zaten alınmış' });
    }

    const user = await User.create({ name: name.trim() });
    const token = signToken(user._id);
    res.status(201).json({
      message: 'Kayıt başarılı',
      token,
      user: { id: user._id, name: user.name, email: '' },
    });
  } catch (err) {
    if (err.name === 'ValidationError') {
      const messages = Object.values(err.errors).map((e) => e.message);
      return res.status(400).json({ message: messages[0] });
    }
    res.status(500).json({ message: 'Sunucu hatası' });
  }
});

// GET /api/auth/me
router.get('/me', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Token bulunamadı' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);

    if (!user) {
      return res.status(401).json({ message: 'Kullanıcı bulunamadı' });
    }

    res.status(200).json({
      user: { id: user._id, name: user.name, email: '' },
    });
  } catch (err) {
    res.status(401).json({ message: 'Geçersiz token' });
  }
});

module.exports = router;
