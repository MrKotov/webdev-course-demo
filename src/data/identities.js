// Data access for provider identities. SQL lives here and nowhere else.

export const findBySubject = (db, provider, subject) =>
  db.get('SELECT id, user_id, provider, subject, email FROM identities WHERE provider = ? AND subject = ?', provider, subject);

export const listForUser = (db, userId) =>
  db.all('SELECT id, provider, subject, email FROM identities WHERE user_id = ? ORDER BY provider', userId);

export const link = (db, { userId, provider, subject, email }) =>
  db.run('INSERT INTO identities (user_id, provider, subject, email) VALUES (?, ?, ?, ?)', userId, provider, subject, email)
    .lastInsertRowid;
