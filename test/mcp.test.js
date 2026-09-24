// The MCP tools, driven directly — no subprocess, no stdio.
//
// mcp-server/check.mjs already proves the protocol loop answers `initialize` and
// `tools/list` correctly. What it cannot prove is the thing that matters more: that a
// tool call ends up in the same service function an HTTP request ends up in, with the
// same rules on it. That is what these tests are for.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { connectForTests } from '../src/db.js';
import * as bookings from '../src/services/bookings.js';
import { advertise, byName, tools } from '../mcp-server/tools.js';
import { stamp } from '../legacy/slots.js';

const soon = (days = 1) => stamp(new Date(Date.now() + days * 86_400_000));
const ctx = (db, user = { id: 1, email: 'ivan@tu-sofia.bg' }) => ({ db, user, lectures: [{ number: 1, title: 'x', topics: 'y' }] });
const body = (result) => result.content[0].text;

test('AC-26 every advertised tool has a description a model could choose by', () => {
  for (const tool of advertise()) {
    assert.ok(tool.description.length >= 20, `${tool.name} is described in ${tool.description.length} characters`);
    assert.equal(typeof tool.inputSchema, 'object');
  }
  assert.ok(advertise().length >= 5);
});

test('AC-26 tools/list does not leak the implementation', () => {
  for (const tool of advertise()) {
    assert.deepEqual(Object.keys(tool).sort(), ['description', 'inputSchema', 'name']);
  }
});

test('AC-23 no tool writes its own query', () => {
  // The rule of the design, asserted rather than trusted: one set of rules, two front
  // doors. A tool that reaches past the services is a second way into the data with
  // none of the rules on it.
  const source = tools.map((t) => t.run.toString()).join('\n');
  assert.ok(!/\b(SELECT|INSERT|UPDATE|DELETE)\b/.test(source), 'an MCP tool is writing SQL');
  assert.ok(!/db\.(get|all|run|exec)\(/.test(source), 'an MCP tool is calling the data layer directly');
});

test('AC-24 book_slot goes through the same rules as POST /api/bookings', async () => {
  const db = connectForTests();
  const date = soon();
  await byName('book_slot').run(ctx(db), { workstationId: 1, date, slot: 2, purpose: 'via MCP' });

  // The booking exists and belongs to the token's owner, not to nobody.
  const mine = bookings.listMine(db, 1);
  assert.equal(mine.length, 1);
  assert.equal(mine[0].ownerId, 1);
  assert.equal(mine[0].purpose, 'via MCP');
});

test('AC-24 a rule saying no comes back as a readable tool error, not a crash', async () => {
  const db = connectForTests();
  const date = soon();
  bookings.create(db, 2, { workstationId: 1, date, slot: 2 });

  // The tool table lets the error through; mcp-server/server.js turns an AppError into
  // a result with isError so the model can read it and try something else.
  await assert.rejects(
    async () => byName('book_slot').run(ctx(db), { workstationId: 1, date, slot: 2 }),
    (err) => err.status === 409 && /already booked/.test(err.message),
  );
});

test('AC-25 my_bookings shows only what belongs to the token\'s owner', async () => {
  const db = connectForTests();
  const date = soon();
  bookings.create(db, 2, { workstationId: 3, date, slot: 4 });

  assert.match(body(await byName('my_bookings').run(ctx(db))), /no bookings/i);
  assert.match(body(await byName('my_bookings').run(ctx(db, { id: 2 }))), /WS-03/);
});

test('the tools that act for somebody are marked as such', () => {
  const needUser = tools.filter((t) => t.signedIn).map((t) => t.name);
  assert.deepEqual(needUser.sort(), ['book_slot', 'cancel_booking', 'my_bookings', 'suggest_slot']);
  // Everything else is public in the app too: the catalogue and the lecture list.
  assert.deepEqual(tools.filter((t) => !t.signedIn).map((t) => t.name).sort(),
    ['count_lectures', 'find_lecture', 'list_free_slots', 'list_labs']);
});

test('list_free_slots and list_labs answer from the catalogue', async () => {
  const db = connectForTests();
  assert.match(body(await byName('list_labs').run(ctx(db))), /WS-01/);
  const free = body(await byName('list_free_slots').run(ctx(db), { date: soon() }));
  assert.match(free, /WS-01/);

  const date = soon(2);
  const everyWorkstation = db.all('SELECT id FROM workstations WHERE active = 1').map((w) => w.id);
  for (const w of everyWorkstation) for (const s of [1, 2, 3, 4, 5, 6]) db.run(
    'INSERT INTO bookings (user_id, workstation_id, booking_date, slot) VALUES (?, ?, ?, ?)', 1, w, date, s);
  assert.match(body(await byName('list_free_slots').run(ctx(db), { date })), /Nothing is free/);
});

test('find_lecture and count_lectures still work, unchanged from Exercise 1', async () => {
  const db = connectForTests();
  assert.match(body(await byName('find_lecture').run(ctx(db), { number: 1 })), /Lecture 1/);
  assert.equal((await byName('find_lecture').run(ctx(db), { number: 99 })).isError, true);
  assert.match(body(await byName('count_lectures').run(ctx(db))), /1 lectures/);
});

test('suggest_slot answers even when the suggestion service is unavailable', async () => {
  const db = connectForTests();
  // No GEMINI_API_KEY in a test run, so the real client returns null and the fallback runs.
  const answer = body(await byName('suggest_slot').run(ctx(db), { date: soon(), need: 'quiet' }));
  assert.match(answer, /source: fallback/);
});

test('cancel_booking gives the slot back', async () => {
  const db = connectForTests();
  const date = soon();
  const made = bookings.create(db, 1, { workstationId: 1, date, slot: 2 });
  assert.match(body(await byName('cancel_booking').run(ctx(db), { id: made.id })), /free again/);
  assert.equal(bookings.listMine(db, 1).length, 0);
});

test('an unknown tool is not in the table', () => {
  assert.equal(byName('drop_everything'), null);
});
