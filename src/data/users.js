// Data access for users. SQL lives here and nowhere else.

export const findById = (db, id) =>
  db.get('SELECT id, email, full_name, password_hash FROM users WHERE id = ?', id);

export const findByEmail = (db, email) =>
  db.get('SELECT id, email, full_name, password_hash FROM users WHERE email = ?', email);

export const findByEmails = (db, emails) => {
  if (emails.length === 0) return [];
  const holes = emails.map(() => '?').join(', ');
  return db.all(`SELECT id, email, full_name FROM users WHERE email IN (${holes})`, ...emails);
};

export const create = (db, { email, fullName, passwordHash }) =>
  db.run('INSERT INTO users (email, full_name, password_hash) VALUES (?, ?, ?)', email, fullName, passwordHash)
    .lastInsertRowid;
