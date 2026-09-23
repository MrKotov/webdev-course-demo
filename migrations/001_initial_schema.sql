-- Lab workstation booking: the whole schema.
-- Written for SQLite, kept deliberately close to plain SQL so it also reads on Postgres.

CREATE TABLE users (
  id            INTEGER PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  full_name     TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE sessions (
  token      TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id),
  expires_at TEXT NOT NULL
);

CREATE TABLE labs (
  id       INTEGER PRIMARY KEY,
  code     TEXT NOT NULL UNIQUE,
  name     TEXT NOT NULL,
  building TEXT NOT NULL
);

CREATE TABLE workstations (
  id       INTEGER PRIMARY KEY,
  lab_id   INTEGER NOT NULL REFERENCES labs(id),
  label    TEXT NOT NULL,
  seats    INTEGER NOT NULL DEFAULT 1,
  active   INTEGER NOT NULL DEFAULT 1,
  UNIQUE (lab_id, label)
);

CREATE TABLE bookings (
  id             INTEGER PRIMARY KEY,
  workstation_id INTEGER NOT NULL REFERENCES workstations(id),
  user_id        INTEGER NOT NULL REFERENCES users(id),
  booking_date   TEXT NOT NULL,     -- YYYY-MM-DD
  slot           INTEGER NOT NULL,  -- 1..6, see legacy/slots.js
  purpose        TEXT NOT NULL DEFAULT '',
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  -- the database also refuses a double booking; the service refuses it first, with a readable message
  UNIQUE (workstation_id, booking_date, slot)
);

CREATE INDEX bookings_by_user ON bookings (user_id, booking_date);

-- many-to-many: a booking may bring along other registered users
CREATE TABLE booking_attendees (
  booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id),
  PRIMARY KEY (booking_id, user_id)
);
