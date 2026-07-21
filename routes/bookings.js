const express = require('express');
const router = express.Router();
const db = require('../models/db');
const { requireAuth, requireRole } = require('../middleware/auth');

/**
 * POST /api/bookings
 * Requires login. Creates a real booking record. Payment itself is still
 * simulated on the frontend (no real payment gateway yet) - this endpoint
 * just persists the booking once the frontend's simulated payment succeeds.
 */
router.post('/api/bookings', requireAuth, (req, res) => {
  try {
    const {
      venueId, eventDate, slot, guests, eventType, foodPref, specialRequests,
      contactName, contactPhone, contactEmail,
      basePrice, cateringCost, platformFee, gstOnPlatform, total, advancePaid, balanceDue,
      paymentMethod,
    } = req.body;

    if (!venueId || !eventDate || !slot || !guests || !contactName || !contactPhone || !contactEmail) {
      return res.status(400).json({ error: 'Missing required booking fields' });
    }
    if (typeof total !== 'number' || typeof advancePaid !== 'number') {
      return res.status(400).json({ error: 'Missing or invalid pricing fields' });
    }

    const booking = db.bookings.create(req.user.userId, {
      venueId, eventDate, slot, guests, eventType, foodPref, specialRequests,
      contactName, contactPhone, contactEmail,
      basePrice, cateringCost, platformFee, gstOnPlatform, total, advancePaid, balanceDue,
      paymentMethod,
    });

    res.status(201).json({ booking });
  } catch (err) {
    console.error('Error creating booking:', err);
    res.status(500).json({ error: 'Could not create the booking right now. Please try again.' });
  }
});

/**
 * GET /api/bookings/mine
 * Requires login. Returns the logged-in user's own bookings.
 */
router.get('/api/bookings/mine', requireAuth, (req, res) => {
  try {
    const bookings = db.bookings.listByUser(req.user.userId);
    res.json({ bookings });
  } catch (err) {
    console.error('Error listing bookings:', err);
    res.status(500).json({ error: 'Could not load your bookings right now. Please try again.' });
  }
});

/**
 * GET /api/owner/bookings
 * Requires login + owner role. Returns bookings across all of the owner's venues.
 */
router.get('/api/owner/bookings', requireAuth, requireRole('owner'), (req, res) => {
  try {
    const bookings = db.bookings.listByOwner(req.user.userId);
    res.json({ bookings });
  } catch (err) {
    console.error('Error listing owner bookings:', err);
    res.status(500).json({ error: 'Could not load bookings right now. Please try again.' });
  }
});

/**
 * PATCH /api/bookings/:id/cancel
 * Requires login. A user can only cancel their own booking.
 */
router.patch('/api/bookings/:id/cancel', requireAuth, (req, res) => {
  try {
    const bookingId = req.params.id.replace(/^VW-/, '');
    const booking = db.bookings.cancel(bookingId, req.user.userId);
    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }
    res.json({ booking });
  } catch (err) {
    console.error('Error cancelling booking:', err);
    res.status(500).json({ error: 'Could not cancel the booking right now. Please try again.' });
  }
});

module.exports = router;