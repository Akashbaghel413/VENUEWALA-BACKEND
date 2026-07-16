const express = require('express');
const router = express.Router();
const db = require('../models/db');
const { requireAuth, requireRole } = require('../middleware/auth');

/**
 * GET /api/venues
 * Public. Supports optional query params for filtering:
 *   ?category=banquet
 *   ?city=Delhi
 *   ?q=dwarka            (matches name/area/city/pincode)
 *   ?minPrice=20000
 *   ?maxPrice=100000
 *   ?minCapacity=200
 */
router.get('/api/venues', (req, res) => {
  try {
    const { category, city, q, minPrice, maxPrice, minCapacity } = req.query;
    const venues = db.venues.listAll({
      category,
      city,
      q,
      minPrice: minPrice ? Number(minPrice) : undefined,
      maxPrice: maxPrice ? Number(maxPrice) : undefined,
      minCapacity: minCapacity ? Number(minCapacity) : undefined,
    });
    res.json({ venues });
  } catch (err) {
    console.error('Error listing venues:', err);
    res.status(500).json({ error: 'Could not load venues right now. Please try again.' });
  }
});

/**
 * GET /api/venues/:id
 * Public. Returns a single venue plus its reviews.
 */
router.get('/api/venues/:id', (req, res) => {
  try {
    const venue = db.venues.getById(req.params.id);
    if (!venue) {
      return res.status(404).json({ error: 'Venue not found' });
    }
    const reviews = db.reviews.listByVenue(req.params.id);
    res.json({ venue, reviews });
  } catch (err) {
    console.error('Error loading venue:', err);
    res.status(500).json({ error: 'Could not load this venue right now. Please try again.' });
  }
});

/**
 * GET /api/owner/venues
 * Requires login + owner role. Lists venues belonging to the logged-in owner
 * (for the Owner Dashboard's "My Venues" list).
 */
router.get('/api/owner/venues', requireAuth, requireRole('owner'), (req, res) => {
  try {
    const venues = db.venues.listByOwner(req.user.userId);
    res.json({ venues });
  } catch (err) {
    console.error('Error listing owner venues:', err);
    res.status(500).json({ error: 'Could not load your venues right now. Please try again.' });
  }
});

/**
 * POST /api/owner/venues
 * Requires login + owner role. Creates a new venue owned by the logged-in
 * user. New venues start with status 'pending' until an admin approves them
 * (see db.venues.create) - so they won't show up in public listings yet.
 */
router.post('/api/owner/venues', requireAuth, requireRole('owner'), (req, res) => {
  try {
    const { name, area, city, pincode, price, capacity, category } = req.body;
    if (!name || !price || !category) {
      return res.status(400).json({ error: 'name, price, and category are required' });
    }
    const venue = db.venues.create(req.user.userId, req.body);
    res.status(201).json({ venue });
  } catch (err) {
    console.error('Error creating venue:', err);
    res.status(500).json({ error: 'Could not create the venue right now. Please try again.' });
  }
});

/**
 * POST /api/venues/:id/reviews
 * Requires login. Any logged-in user can leave a review on a venue.
 */
router.post('/api/venues/:id/reviews', requireAuth, (req, res) => {
  try {
    const { event, rating, text } = req.body;
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'rating must be a number between 1 and 5' });
    }
    const venue = db.venues.getById(req.params.id);
    if (!venue) {
      return res.status(404).json({ error: 'Venue not found' });
    }
    const reviewer = db.users.findById(req.user.userId);
    const review = db.reviews.create({
      venueId: req.params.id,
      userId: req.user.userId,
      name: reviewer?.name || 'Venuewala User',
      image: reviewer?.profile_photo_url || null,
      event: event || 'Other',
      rating,
      text: text || '',
    });
    res.status(201).json({ review });
  } catch (err) {
    console.error('Error creating review:', err);
    res.status(500).json({ error: 'Could not submit your review right now. Please try again.' });
  }
});

module.exports = router;