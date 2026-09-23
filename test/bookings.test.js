// The business rules. These run against a fresh in-memory database, no HTTP.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { connectForTests } from '../src/db.js';
import * as bookings from '../src/services/bookings.js';
import { stamp } from '../legacy/slots.js';

const IVAN = 1;
const MARIA = 2;

/** A date far enough ahead that no slot on it has started. */
const soon = (days = 1) => stamp(new Date(Date.now() + days * 86_400_000));

test('a booking keeps the workstation, the day and the slot it was made for', () => {
  const db = connectForTests();
  const made = bookings.create(db, IVAN, { workstationId: 1, date: soon(), slot: 2, purpose: 'Exercise 4' });

  assert.equal(made.workstation.label, 'WS-01');
  assert.equal(made.slot, 2);
  assert.match(made.slotTime, /09:30/);
  assert.deepEqual(bookings.listMine(db, IVAN).map((b) => b.id), [made.id]);
});

test('the same workstation cannot be taken twice in one slot', () => {
  const db = connectForTests();
  const date = soon();
  bookings.create(db, IVAN, { workstationId: 1, date, slot: 3 });

  assert.throws(
    () => bookings.create(db, MARIA, { workstationId: 1, date, slot: 3 }),
    (err) => err.status === 409 && /already booked/.test(err.message),
  );
  // the neighbouring workstation in the same slot is still free
  assert.ok(bookings.create(db, MARIA, { workstationId: 2, date, slot: 3 }).id);
});

test('a slot outside the timetable is refused', () => {
  const db = connectForTests();
  assert.throws(
    () => bookings.create(db, IVAN, { workstationId: 1, date: soon(), slot: 9 }),
    (err) => err.status === 400 && /1 to 6/.test(err.message),
  );
});

test('a day that is already over is refused', () => {
  const db = connectForTests();
  assert.throws(
    () => bookings.create(db, IVAN, { workstationId: 1, date: '2001-09-11', slot: 1 }),
    (err) => err.status === 400,
  );
});

test('a user cannot hold more than three upcoming bookings', () => {
  const db = connectForTests();
  for (const workstationId of [1, 2, 3]) {
    bookings.create(db, IVAN, { workstationId, date: soon(2), slot: 1 });
  }
  assert.throws(
    () => bookings.create(db, IVAN, { workstationId: 4, date: soon(3), slot: 1 }),
    (err) => err.status === 409 && /already hold/.test(err.message),
  );
});

test('the people brought along must fit in the seats, and they see the booking', () => {
  const db = connectForTests();
  const made = bookings.create(db, IVAN, {
    workstationId: 1, date: soon(), slot: 4, attendeeEmails: ['maria@tu-sofia.bg'],
  });

  assert.deepEqual(made.attendees.map((a) => a.email), ['maria@tu-sofia.bg']);
  assert.deepEqual(bookings.listMine(db, MARIA).map((b) => b.id), [made.id]);

  // WS-01 seats two, so a third person does not fit
  assert.throws(
    () => bookings.create(db, MARIA, {
      workstationId: 1, date: soon(2), slot: 4,
      attendeeEmails: ['ivan@tu-sofia.bg', 'assistant@tu-sofia.bg'],
    }),
    (err) => err.status === 400 && /seat/.test(err.message),
  );
});

test('cancelling a booking frees the slot again', () => {
  const db = connectForTests();
  const date = soon();
  const made = bookings.create(db, IVAN, { workstationId: 1, date, slot: 5 });

  bookings.cancel(db, IVAN, made.id);

  assert.deepEqual(bookings.listMine(db, IVAN), []);
  assert.ok(bookings.create(db, MARIA, { workstationId: 1, date, slot: 5 }).id);
});

test('cancelling something that is not there is a 404', () => {
  const db = connectForTests();
  assert.throws(() => bookings.cancel(db, IVAN, 4242), (err) => err.status === 404);
});
