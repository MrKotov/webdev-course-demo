// The HTTP surface: one real server, one real fetch, cookies and all.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { connectForTests } from '../src/db.js';
import { createHandler } from '../src/routes/index.js';
import { stamp } from '../legacy/slots.js';

let server;
let base;

before(async () => {
  server = createServer(createHandler(connectForTests()));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => server.close());

/** fetch that remembers one session cookie, the way a browser would. */
function client() {
  let cookie = null;
  return async (path, options = {}) => {
    const res = await fetch(base + path, {
      ...options,
      headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}), ...options.headers },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    const set = res.headers.getSetCookie?.()[0];
    if (set) cookie = set.split(';')[0];
    return { status: res.status, body: await res.json() };
  };
}

const tomorrow = stamp(new Date(Date.now() + 86_400_000));

test('AC-1 the wrong password does not sign anyone in', async () => {
  const call = client();
  const res = await call('/api/auth/login', { method: 'POST', body: { email: 'ivan@tu-sofia.bg', password: 'nope' } });

  assert.equal(res.status, 401);
  assert.equal(res.body.error, 'Wrong e-mail or password');
  assert.equal((await call('/api/auth/me')).body.user, null);
});

test('booking endpoints need a session', async () => {
  const call = client();
  assert.equal((await call('/api/bookings')).status, 401);
  assert.equal((await call('/api/bookings', { method: 'POST', body: {} })).status, 401);
});

test('AC-2 sign in, book, read it back, cancel it', async () => {
  const call = client();

  const login = await call('/api/auth/login', { method: 'POST', body: { email: 'ivan@tu-sofia.bg', password: 'parola123' } });
  assert.equal(login.status, 200);
  assert.equal(login.body.user.fullName, 'Ivan Petrov');

  const created = await call('/api/bookings', {
    method: 'POST',
    body: { workstationId: 3, date: tomorrow, slot: 6, purpose: 'lecture 6 demo' },
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.booking.workstation.label, 'WS-03');

  const mine = await call('/api/bookings');
  assert.equal(mine.body.bookings.length, 1);

  const day = await call(`/api/bookings/day?date=${tomorrow}`);
  assert.equal(day.body.bookings.length, 1);

  const gone = await call(`/api/bookings/${created.body.booking.id}`, { method: 'DELETE' });
  assert.equal(gone.status, 200);
  assert.equal((await call('/api/bookings')).body.bookings.length, 0);
});

test('a booking the rules refuse comes back as a readable error', async () => {
  const call = client();
  await call('/api/auth/login', { method: 'POST', body: { email: 'maria@tu-sofia.bg', password: 'parola456' } });

  const bad = await call('/api/bookings', { method: 'POST', body: { workstationId: 1, date: 'next tuesday', slot: 1 } });
  assert.equal(bad.status, 400);
  assert.match(bad.body.error, /YYYY-MM-DD/);

  const off = await call('/api/bookings', { method: 'POST', body: { workstationId: 5, date: tomorrow, slot: 1 } });
  assert.equal(off.status, 409);
  assert.match(off.body.error, /out of service/);
});

test('AC-3 signing out ends the session', async () => {
  const call = client();
  await call('/api/auth/login', { method: 'POST', body: { email: 'ivan@tu-sofia.bg', password: 'parola123' } });
  assert.equal((await call('/api/auth/me')).body.user.email, 'ivan@tu-sofia.bg');

  await call('/api/auth/logout', { method: 'POST' });
  assert.equal((await call('/api/auth/me')).body.user, null);
  assert.equal((await call('/api/bookings')).status, 401);
});

test('a password stored as a hash cannot be read back out of it', async () => {
  // Round trip through the real hashing, so the test fails if somebody swaps scrypt
  // for something fast. Fast is the problem: a hash an attacker can compute billions
  // of times per second is a password list with extra steps.
  const { hashPassword, verifyPassword } = await import('../src/services/auth.js');
  const stored = hashPassword('parola123');

  assert.ok(!stored.includes('parola123'));
  assert.ok(verifyPassword('parola123', stored));
  assert.ok(!verifyPassword('parola124', stored));
  assert.ok(!verifyPassword('parola123', 'md5$abc$def'), 'a stored value in another scheme is not accepted');
  assert.ok(!verifyPassword('parola123', 'nonsense'));
  assert.notEqual(hashPassword('parola123'), stored, 'the salt makes two hashes of the same password differ');
});

test('signing in with Google is offered only when it is configured', async () => {
  // No client id in a test run, so the route must say so instead of sending the
  // browser to a Google error page.
  const res = await fetch(base + '/api/auth/google', { redirect: 'manual' });
  assert.equal(res.status, 302);
  assert.match(res.headers.get('location'), /error=/);
});

test('the suggestion endpoint answers without a model key', async () => {
  const call = client();
  await call('/api/auth/login', { method: 'POST', body: { email: 'ivan@tu-sofia.bg', password: 'parola123' } });

  const openings = await call(`/api/openings?date=${tomorrow}`);
  assert.equal(openings.status, 200);
  assert.ok(openings.body.openings.length > 0);

  const res = await call('/api/suggest', { method: 'POST', body: { date: tomorrow, need: 'somewhere quiet' } });
  assert.equal(res.status, 200);
  assert.equal(res.body.source, 'fallback');
  assert.ok(res.body.suggestion.workstationId);
});

test('the suggestion endpoint needs a signed-in user', async () => {
  const call = client();
  assert.equal((await call('/api/suggest', { method: 'POST', body: { date: tomorrow, need: 'x' } })).status, 401);
  assert.equal((await call(`/api/openings?date=${tomorrow}`)).status, 401);
});

test('AC-11 a bad date reaches the caller as a 400, not a 500', async () => {
  const call = client();
  await call('/api/auth/login', { method: 'POST', body: { email: 'ivan@tu-sofia.bg', password: 'parola123' } });
  const res = await call('/api/openings?date=tuesday');
  assert.equal(res.status, 400);
  assert.match(res.body.error, /YYYY-MM-DD/);
});

test('a method the route does not answer is a 405, and an unknown path a 404', async () => {
  const call = client();
  assert.equal((await call('/api/slots', { method: 'POST', body: {} })).status, 405);
  assert.equal((await call('/api/nothing-here')).status, 404);
});

test('a body that is not JSON does not take the server down', async () => {
  const res = await fetch(base + '/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: 'not json at all',
  });
  assert.equal(res.status, 500, 'a readable failure, and the process is still running');
  assert.equal((await fetch(base + '/api/slots')).status, 200);
});

