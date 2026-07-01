const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
require('dotenv').config();

const app = express();

app.use(express.json());
app.use(cookieParser());
app.use(express.static(__dirname));

app.use(cors({
  origin: process.env.FRONTEND_URL,
  credentials: true,
}));

const googleAuthRoutes = require('./routes/auth.google');
app.use(googleAuthRoutes);

const jwt = require('jsonwebtoken');

function requireAuth(req, res, next) {
  const token = req.cookies.venuewala_token;
  if (!token) return res.status(401).json({ error: 'Not logged in' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Session expired, please log in again' });
  }
}

app.get('/api/me', requireAuth, (req, res) => {
  res.json({ userId: req.user.userId, role: req.user.role });
});

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('venuewala_token');
  res.json({ success: true });
});

app.get('/', (req, res) => {
  res.send('Venuewala backend is running.');
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Venuewala API running on port ${PORT}`));