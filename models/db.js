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

const users = {
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

module.exports = { users };