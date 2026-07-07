const express = require('express');
const router = express.Router();
const { OAuth2Client } = require('google-auth-library');
const jwt = require('jsonwebtoken');

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const db = require('../models/db');

router.post('/api/auth/google', async (req, res) => {
  const { credential, intendedRole } = req.body;

  if (!credential) {
    return res.status(400).json({ error: 'Missing Google credential token' });
  }

  let payload;

  if (process.env.AUTH_TEST_MODE === 'true') {
    try {
      payload = JSON.parse(credential);
    } catch {
      return res.status(400).json({ error: 'Invalid test credential payload' });
    }
  } else {
    try {
      const ticket = await client.verifyIdToken({
        idToken: credential,
        audience: process.env.GOOGLE_CLIENT_ID,
      });
      payload = ticket.getPayload();
    } catch (err) {
      console.error('Google token verification failed:', err.message);
      return res.status(401).json({ error: 'Invalid or expired Google token' });
    }
  }

  const { sub: googleId, email, name, picture, email_verified } = payload;

  if (!email || (process.env.AUTH_TEST_MODE !== 'true' && !email_verified)) {
    return res.status(400).json({
      error: 'Google account email is missing or unverified. Please use a verified Google account.',
    });
  }

  try {
    let user = await db.users.findByGoogleId(googleId);

    if (!user) {
      const existingByEmail = await db.users.findByEmail(email);

      if (existingByEmail) {
        user = await db.users.linkGoogleAccount(existingByEmail.id, {
          google_id: googleId,
          profile_photo_url: picture,
        });
      } else {
        const role = intendedRole === 'owner' ? 'owner' : 'customer';

        user = await db.users.create({
          name,
          email,
          google_id: googleId,
          auth_provider: 'google',
          profile_photo_url: picture,
          role,
          password: null,
        });
      }
    }

    await db.users.touchLastLogin(user.id);

    const token = jwt.sign(
      { userId: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.cookie('venuewala_token', token, {
  httpOnly: true,
  secure: true,
  sameSite: 'none',
  maxAge: 7 * 24 * 60 * 60 * 1000,
});

    return res.status(200).json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        photo: user.profile_photo_url,
        role: user.role,
      },
    });
  } catch (err) {
    console.error('Google auth error:', err);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

module.exports = router;