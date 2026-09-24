// Sign in with a provider, next to the password sign-in in auth.js.
//
// This is the OAuth 2.0 *authorization code* flow, the one a server uses. Read it as
// four steps:
//
//   1. begin()     we send the browser to Google with a state and a code challenge
//   2. Google      asks the person to sign in and to allow our app
//   3. Google      sends the browser back to us with a short-lived `code`
//   4. complete()  we swap that code for an id_token, server to server
//
// Two things in here exist only to stop an attack, and they are worth knowing by name:
//
//   `state` is a random value we put in a cookie and also send to Google. Google hands
//   it back. If what comes back does not match the cookie, the request did not start in
//   this browser, and we refuse it. Without it, somebody could send your browser a
//   callback URL carrying *their* code and quietly sign you into their account (CSRF).
//
//   `code_verifier`/`code_challenge` (PKCE) binds the code to whoever began the flow.
//   We send Google the SHA-256 of a random secret, and later prove we know the secret.
//   A code stolen in transit is then useless to the thief.
//
// The client *secret* never leaves this server. That is the whole reason this flow runs
// here and not in the browser: anything the browser holds, the user can read, and a
// secret that everyone can read is not a secret. A browser-only app has to use PKCE
// without a secret for exactly that reason.
//
// The one network call lives in src/providers/google.js and is passed in, so everything
// below can be tested without the internet — and so adding a second provider is a new
// file there rather than a change here.

import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { config } from '../config.js';
import { badRequest, unauthorized } from '../errors.js';
import * as identities from '../data/identities.js';
import * as sessions from '../data/sessions.js';
import * as users from '../data/users.js';
import { publicUser } from './auth.js';
import { AUTH_URL, exchange as exchangeWithGoogle } from '../providers/google.js';

const PROVIDER = 'google';

const base64url = (buffer) => buffer.toString('base64url');

export const isConfigured = () => Boolean(config.google.clientId && config.google.clientSecret);

/** Step 1: where to send the browser, plus the two secrets we must remember. */
export function begin() {
  if (!isConfigured()) throw badRequest('Signing in with Google is not configured on this server');

  const state = base64url(randomBytes(16));
  const verifier = base64url(randomBytes(32));
  const challenge = base64url(createHash('sha256').update(verifier).digest());

  const url = new URL(AUTH_URL);
  url.search = new URLSearchParams({
    client_id: config.google.clientId,
    redirect_uri: config.google.redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    // Ask every time rather than reusing a silent session, so a demo in front of a
    // room does not depend on who was signed in on that laptop last week.
    prompt: 'select_account',
  }).toString();

  return { url: url.toString(), state, verifier };
}

/**
 * Step 4: swap the code for a token. `exchange` is injected so the tests can run the
 * whole flow without the network; production passes the real one below.
 */
export async function complete(db, { code, state, expectedState, verifier }, exchange = exchangeWithGoogle) {
  if (!state || state !== expectedState) throw unauthorized('That sign-in did not start here');
  if (!code) throw badRequest('Google sent no code');

  const claims = await exchange({ code, verifier });

  // Google says who they are and whether it checked the address. An unverified address
  // is not proof of anything: anyone can type somebody else's e-mail into a profile,
  // and linking on it would hand over that person's account.
  if (!claims?.sub) throw unauthorized('Google returned no account id');
  if (claims.email && claims.email_verified !== true) {
    throw unauthorized('Google has not verified that e-mail address');
  }

  const user = findOrCreate(db, claims);
  const token = randomBytes(24).toString('hex');
  sessions.create(db, { token, userId: user.id, hours: config.sessionHours });
  return { token, user: publicUser(user) };
}

/** One person, one row in users: link an existing account rather than making a second. */
function findOrCreate(db, claims) {
  const known = identities.findBySubject(db, PROVIDER, claims.sub);
  if (known) return users.findById(db, known.user_id);

  const email = String(claims.email ?? '').trim().toLowerCase();
  const existing = email ? users.findByEmail(db, email) : null;

  return db.tx(() => {
    const userId = existing
      ? existing.id
      : users.create(db, {
          email: email || `${claims.sub}@${PROVIDER}.local`,
          fullName: claims.name ?? email ?? 'Google user',
          // No password: see migration 004 for why this value can never match a hash.
          passwordHash: `no-password-${randomUUID()}`,
        });
    identities.link(db, { userId, provider: PROVIDER, subject: claims.sub, email: email || null });
    return users.findById(db, userId);
  });
}
