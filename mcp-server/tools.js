// The tool table: what this MCP server offers, and what each tool does.
//
// Every tool here calls a function in src/services/. Not one of them writes a query or
// touches src/data/ directly, and that is the rule, not a coincidence:
//
//   HTTP route  ─┐
//                ├─> the same service ─> the same data layer ─> the database
//   MCP tool    ─┘
//
// A booking made by an agent obeys the same limit as one made in the browser, because
// it is literally the same function. The moment a tool grows its own query, you have
// two front doors and only one of them has the rules on it — and nobody notices until
// somebody goes looking, which is what Exercise 5 is.
//
// Every tool also runs *as somebody*. `MCP_TOKEN` is an ordinary session token, so the
// agent may do exactly what that person may do, and nothing more. It is not an admin key.

import * as bookings from '../src/services/bookings.js';
import * as catalogService from '../src/services/catalog.js';
import * as suggestService from '../src/services/suggest.js';
import { describeSlot } from '../legacy/slots.js';

const text = (body, isError = false) => ({ content: [{ type: 'text', text: body }], isError });

const line = (b) => `#${b.id} ${b.workstation.label} in ${b.lab.code} on ${b.date}, ${b.slotTime}${b.purpose ? ` — ${b.purpose}` : ''}`;

/**
 * Every tool: the description a model chooses by, the arguments it takes, and what
 * it runs. `ctx` carries the database and the user the token belongs to.
 */
export const tools = [
  {
    name: 'find_lecture',
    description: 'Look up a lecture of the Web Development course by its number (1 to 12). Returns the title and the topics it covers.',
    inputSchema: { type: 'object', properties: { number: { type: 'integer', minimum: 1, maximum: 12 } }, required: ['number'] },
    signedIn: false,
    run: ({ lectures }, args) => {
      const found = lectures.find((l) => l.number === args?.number);
      if (!found) return text(`There is no lecture ${args?.number}. The course has lectures 1 to ${lectures.length}.`, true);
      return text(`Lecture ${found.number}: ${found.title}. Topics: ${found.topics}`);
    },
  },
  {
    name: 'count_lectures',
    description: 'Return how many lectures the course has. Use it when asked about the size or length of the course.',
    inputSchema: { type: 'object', properties: {} },
    signedIn: false,
    run: ({ lectures }) => text(`The course has ${lectures.length} lectures.`),
  },

  // From here on the tools serve the booking app itself.
  {
    name: 'list_labs',
    description: 'List the computer labs and the workstations in each one, with how many seats every workstation has and whether it is in service.',
    inputSchema: { type: 'object', properties: {} },
    signedIn: false,
    run: ({ db }) => {
      const labs = catalogService.listLabs(db);
      const body = labs
        .map((lab) => `${lab.code} · ${lab.name} (${lab.building})\n` +
          lab.workstations.map((w) => `  ${w.label}, ${w.seats} seat(s)${w.active ? '' : ' — out of service'}`).join('\n'))
        .join('\n');
      return text(body || 'No labs are set up yet.');
    },
  },
  {
    name: 'list_free_slots',
    description: 'Show which workstation and time-slot pairs are still free on a given day. Takes a date as YYYY-MM-DD.',
    inputSchema: {
      type: 'object',
      properties: { date: { type: 'string', description: 'YYYY-MM-DD' } },
      required: ['date'],
    },
    signedIn: false,
    run: ({ db }, args) => {
      const free = suggestService.openings(db, args?.date);
      if (free.length === 0) return text(`Nothing is free on ${args?.date}.`);
      return text(free.map((o) => `${o.label} (${o.lab}, ${o.seats} seat(s)) — ${o.slotTime}`).join('\n'));
    },
  },
  {
    name: 'my_bookings',
    description: 'List the bookings of the signed-in user, including the ones they were added to as an attendee by somebody else.',
    inputSchema: { type: 'object', properties: {} },
    signedIn: true,
    run: ({ db, user }) => {
      const mine = bookings.listMine(db, user.id);
      return text(mine.length ? mine.map(line).join('\n') : 'You have no bookings.');
    },
  },
  {
    name: 'book_slot',
    description: 'Book a workstation for one time slot of one day, on behalf of the signed-in user. Refuses a slot that is already taken, a day in the past, or a booking over the user\'s limit.',
    inputSchema: {
      type: 'object',
      properties: {
        workstationId: { type: 'integer' },
        date: { type: 'string', description: 'YYYY-MM-DD' },
        slot: { type: 'integer', minimum: 1, maximum: 6 },
        purpose: { type: 'string' },
      },
      required: ['workstationId', 'date', 'slot'],
    },
    signedIn: true,
    run: ({ db, user }, args) => text(`Booked. ${line(bookings.create(db, user.id, args))}`),
  },
  {
    name: 'cancel_booking',
    description: 'Cancel a booking by its id and give the slot back. A booking whose slot has already started cannot be cancelled.',
    inputSchema: { type: 'object', properties: { id: { type: 'integer' } }, required: ['id'] },
    signedIn: true,
    run: ({ db, user }, args) => {
      const { freed } = bookings.cancel(db, user.id, args?.id);
      return text(`Cancelled. ${freed} is free again.`);
    },
  },
  {
    name: 'suggest_slot',
    description: 'Describe in words what kind of workstation and time you need, and get one concrete suggestion back with a reason. Falls back to the earliest free slot when the suggestion service is unavailable.',
    inputSchema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'YYYY-MM-DD' },
        need: { type: 'string', description: 'what the user needs, in their own words' },
        seats: { type: 'integer', minimum: 1 },
      },
      required: ['date', 'need'],
    },
    signedIn: true,
    run: async ({ db }, args) => {
      const { suggestion, source, reason } = await suggestService.suggest(db, args);
      if (!suggestion) return text(reason);
      return text(`${suggestion.label} (${suggestion.lab}) — ${describeSlot(suggestion.slot)}\n${reason}\n[source: ${source}]`);
    },
  },
];

/** What tools/list answers with: the table above, minus the part only we need. */
export const advertise = () =>
  tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema }));

export const byName = (name) => tools.find((t) => t.name === name) ?? null;
