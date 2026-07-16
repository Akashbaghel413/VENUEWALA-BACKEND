const Database = require('better-sqlite3');
const path = require('path');
const db = new Database(path.join(__dirname, '../venuewala.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    phone TEXT,
    password TEXT,
    role TEXT NOT NULL DEFAULT 'customer',
    google_id TEXT UNIQUE,
    auth_provider TEXT NOT NULL DEFAULT 'email',
    profile_photo_url TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    last_login TEXT
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS venues (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_id INTEGER REFERENCES users(id),
    name TEXT NOT NULL,
    area TEXT,
    city TEXT,
    pincode TEXT,
    price INTEGER NOT NULL,
    capacity INTEGER,
    category TEXT NOT NULL,
    images TEXT NOT NULL DEFAULT '[]',
    verified INTEGER NOT NULL DEFAULT 0,
    amenities TEXT NOT NULL DEFAULT '[]',
    food_available INTEGER NOT NULL DEFAULT 0,
    highlights TEXT NOT NULL DEFAULT '[]',
    description TEXT,
    address TEXT,
    landmarks TEXT NOT NULL DEFAULT '[]',
    pricing TEXT NOT NULL DEFAULT '{}',
    rating REAL NOT NULL DEFAULT 0,
    star_breakdown TEXT NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    venue_id INTEGER NOT NULL REFERENCES venues(id),
    user_id INTEGER REFERENCES users(id),
    name TEXT NOT NULL,
    image TEXT,
    event TEXT,
    rating INTEGER NOT NULL,
    text TEXT,
    verified INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
`);

const users = {
  findById(userId) {
    return db.prepare('SELECT * FROM users WHERE id = ?').get(userId) || null;
  },
  findByGoogleId(googleId) {
    return db.prepare('SELECT * FROM users WHERE google_id = ?').get(googleId) || null;
  },
  findByEmail(email) {
    return db.prepare('SELECT * FROM users WHERE email = ?').get(email) || null;
  },
  linkGoogleAccount(userId, { google_id, profile_photo_url }) {
    db.prepare(
      `UPDATE users SET google_id = ?, profile_photo_url = ?, auth_provider = 'google' WHERE id = ?`
    ).run(google_id, profile_photo_url, userId);
    return db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  },
  create({ name, email, google_id, auth_provider, profile_photo_url, role, password }) {
    const result = db
      .prepare(
        `INSERT INTO users (name, email, google_id, auth_provider, profile_photo_url, role, password)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(name, email, google_id, auth_provider, profile_photo_url, role, password);
    return db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
  },
  touchLastLogin(userId) {
    db.prepare("UPDATE users SET last_login = datetime('now') WHERE id = ?").run(userId);
  },
  _all() {
    return db.prepare('SELECT id, name, email, role, auth_provider, google_id FROM users').all();
  },
};

// Converts a raw venues row (with JSON-as-TEXT columns) into the shape the
// frontend's Venue interface (src/data/venues.ts) expects.
function mapVenueRow(row) {
  if (!row) return null;
  const reviewCount = db
    .prepare('SELECT COUNT(*) as count FROM reviews WHERE venue_id = ?')
    .get(row.id).count;

  return {
    id: String(row.id),
    name: row.name,
    area: row.area,
    city: row.city,
    pincode: row.pincode,
    price: row.price,
    capacity: row.capacity,
    rating: row.rating,
    reviews: reviewCount,
    category: row.category,
    images: JSON.parse(row.images),
    verified: !!row.verified,
    amenities: JSON.parse(row.amenities),
    foodAvailable: !!row.food_available,
    highlights: JSON.parse(row.highlights),
    description: row.description,
    address: row.address,
    landmarks: JSON.parse(row.landmarks),
    pricing: JSON.parse(row.pricing),
    starBreakdown: JSON.parse(row.star_breakdown),
  };
}

const venues = {
  listAll({ category, city, q, minPrice, maxPrice, minCapacity } = {}) {
    let sql = `SELECT * FROM venues WHERE status = 'active'`;
    const params = [];

    if (category) {
      sql += ' AND category = ?';
      params.push(category);
    }
    if (city) {
      sql += ' AND city LIKE ?';
      params.push(`%${city}%`);
    }
    if (q) {
      sql += ' AND (name LIKE ? OR area LIKE ? OR city LIKE ? OR pincode LIKE ?)';
      params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
    }
    if (minPrice) {
      sql += ' AND price >= ?';
      params.push(minPrice);
    }
    if (maxPrice) {
      sql += ' AND price <= ?';
      params.push(maxPrice);
    }
    if (minCapacity) {
      sql += ' AND capacity >= ?';
      params.push(minCapacity);
    }

    sql += ' ORDER BY created_at DESC';

    const rows = db.prepare(sql).all(...params);
    return rows.map(mapVenueRow);
  },

  getById(id) {
    const row = db.prepare('SELECT * FROM venues WHERE id = ?').get(id);
    return mapVenueRow(row);
  },

  listByOwner(ownerId) {
    const rows = db.prepare('SELECT * FROM venues WHERE owner_id = ?').all(ownerId);
    return rows.map(mapVenueRow);
  },

  create(ownerId, data) {
    const result = db
      .prepare(
        `INSERT INTO venues
          (owner_id, name, area, city, pincode, price, capacity, category, images,
           verified, amenities, food_available, highlights, description, address,
           landmarks, pricing, rating, star_breakdown, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        ownerId,
        data.name,
        data.area,
        data.city,
        data.pincode,
        data.price,
        data.capacity,
        data.category,
        JSON.stringify(data.images || []),
        data.verified ? 1 : 0,
        JSON.stringify(data.amenities || []),
        data.foodAvailable ? 1 : 0,
        JSON.stringify(data.highlights || []),
        data.description || '',
        data.address || '',
        JSON.stringify(data.landmarks || []),
        JSON.stringify(data.pricing || {}),
        0,
        JSON.stringify({ 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 }),
        'pending'
      );
    return venues.getById(result.lastInsertRowid);
  },

  _count() {
    return db.prepare('SELECT COUNT(*) as count FROM venues').get().count;
  },
};

const reviews = {
  listByVenue(venueId) {
    return db
      .prepare('SELECT * FROM reviews WHERE venue_id = ? ORDER BY created_at DESC')
      .all(venueId)
      .map((r) => ({
        id: String(r.id),
        venueId: String(r.venue_id),
        name: r.name,
        image: r.image,
        event: r.event,
        rating: r.rating,
        text: r.text,
        verified: !!r.verified,
      }));
  },

  create({ venueId, userId, name, image, event, rating, text }) {
    const result = db
      .prepare(
        `INSERT INTO reviews (venue_id, user_id, name, image, event, rating, text, verified)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1)`
      )
      .run(venueId, userId, name, image, event, rating, text);

    const all = db.prepare('SELECT rating FROM reviews WHERE venue_id = ?').all(venueId);
    const avg = all.reduce((sum, r) => sum + r.rating, 0) / all.length;
    const breakdown = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    all.forEach((r) => {
      const bucket = Math.round(r.rating);
      if (breakdown[bucket] !== undefined) breakdown[bucket]++;
    });
    db.prepare('UPDATE venues SET rating = ?, star_breakdown = ? WHERE id = ?').run(
      Math.round(avg * 10) / 10,
      JSON.stringify(breakdown),
      venueId
    );

    return db.prepare('SELECT * FROM reviews WHERE id = ?').get(result.lastInsertRowid);
  },
};

function seedIfEmpty() {
  if (venues._count() > 0) return;

  const venueImages = {
    farmhouse: [
      'https://images.unsplash.com/photo-1464146072230-91cabc968266?w=800',
      'https://images.unsplash.com/photo-1564013799919-ab3000a5bf6d?w=800',
      'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800',
    ],
    banquet: [
      'https://images.unsplash.com/photo-1519167758481-83f550bb49b3?w=800',
      'https://images.unsplash.com/photo-1478146896981-bdfeafd44e54?w=800',
      'https://images.unsplash.com/photo-1510078815803-ffc9fcb3d7ab?w=800',
    ],
    community: [
      'https://images.unsplash.com/photo-1497366216548-37526070297c?w=800',
      'https://images.unsplash.com/photo-1497366842680-aa2277e0c9de?w=800',
    ],
    mandir: [
      'https://images.unsplash.com/photo-1545126276-1b02ea7c0e0f?w=800',
      'https://images.unsplash.com/photo-1582510003544-d47d1e077c7e?w=800',
    ],
  };

  const seedVenues = [
    {
      name: 'Shree Ram Banquet Hall', area: 'Dwarka', city: 'New Delhi', pincode: '110075',
      price: 85000, capacity: 500, category: 'banquet', images: venueImages.banquet, verified: true,
      amenities: ['Parking', 'AC', 'Catering', 'Decoration', 'Generator', 'WiFi'], foodAvailable: true,
      highlights: ['Grand ballroom', 'LED lighting', 'Bridal suite', 'Valet parking'],
      description: 'Shree Ram Banquet Hall is a premium banquet venue in Dwarka with a grand ballroom, modern amenities, and excellent catering services.',
      address: 'Plot 45, Sector 22, Dwarka, New Delhi - 110075',
      landmarks: ['Near Dwarka Sector 21 Metro', 'Opposite Radisson Blu', '2 km from IGI Airport Terminal 3'],
      pricing: { morning: { venueOnly: 60000, withCatering: 100000 }, evening: { venueOnly: 75000, withCatering: 115000 }, fullDay: { venueOnly: 85000, withCatering: 145000 } },
      rating: 4.8, starBreakdown: { 5: 89, 4: 24, 3: 7, 2: 3, 1: 1 },
    },
    {
      name: 'Green Valley Farmhouse', area: 'Chattarpur', city: 'New Delhi', pincode: '110074',
      price: 125000, capacity: 800, category: 'farmhouse', images: venueImages.farmhouse, verified: true,
      amenities: ['Parking', 'AC', 'Catering', 'Decoration', 'Sound System', 'WiFi', 'CCTV'], foodAvailable: true,
      highlights: ['3-acre lawn', 'Poolside venue', 'Bridal villa', 'Celebrity-favorite'],
      description: 'Green Valley Farmhouse is a luxury farmhouse venue spread across 3 acres in Chattarpur with lush lawns, a poolside area, and premium amenities.',
      address: 'Asola Road, Chattarpur, New Delhi - 110074',
      landmarks: ['Near Chattarpur Metro', 'Adjacent to Asola Wildlife Sanctuary', '3 km from Qutub Minar'],
      pricing: { morning: { venueOnly: 95000, withCatering: 150000 }, evening: { venueOnly: 115000, withCatering: 175000 }, fullDay: { venueOnly: 125000, withCatering: 200000 } },
      rating: 4.6, starBreakdown: { 5: 52, 4: 25, 3: 8, 2: 3, 1: 1 },
    },
    {
      name: 'Ambedkar Community Centre', area: 'Rohini', city: 'Delhi', pincode: '110085',
      price: 45000, capacity: 300, category: 'community-centre', images: venueImages.community, verified: true,
      amenities: ['Parking', 'AC', 'Catering', 'Generator'], foodAvailable: true,
      highlights: ['Affordable pricing', 'AC hall', 'Stage setup', 'Power backup'],
      description: 'Ambedkar Community Centre is a well-maintained, budget-friendly venue in Rohini. The air-conditioned hall is ideal for birthdays, pujas, and community gatherings.',
      address: 'Block A, Sector 14, Rohini, Delhi - 110085',
      landmarks: ['Near Rohini West Metro', 'Adjacent to Japanese Park', '5 min from Rohini Court'],
      pricing: { morning: { venueOnly: 30000, withCatering: 52000 }, evening: { venueOnly: 40000, withCatering: 62000 }, fullDay: { venueOnly: 45000, withCatering: 72000 } },
      rating: 4.5, starBreakdown: { 5: 38, 4: 20, 3: 6, 2: 2, 1: 1 },
    },
    {
      name: 'Lotus Garden Banquet', area: 'Noida', city: 'Sector 18', pincode: '201301',
      price: 35000, capacity: 250, category: 'banquet', images: venueImages.banquet, verified: true,
      amenities: ['Parking', 'AC', 'Generator', 'CCTV'], foodAvailable: true,
      highlights: ['Garden lawn', 'AC banquet', 'Stage decor', 'Budget-friendly'],
      description: 'Lotus Garden Banquet offers a beautiful garden lawn combined with an AC banquet hall. Perfect for intimate weddings and milestone celebrations.',
      address: '12, Sector 18, Noida - 201301',
      landmarks: ['Near Sector 18 Metro Station', 'Behind Atta Market', 'Next to Noida Authority Office'],
      pricing: { morning: { venueOnly: 22000, withCatering: 38000 }, evening: { venueOnly: 30000, withCatering: 48000 }, fullDay: { venueOnly: 35000, withCatering: 55000 } },
      rating: 4.3, starBreakdown: { 5: 22, 4: 15, 3: 5, 2: 2, 1: 1 },
    },
    {
      name: 'Royal Celebration Hall', area: 'Gurugram', city: 'Sector 42', pincode: '122001',
      price: 150000, capacity: 1000, category: 'farmhouse', images: venueImages.farmhouse, verified: true,
      amenities: ['Parking', 'AC', 'Catering', 'Decoration', 'Generator', 'Sound System', 'WiFi', 'CCTV'], foodAvailable: true,
      highlights: ['5-acre luxury venue', 'Poolside setup', 'Bridal suite', 'Event planner included'],
      description: 'Royal Celebration Hall is a luxury farmhouse resort in Gurugram offering a poolside venue, manicured gardens, and a grand indoor hall. Perfect for lavish weddings.',
      address: 'Golf Course Road, Sector 42, Gurugram - 122001',
      landmarks: ['Near HUDA City Centre Metro', 'Adjacent to Golf Course', '3 km from Sahara Mall'],
      pricing: { morning: { venueOnly: 110000, withCatering: 180000 }, evening: { venueOnly: 135000, withCatering: 210000 }, fullDay: { venueOnly: 150000, withCatering: 250000 } },
      rating: 4.9, starBreakdown: { 5: 118, 4: 28, 3: 7, 2: 2, 1: 1 },
    },
    {
      name: 'Krishna Bhavan', area: 'Laxmi Nagar', city: 'East Delhi', pincode: '110092',
      price: 25000, capacity: 200, category: 'bhavan', images: venueImages.mandir, verified: true,
      amenities: ['Parking', 'Generator'], foodAvailable: false,
      highlights: ['Pure veg kitchen', 'Temple premises', 'AC hall', 'Budget-friendly'],
      description: 'Krishna Bhavan is a serene community hall in Laxmi Nagar, ideal for pujas, havans, and religious ceremonies. Features a dedicated temple area.',
      address: '9A, Laxmi Nagar, East Delhi - 110092',
      landmarks: ['Near Laxmi Nagar Metro', 'Opposite V3S Mall', '100m from Main Road'],
      pricing: { morning: { venueOnly: 18000, withCatering: 32000 }, evening: { venueOnly: 22000, withCatering: 38000 }, fullDay: { venueOnly: 25000, withCatering: 45000 } },
      rating: 4.1, starBreakdown: { 5: 14, 4: 12, 3: 5, 2: 2, 1: 1 },
    },
    {
      name: 'Sai Mandir Dharamshala', area: 'Janakpuri', city: 'West Delhi', pincode: '110058',
      price: 30000, capacity: 200, category: 'mandir', images: venueImages.mandir, verified: true,
      amenities: ['Parking', 'AC', 'Catering', 'CCTV'], foodAvailable: true,
      highlights: ['Sacred premises', 'Pure veg meals', 'Havankund on-site', 'Peaceful ambience'],
      description: 'Sai Mandir Dharamshala is located within the serene premises of a mandir in Janakpuri. Ideal for pujas, havans, upanayana ceremonies.',
      address: 'C-2 Block, Janakpuri, West Delhi - 110058',
      landmarks: ['Near Janakpuri West Metro', 'Opposite DTC Bus Depot', '500m from District Centre'],
      pricing: { morning: { venueOnly: 18000, withCatering: 34000 }, evening: { venueOnly: 25000, withCatering: 42000 }, fullDay: { venueOnly: 30000, withCatering: 50000 } },
      rating: 4.4, starBreakdown: { 5: 28, 4: 16, 3: 5, 2: 2, 1: 1 },
    },
    {
      name: 'Paradise Farmhouse', area: 'Mehrauli', city: 'South Delhi', pincode: '110030',
      price: 180000, capacity: 700, category: 'farmhouse', images: venueImages.farmhouse, verified: true,
      amenities: ['Parking', 'AC', 'Catering', 'Decoration', 'Generator', 'Sound System', 'WiFi', 'CCTV'], foodAvailable: true,
      highlights: ['7-acre luxury property', 'Swimming pool', 'Bridal suite', 'Celebrity venue'],
      description: 'Paradise Farmhouse is a celebrity-favorite luxury venue spread across 7 acres in Mehrauli. Features a swimming pool, sprawling lawns, and an opulent indoor hall.',
      address: 'Mehrauli-Gurgaon Road, South Delhi - 110030',
      landmarks: ['Near Qutub Minar', 'Adjacent to Mehrauli Archaeological Park', '5 km from Saket'],
      pricing: { morning: { venueOnly: 130000, withCatering: 210000 }, evening: { venueOnly: 160000, withCatering: 250000 }, fullDay: { venueOnly: 180000, withCatering: 290000 } },
      rating: 4.8, starBreakdown: { 5: 82, 4: 22, 3: 5, 2: 2, 1: 1 },
    },
  ];

  const insertVenue = db.prepare(
    `INSERT INTO venues
      (name, area, city, pincode, price, capacity, category, images, verified,
       amenities, food_available, highlights, description, address, landmarks,
       pricing, rating, star_breakdown, status)
     VALUES (@name, @area, @city, @pincode, @price, @capacity, @category, @images, @verified,
       @amenities, @food_available, @highlights, @description, @address, @landmarks,
       @pricing, @rating, @star_breakdown, 'active')`
  );

  const insertMany = db.transaction((rows) => {
    for (const v of rows) {
      insertVenue.run({
        name: v.name,
        area: v.area,
        city: v.city,
        pincode: v.pincode,
        price: v.price,
        capacity: v.capacity,
        category: v.category,
        images: JSON.stringify(v.images),
        verified: v.verified ? 1 : 0,
        amenities: JSON.stringify(v.amenities),
        food_available: v.foodAvailable ? 1 : 0,
        highlights: JSON.stringify(v.highlights),
        description: v.description,
        address: v.address,
        landmarks: JSON.stringify(v.landmarks),
        pricing: JSON.stringify(v.pricing),
        rating: v.rating,
        star_breakdown: JSON.stringify(v.starBreakdown),
      });
    }
  });

  insertMany(seedVenues);

  const profileImages = [
    'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100',
    'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100',
    'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100',
    'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100',
  ];
  const seedReviews = [
    { venueId: 1, name: 'Rahul Sharma', image: profileImages[0], event: 'Wedding', rating: 5, text: 'Our wedding at Shree Ram Banquet was magical! The hall was beautifully decorated and the catering was excellent. Highly recommend for weddings.' },
    { venueId: 1, name: 'Priya Singh', image: profileImages[1], event: 'Corporate', rating: 5, text: 'Hosted our annual company event here. The WiFi was reliable, the catering was excellent, and the staff was very helpful throughout.' },
    { venueId: 1, name: 'Amit Gupta', image: profileImages[2], event: 'Birthday', rating: 4, text: "Great venue for my son's birthday party. Only suggestion — the parking could be better organized during peak hours." },
    { venueId: 2, name: 'Sunita Verma', image: profileImages[1], event: 'Anniversary', rating: 5, text: 'Celebrated our 25th anniversary at Green Valley Farmhouse. The lawn was stunning and the poolside setup was perfect!' },
    { venueId: 2, name: 'Vikram Malhotra', image: profileImages[0], event: 'Puja', rating: 4, text: 'Arranged a griha pravesh puja. The open space was perfect for the havan setup. Catering was delicious and on time.' },
    { venueId: 3, name: 'Neha Kapoor', image: profileImages[1], event: 'Corporate', rating: 4, text: 'Professional setup for our team event. The AC hall was comfortable and the stage setup was impressive.' },
    { venueId: 5, name: 'Deepak Chopra', image: profileImages[2], event: 'Wedding', rating: 5, text: 'Royal Celebration Hall exceeded all expectations. The poolside venue, bridal suite, and the event planner made our wedding unforgettable.' },
    { venueId: 5, name: 'Kavita Agarwal', image: profileImages[1], event: 'Birthday', rating: 5, text: 'Hosted a milestone birthday here. The resort feel is incredible — guests felt like they were on vacation. Worth every rupee!' },
    { venueId: 8, name: 'Anita Reddy', image: profileImages[1], event: 'Wedding', rating: 5, text: 'Paradise Farmhouse is truly a celebrity-level venue. The 7-acre property, the swimming pool — everything was top-notch!' },
    { venueId: 7, name: 'Suresh Mehta', image: profileImages[0], event: 'Wedding', rating: 5, text: 'Sai Mandir Dharamshala was perfect for our religious ceremony. The temple premises and pure veg catering were excellent!' },
  ];

  const insertReview = db.prepare(
    `INSERT INTO reviews (venue_id, name, image, event, rating, text, verified)
     VALUES (@venueId, @name, @image, @event, @rating, @text, 1)`
  );
  const insertReviewsMany = db.transaction((rows) => {
    for (const r of rows) insertReview.run(r);
  });
  insertReviewsMany(seedReviews);
}

seedIfEmpty();

module.exports = { users, venues, reviews };