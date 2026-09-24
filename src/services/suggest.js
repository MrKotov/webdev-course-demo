// "Describe what you need, get a slot."
//
// The user types a sentence — "a quiet machine for three of us on Thursday afternoon"
// — and gets back one suggestion: a workstation, a slot, and a line saying why.
//
// Two things about this file are the whole point of having a model feature in a
// teaching project, and they are both small:
//
//  1. THE MODEL'S ANSWER IS NEVER TRUSTED. It picks from a list we built, and we then
//     check its pick against that same list. A model that invents workstation 99, or
//     picks one that was booked while it was thinking, gets dropped. Three lines, and
//     they are the difference between a feature and a liability.
//
//  2. IT DEGRADES. No key, a timeout, a rate limit: the app answers anyway, with a
//     rule it computes itself. The user gets a worse suggestion, not an error page,
//     and the tests never touch the network.

import { badRequest } from '../errors.js';
import * as bookingRows from '../data/bookings.js';
import * as catalog from '../data/catalog.js';
import { SLOTS, describeSlot, hasStarted, stamp } from '../../legacy/slots.js';
import { createClient } from '../model/gemini.js';

const DATE_SHAPE = /^\d{4}-\d{2}-\d{2}$/;

// The shape we force the provider to answer in. Anything else is a failed call.
const SCHEMA = {
  type: 'object',
  properties: {
    workstationId: { type: 'integer' },
    slot: { type: 'integer' },
    reason: { type: 'string' },
  },
  required: ['workstationId', 'slot', 'reason'],
};

/** Every (workstation, slot) pair that is actually free on that date, right now. */
export function openings(db, date) {
  if (!DATE_SHAPE.test(String(date ?? ''))) throw badRequest('date must look like YYYY-MM-DD');
  if (date < stamp()) throw badRequest('That day is already over');

  const taken = new Set(bookingRows.listForDate(db, date).map((b) => `${b.workstation_id}:${b.slot}`));
  const free = [];

  for (const lab of catalog.allLabs(db)) {
    for (const workstation of catalog.workstationsOfLab(db, lab.id)) {
      if (!workstation.active) continue;
      for (const { slot } of SLOTS) {
        if (taken.has(`${workstation.id}:${slot}`)) continue;
        if (hasStarted(date, slot)) continue;
        free.push({
          workstationId: workstation.id,
          label: workstation.label,
          seats: workstation.seats,
          lab: lab.code,
          slot,
          slotTime: describeSlot(slot),
        });
      }
    }
  }
  return free;
}

/**
 * The feature. `model` is injected so the tests can hand in a fake one and the
 * provider is never called from a test suite.
 */
export async function suggest(db, { date, need, seats = 1 }, model = createClient()) {
  const free = openings(db, date);
  const wanted = free.filter((o) => o.seats >= Math.max(1, Number(seats) || 1));

  if (wanted.length === 0) {
    return { suggestion: null, source: 'none', reason: 'Nothing is free on that day for that many people.' };
  }

  const answer = await model.ask(prompt(need, wanted), SCHEMA);

  if (answer) {
    // Check the model's pick against the list we gave it. This is the guard: the
    // model chose, the app decides. `find` returning undefined is not an error
    // worth showing anyone — it just means we fall through to the rule below.
    const picked = wanted.find(
      (o) => o.workstationId === answer.data?.workstationId && o.slot === answer.data?.slot,
    );
    if (picked) {
      record(db, answer.usage, 'ok');
      return { suggestion: picked, source: 'model', reason: String(answer.data.reason ?? '').slice(0, 200) };
    }
    record(db, answer.usage, 'error');
  }

  // The fallback. Earliest free slot on the smallest workstation that still fits:
  // a rule anybody can check, which is exactly what you want when the clever part
  // is unavailable.
  const fallback = [...wanted].sort((a, b) => a.slot - b.slot || a.seats - b.seats || a.workstationId - b.workstationId)[0];
  record(db, null, 'fallback');
  return {
    suggestion: fallback,
    source: 'fallback',
    reason: 'The earliest free slot that fits. (The suggestion service was unavailable, so this is the app\'s own rule.)',
  };
}

function prompt(need, options) {
  return [
    'A student wants to book a workstation in a university computer lab.',
    `They wrote: "${String(need ?? '').slice(0, 500)}"`,
    '',
    'Choose exactly one option from this list and say in one short sentence why it fits.',
    'You may only choose a workstationId and slot pair that appears below.',
    '',
    JSON.stringify(options),
  ].join('\n');
}

/** What the call cost and how long it took. Never what was in it: see migration 005. */
function record(db, usage, outcome) {
  db.run(
    'INSERT INTO model_calls (model, ms, input_tokens, output_tokens, outcome) VALUES (?, ?, ?, ?, ?)',
    usage?.model ?? 'none', usage?.ms ?? 0, usage?.inputTokens ?? null, usage?.outputTokens ?? null, outcome,
  );
}
