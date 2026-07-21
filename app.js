const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
require('dotenv').config();
const app = express();
app.use(express.json());
app.use(cookieParser());
app.use(express.static(__dirname));

const allowedOrigins = [
  process.env.FRONTEND_URL,
  'http://localhost:5173',
].filter(Boolean);

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));

const googleAuthRoutes = require('./routes/auth.google');
app.use(googleAuthRoutes);

const venuesRoutes = require('./routes/venues');
app.use(venuesRoutes);

const bookingsRoutes = require('./routes/bookings');
app.use(bookingsRoutes);

const { requireAuth } = require('./middleware/auth');

app.get('/api/me', requireAuth, (req, res) => {
  res.json({ userId: req.user.userId, role: req.user.role });
});

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('venuewala_token', {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
  });
  res.json({ success: true });
});

app.get('/', (req, res) => {
  res.send('Venuewala backend is running.');
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Venuewala API running on port ${PORT}`));