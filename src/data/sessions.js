// Data access for sign-in sessions.

export const create = (db, { token, userId, hours }) =>
  db.run(
    `INSERT INTO sessions (token, user_id, expires_at)
     VALUES (?, ?, datetime('now', '+' || ? || ' hours'))`,
    token, userId, hours,
  );

export const findLive = (db, token) =>
  db.get("SELECT token, user_id FROM sessions WHERE token = ? AND expires_at > datetime('now')", token);

export const remove = (db, token) => db.run('DELETE FROM sessions WHERE token = ?', token);
