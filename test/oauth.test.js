// Signing in with a provider, tested without the provider.
//
// `complete` takes the token exchange as an argument, so every test here runs the real
// state check, the real verified-e-mail rule and the real account linking, and only the
// one HTTPS call to Google is replaced. That call is the part we cannot test anyway.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { connectForTests } from '../src/db.js';
import * as auth from '../src/services/auth.js';
import { createHash } from 'node:crypto';
import { config } from '../src/config.js';
import { begin, complete } from '../src/services/oauth.js';
import { AUTH_URL, decodeClaims } from '../src/providers/google.js';

const claims = (over = {}) => ({ sub: 'google-111', email: 'ivan@tu-sofia.bg', email_verified: true, name: 'Ivan Petrov', ...over });
const exchange = (over = {}) => async () => claims(over);

const flow = (over = {}) => ({ code: 'the-code', state: 'abc', expectedState: 'abc', verifier: 'v' });

test('AC-12 a state that does not match the cookie is refused', async () => {
  const db = connectForTests();
  // This is the CSRF guard. Without it, somebody can hand your browser a callback URL
  // carrying their code and sign you into their account without you noticing.
  await assert.rejects(
    () => complete(db, { ...flow(), state: 'from-somewhere-else' }, exchange()),
    (err) => err.status === 401 && /did not start here/.test(err.message),
  );
  await assert.rejects(() => complete(db, { ...flow(), expectedState: null }, exchange()), (err) => err.status === 401);
});

test('a callback with no code is refused', async () => {
  const db = connectForTests();
  await assert.rejects(() => complete(db, { ...flow(), code: null }, exchange()), (err) => err.status === 400);
});

test('AC-13 an unverified e-mail address is not proof of anything', async () => {
  const db = connectForTests();
  // Anyone can type somebody else's address into a profile. Linking on it would hand
  // over that person's account to whoever typed it.
  await assert.rejects(
    () => complete(db, flow(), exchange({ email_verified: false })),
    (err) => err.status === 401 && /has not verified/.test(err.message),
  );
  assert.equal(db.get('SELECT count(*) AS n FROM identities').n, 0);
});

test('a reply with no account id is refused', async () => {
  const db = connectForTests();
  await assert.rejects(() => complete(db, flow(), exchange({ sub: undefined })), (err) => err.status === 401);
});

test('AC-14 a verified address links to the account that already has it', async () => {
  const db = connectForTests();
  const before = db.get('SELECT count(*) AS n FROM users').n;

  const { token, user } = await complete(db, flow(), exchange());

  assert.equal(user.id, 1, 'ivan@tu-sofia.bg is seeded as user 1: one person, one account');
  assert.equal(db.get('SELECT count(*) AS n FROM users').n, before, 'no second account was created');
  assert.equal(db.get('SELECT user_id FROM identities WHERE provider = ?', 'google').user_id, 1);
  assert.equal(auth.currentUser(db, token).id, 1, 'the session is the same kind the password path issues');
});

test('AC-16 an address nobody has yet creates one account, with no usable password', async () => {
  const db = connectForTests();
  const { user } = await complete(db, flow(), exchange({ sub: 'google-222', email: 'nov@tu-sofia.bg', name: 'Nov Student' }));

  assert.equal(user.email, 'nov@tu-sofia.bg');
  const row = db.get('SELECT password_hash FROM users WHERE id = ?', user.id);
  assert.ok(!auth.verifyPassword('', row.password_hash), 'the placeholder must not be a hash of anything');
  assert.ok(!auth.verifyPassword('no-password', row.password_hash));
});

test('AC-15 signing in with the provider twice does not make a second account', async () => {
  const db = connectForTests();
  await complete(db, flow(), exchange({ sub: 'google-333', email: 'dva@tu-sofia.bg' }));
  const after = db.get('SELECT count(*) AS n FROM users').n;
  await complete(db, flow(), exchange({ sub: 'google-333', email: 'dva@tu-sofia.bg' }));

  assert.equal(db.get('SELECT count(*) AS n FROM users').n, after);
  assert.equal(db.get('SELECT count(*) AS n FROM identities WHERE subject = ?', 'google-333').n, 1);
});

test('the same person is matched on the provider id, not on the address', async () => {
  const db = connectForTests();
  const first = await complete(db, flow(), exchange({ sub: 'google-444', email: 'staro@tu-sofia.bg' }));
  // They change their address at Google. Same person, same account.
  const second = await complete(db, flow(), exchange({ sub: 'google-444', email: 'novo@tu-sofia.bg' }));

  assert.equal(second.user.id, first.user.id);
});

test('an id_token that is not a JWT is refused', () => {
  assert.throws(() => decodeClaims('not-a-token'), (err) => err.status === 401);
  assert.throws(() => decodeClaims('a.!!!!.c'), (err) => err.status === 401);
});

test('decodeClaims reads the middle part of a JWT', () => {
  const payload = Buffer.from(JSON.stringify({ sub: 'x', email: 'a@b.c' })).toString('base64url');
  assert.deepEqual(decodeClaims(`header.${payload}.signature`), { sub: 'x', email: 'a@b.c' });
});

test('begin refuses when no OAuth client is configured', () => {
  // The app must run for somebody who has not set a client up, and say so plainly
  // rather than redirecting them to a Google error page.
  assert.throws(() => begin(), (err) => err.status === 400 && /not configured/.test(err.message));
});

test('AC-17 begin builds an authorization URL with state and PKCE', () => {
  // config is read once when the module loads, so configure it the same way here
  // rather than through the environment.
  config.google.clientId = 'id-123';
  config.google.clientSecret = 'secret-456';
  try {
    const { url, state, verifier } = begin();
    const params = new URL(url).searchParams;

    assert.ok(url.startsWith(AUTH_URL));
    assert.equal(params.get('response_type'), 'code', 'the authorization *code* flow, not the implicit one');
    assert.equal(params.get('client_id'), 'id-123');
    assert.equal(params.get('scope'), 'openid email profile');
    assert.equal(params.get('state'), state, 'the value we will compare the callback against');
    assert.equal(params.get('code_challenge_method'), 'S256');

    // PKCE: what we send is the hash, what we keep is the secret. A code stolen in
    // transit is useless without the verifier, which never left this server.
    assert.notEqual(params.get('code_challenge'), verifier);
    assert.equal(params.get('code_challenge'), createHash('sha256').update(verifier).digest('base64url'));

    // The secret is not in the URL. The browser sees this address.
    assert.ok(!url.includes('secret-456'));

    assert.notEqual(begin().state, begin().state, 'a fixed state would guard nothing');
  } finally {
    config.google.clientId = '';
    config.google.clientSecret = '';
  }
});
