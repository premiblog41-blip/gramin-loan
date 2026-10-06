const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const db = new DatabaseSync(path.join(__dirname, 'gramin.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS applications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    app_code TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    mobile TEXT NOT NULL,
    nid TEXT NOT NULL,
    dob TEXT NOT NULL,
    address TEXT NOT NULL,
    amount INTEGER NOT NULL,
    frequency TEXT NOT NULL,
    nominee_name TEXT NOT NULL,
    nominee_mobile TEXT NOT NULL,
    nominee_relation TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Pending',
    reject_reason TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    application_id INTEGER NOT NULL,
    doc_type TEXT NOT NULL,
    stored_name TEXT NOT NULL,
    mime TEXT NOT NULL,
    size INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'Received',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (application_id, doc_type),
    FOREIGN KEY (application_id) REFERENCES applications(id)
  );
`);

try {
  db.exec("ALTER TABLE applications ADD COLUMN balance INTEGER NOT NULL DEFAULT 0");
} catch (e) {}

db.exec(`
  CREATE TABLE IF NOT EXISTS deposits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    application_id INTEGER NOT NULL,
    amount INTEGER NOT NULL,
    trx_id TEXT,
    screenshot_name TEXT,
    status TEXT NOT NULL DEFAULT 'Pending',
    admin_note TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (application_id) REFERENCES applications(id)
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    application_id INTEGER NOT NULL,
    sender TEXT NOT NULL,
    text TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (application_id) REFERENCES applications(id)
  );
`);

module.exports = db;
