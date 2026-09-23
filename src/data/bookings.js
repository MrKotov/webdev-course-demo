// Data access for bookings and for the many-to-many table that hangs off them.

const ROW = `
  SELECT b.id, b.user_id, b.workstation_id, b.booking_date, b.slot, b.purpose,
         w.label AS workstation_label, w.seats AS workstation_seats,
         l.code AS lab_code, l.name AS lab_name
  FROM bookings b
  JOIN workstations w ON w.id = b.workstation_id
  JOIN labs l ON l.id = w.lab_id`;

export const findById = (db, id) => db.get(`${ROW} WHERE b.id = ?`, id);

export const listForUser = (db, userId) =>
  db.all(
    `${ROW}
     WHERE b.user_id = ? OR b.id IN (SELECT booking_id FROM booking_attendees WHERE user_id = ?)
     ORDER BY b.booking_date, b.slot`,
    userId, userId,
  );

export const listForDate = (db, date) => db.all(`${ROW} WHERE b.booking_date = ? ORDER BY b.slot`, date);

export const findConflict = (db, { workstationId, date, slot }) =>
  db.get(
    'SELECT id, user_id FROM bookings WHERE workstation_id = ? AND booking_date = ? AND slot = ?',
    workstationId, date, slot,
  );

export const countUpcomingForUser = (db, userId) =>
  db.get(
    "SELECT COUNT(*) AS n FROM bookings WHERE user_id = ? AND booking_date >= date('now')",
    userId,
  ).n;

export const insert = (db, { userId, workstationId, date, slot, purpose }) =>
  db.run(
    'INSERT INTO bookings (user_id, workstation_id, booking_date, slot, purpose) VALUES (?, ?, ?, ?, ?)',
    userId, workstationId, date, slot, purpose,
  ).lastInsertRowid;

export const remove = (db, id) => db.run('DELETE FROM bookings WHERE id = ?', id).changes;

// --- the many-to-many side -------------------------------------------------

export const addAttendee = (db, bookingId, userId) =>
  db.run('INSERT OR IGNORE INTO booking_attendees (booking_id, user_id) VALUES (?, ?)', bookingId, userId);

export const removeAttendees = (db, bookingId) =>
  db.run('DELETE FROM booking_attendees WHERE booking_id = ?', bookingId);

export const attendeesOf = (db, bookingId) =>
  db.all(
    `SELECT u.id, u.email, u.full_name
     FROM booking_attendees a JOIN users u ON u.id = a.user_id
     WHERE a.booking_id = ? ORDER BY u.full_name`,
    bookingId,
  );
