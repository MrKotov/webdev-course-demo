// The model feature, tested without a model.
//
// Every test here hands `suggest` a fake client. That is not a shortcut: a test that
// calls a real provider is slow, needs a key, costs money, and fails on a Tuesday
// because somebody else in the class used up the free quota. The fake lets us test the
// two things that actually matter — the guard and the fallback — which a real call
// could not test reliably anyway, because we cannot make a real model answer wrongly
// on demand.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { connectForTests } from '../src/db.js';
import * as bookings from '../src/services/bookings.js';
import { openings, suggest } from '../src/services/suggest.js';
import { stamp } from '../legacy/slots.js';

const IVAN = 1;
const soon = (days = 1) => stamp(new Date(Date.now() + days * 86_400_000));

/** A stand-in for src/model/gemini.js. `answer` is whatever the model "replies". */
const fakeModel = (answer) => ({
  name: 'fake',
  ask: async () => (answer === null ? null : { data: answer, usage: { ms: 12, model: 'fake', inputTokens: 100, outputTokens: 20 } }),
});

test('openings lists only what is really free', () => {
  const db = connectForTests();
  const date = soon();
  const before = openings(db, date);
  bookings.create(db, IVAN, { workstationId: 1, date, slot: 2 });
  const after = openings(db, date);

  assert.equal(after.length, before.length - 1);
  assert.ok(!after.some((o) => o.workstationId === 1 && o.slot === 2));
});

test('openings refuses a day that is already over', () => {
  const db = connectForTests();
  assert.throws(() => openings(db, '2020-01-01'), (err) => err.status === 400);
  assert.throws(() => openings(db, 'next tuesday'), (err) => err.status === 400);
});

test('AC-18 a suggestion the model picked from the list is used', async () => {
  const db = connectForTests();
  const date = soon();
  const free = openings(db, date);
  const target = free[3];

  const result = await suggest(
    db,
    { date, need: 'somewhere quiet' },
    fakeModel({ workstationId: target.workstationId, slot: target.slot, reason: 'It is quiet in the morning.' }),
  );

  assert.equal(result.source, 'model');
  assert.equal(result.suggestion.workstationId, target.workstationId);
  assert.equal(result.suggestion.slot, target.slot);
  assert.equal(result.reason, 'It is quiet in the morning.');
});

test('AC-19 a workstation the model invented is thrown away', async () => {
  const db = connectForTests();
  const date = soon();

  // 999 does not exist. A model that has read a list can still answer outside it,
  // and if the app believed this it would offer a booking that cannot be made.
  const result = await suggest(db, { date, need: 'anything' }, fakeModel({ workstationId: 999, slot: 1, reason: 'Trust me.' }));

  assert.equal(result.source, 'fallback');
  assert.notEqual(result.suggestion.workstationId, 999);
  assert.ok(openings(db, date).some((o) => o.workstationId === result.suggestion.workstationId && o.slot === result.suggestion.slot));
});

test('AC-19 a slot that was taken while the model was thinking is thrown away', async () => {
  const db = connectForTests();
  const date = soon();
  const free = openings(db, date);
  const target = free[0];
  // Somebody else books it in the two seconds the model spent answering.
  bookings.create(db, IVAN, { workstationId: target.workstationId, date, slot: target.slot });

  const result = await suggest(db, { date, need: 'anything' }, fakeModel({ workstationId: target.workstationId, slot: target.slot, reason: 'Free.' }));

  assert.equal(result.source, 'fallback');
  assert.ok(!(result.suggestion.workstationId === target.workstationId && result.suggestion.slot === target.slot));
});

test('AC-20 no answer from the provider still produces a suggestion', async () => {
  const db = connectForTests();
  const date = soon();

  // null is what src/model/gemini.js returns for a missing key, a timeout and a 429 alike.
  const result = await suggest(db, { date, need: 'anything' }, fakeModel(null));

  assert.equal(result.source, 'fallback');
  assert.ok(result.suggestion);
  assert.match(result.reason, /earliest free slot/i);
});

test('AC-20 the fallback is the earliest slot that has enough seats', async () => {
  const db = connectForTests();
  const date = soon();

  const result = await suggest(db, { date, need: 'four of us', seats: 4 }, fakeModel(null));

  assert.ok(result.suggestion.seats >= 4);
  const eligible = openings(db, date).filter((o) => o.seats >= 4);
  assert.equal(result.suggestion.slot, Math.min(...eligible.map((o) => o.slot)));
});

test('AC-21 a day with nothing free says so instead of guessing', async () => {
  const db = connectForTests();
  const date = soon();
  // Nothing in this lab seats twelve.
  const result = await suggest(db, { date, need: 'a lecture', seats: 12 }, fakeModel(null));

  assert.equal(result.suggestion, null);
  assert.equal(result.source, 'none');
});

test('AC-22 every call is recorded, and the prompt is not', async () => {
  const db = connectForTests();
  const date = soon();
  const free = openings(db, date);

  await suggest(db, { date, need: 'my secret plans' }, fakeModel({ ...free[0], reason: 'Fits.' }));
  await suggest(db, { date, need: 'my secret plans' }, fakeModel(null));

  const rows = db.all('SELECT model, ms, input_tokens, outcome FROM model_calls ORDER BY id');
  assert.deepEqual(rows.map((r) => r.outcome), ['ok', 'fallback']);
  assert.equal(rows[0].input_tokens, 100);

  const columns = db.all('PRAGMA table_info(model_calls)').map((c) => c.name);
  assert.ok(!columns.some((c) => /prompt|text|need|content/.test(c)), 'a log is the easiest place to leak what a user typed');
});
