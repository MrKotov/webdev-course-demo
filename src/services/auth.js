// Sign-in. Accounts are created by the faculty (migration 003 seeds the demo ones),
// so there is no sign-up endpoint: this service only checks a password and hands
// out a session token.

import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { config } from '../config.js';
import { unauthorized } from '../errors.js';
import * as users from '../data/users.js';
import * as sessions from '../data/sessions.js';

const KEY_LENGTH = 32;

export function hashPassword(plain) {
  const salt = randomBytes(16).toString('hex');
  return `scrypt$${salt}$${scryptSync(plain, salt, KEY_LENGTH).toString('hex')}`;
}

export function verifyPassword(plain, stored) {
  const [scheme, salt, expected] = String(stored).split('$');
  if (scheme !== 'scrypt' || !salt || !expected) return false;
  const actual = scryptSync(plain, salt, KEY_LENGTH);
  const wanted = Buffer.from(expected, 'hex');
  return actual.length === wanted.length && timingSafeEqual(actual, wanted);
}

/** Check the credentials and open a session. Throws 401 on anything wrong. */
export function signIn(db, email, password) {
  const user = users.findByEmail(db, String(email ?? '').trim().toLowerCase());
  // Same message either way, so the response does not reveal which e-mails exist.
  if (!user || !verifyPassword(String(password ?? ''), user.password_hash)) {
    throw unauthorized('Wrong e-mail or password');
  }
  const token = randomBytes(24).toString('hex');
  sessions.create(db, { token, userId: user.id, hours: config.sessionHours });
  return { token, user: publicUser(user) };
}

export function signOut(db, token) {
  if (token) sessions.remove(db, token);
}

/** The signed-in user for a session token, or null. */
export function currentUser(db, token) {
  if (!token) return null;
  const session = sessions.findLive(db, token);
  if (!session) return null;
  const user = users.findById(db, session.user_id);
  return user ? publicUser(user) : null;
}

export const publicUser = (u) => ({ id: u.id, email: u.email, fullName: u.full_name });