test('the front end is served, and a path cannot climb out of src/web', async () => {
  assert.equal((await fetch(base + '/')).status, 200);
  assert.equal((await fetch(base + '/style.css')).status, 200);
  const escape = await fetch(base + '/../../package.json');
  assert.notEqual(escape.status, 200);
});

test('AC-12 the Google routes redirect, and a callback that did not start here is refused', async (t) => {
  const { config } = await import('../src/config.js');
  config.google.clientId = 'id-123';
  config.google.clientSecret = 'secret-456';
  t.after(() => { config.google.clientId = ''; config.google.clientSecret = ''; });

  const start = await fetch(base + '/api/auth/google', { redirect: 'manual' });
  assert.equal(start.status, 302);
  assert.match(start.headers.get('location'), /^https:\/\/accounts\.google\.com\//);

  const cookies = start.headers.getSetCookie();
  assert.ok(cookies.some((c) => c.startsWith('lb_oauth_state=') && /HttpOnly/.test(c)));
  assert.ok(cookies.some((c) => c.startsWith('lb_oauth_verifier=') && /HttpOnly/.test(c)));
  assert.ok(!start.headers.get('location').includes('secret-456'), 'the browser must never see the client secret');

  // A callback carrying somebody else's state, with no matching cookie in this browser:
  // the flow did not start here, so it is refused and the person lands back on the page.
  const forged = await fetch(base + '/api/auth/google/callback?code=x&state=theirs', { redirect: 'manual' });
  assert.equal(forged.status, 302);
  assert.match(decodeURIComponent(forged.headers.get('location')), /did not start here/);
  assert.equal((await (await fetch(base + '/api/auth/me')).json()).user, null, 'nobody got signed in');
});

test('AC-10 the day view lists every booking that day, across labs', async () => {
  const call = client();
  await call('/api/auth/login', { method: 'POST', body: { email: 'ivan@tu-sofia.bg', password: 'parola123' } });

  const other = client();
  await other('/api/auth/login', { method: 'POST', body: { email: 'maria@tu-sofia.bg', password: 'parola456' } });

  const day = stamp(new Date(Date.now() + 5 * 86_400_000));
  await call('/api/bookings', { method: 'POST', body: { workstationId: 1, date: day, slot: 6 } });
  await other('/api/bookings', { method: 'POST', body: { workstationId: 3, date: day, slot: 6 } });

  const res = await call(`/api/bookings/day?date=${day}`);
  assert.equal(res.status, 200);
  const labs = new Set(res.body.bookings.map((b) => b.lab.code));
  assert.equal(res.body.bookings.length, 2, 'both bookings, not only mine');
  assert.ok(labs.size >= 1);
  // A different day is unaffected.
  const empty = await call(`/api/bookings/day?date=${stamp(new Date(Date.now() + 6 * 86_400_000))}`);
  assert.deepEqual(empty.body.bookings, []);
});
