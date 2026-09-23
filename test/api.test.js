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

test('the wrong password does not sign anyone in', async () => {
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

test('sign in, book, read it back, cancel it', async () => {
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
