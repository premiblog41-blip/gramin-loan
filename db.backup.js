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
`);

module.exports = db;
