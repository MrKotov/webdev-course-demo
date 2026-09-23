// The business rules of the app. No SQL and no HTTP in this file: it takes plain
// values, asks src/data/* for rows, and throws AppError when a rule says no.

import { config } from '../config.js';
import { badRequest, conflict, notFound } from '../errors.js';
import * as bookingRows from '../data/bookings.js';
import * as catalog from '../data/catalog.js';
import * as users from '../data/users.js';
import { describeSlot, findSlot, hasStarted, stamp } from '../../legacy/slots.js';

const DATE_SHAPE = /^\d{4}-\d{2}-\d{2}$/;

function view(db, row) {
  return {
    id: row.id,
    ownerId: row.user_id,
    date: row.booking_date,
    slot: row.slot,
    slotTime: describeSlot(row.slot),
    purpose: row.purpose,
    workstation: { id: row.workstation_id, label: row.workstation_label, seats: row.workstation_seats },
    lab: { code: row.lab_code, name: row.lab_name },
    attendees: bookingRows.attendeesOf(db, row.id),
  };
}

/** Everything the user owns, plus everything they were added to as an attendee. */
export function listMine(db, userId) {
  return bookingRows.listForUser(db, userId).map((row) => view(db, row));
}

export function listByDate(db, date) {
  if (!DATE_SHAPE.test(String(date ?? ''))) throw badRequest('date must look like YYYY-MM-DD');
  return bookingRows.listForDate(db, date).map((row) => view(db, row));
}

/**
 * Book a workstation for one slot of one day.
 * Rules: the slot exists, the day is not in the past, the workstation is usable,
 * nobody else holds that slot, the user is under their booking limit, and the
 * people brought along fit in the seats.
 */
export function create(db, userId, input) {
  const date = String(input?.date ?? '');
  const slot = Number(input?.slot);
  const workstationId = Number(input?.workstationId);
  const purpose = String(input?.purpose ?? '').slice(0, 200);
  const attendeeEmails = Array.isArray(input?.attendeeEmails) ? input.attendeeEmails : [];

  if (!DATE_SHAPE.test(date)) throw badRequest('date must look like YYYY-MM-DD');
  if (!findSlot(slot)) throw badRequest('slot must be a number from 1 to 6');
  if (date < stamp()) throw badRequest('That day is already over');
  if (hasStarted(date, slot)) throw badRequest('That slot has already started');

  const workstation = catalog.findWorkstation(db, workstationId);
  if (!workstation) throw notFound('No such workstation');
  if (!workstation.active) throw conflict(`${workstation.label} is out of service`);

  if (bookingRows.findConflict(db, { workstationId, date, slot })) {
    throw conflict(`${workstation.label} is already booked on ${date}, ${describeSlot(slot)}`);
  }
  if (bookingRows.countUpcomingForUser(db, userId) >= config.maxActiveBookings) {
    throw conflict(`You already hold ${config.maxActiveBookings} upcoming bookings`);
  }

  const attendees = users.findByEmails(db, attendeeEmails.map((e) => String(e).trim().toLowerCase()))
    .filter((u) => u.id !== userId);
  if (attendees.length + 1 > workstation.seats) {
    throw badRequest(`${workstation.label} has ${workstation.seats} seat(s)`);
  }

  const id = db.tx(() => {
    const newId = bookingRows.insert(db, { userId, workstationId, date, slot, purpose });
    for (const attendee of attendees) bookingRows.addAttendee(db, newId, attendee.id);
    return newId;
  });
  return view(db, bookingRows.findById(db, id));
}

/** Give the slot back. A booking that has already started stays on the record. */
export function cancel(db, userId, bookingId) {
  const row = bookingRows.findById(db, Number(bookingId));
  if (!row) throw notFound('No such booking');

  const user = users.findById(db, userId);
  if (!user) throw notFound('No such booking');

  if (hasStarted(row.booking_date, row.slot)) {
    throw conflict('A booking that has already started cannot be cancelled');
  }

  db.tx(() => {
    bookingRows.removeAttendees(db, row.id);
    bookingRows.remove(db, row.id);
  });
  return { id: row.id, freed: `${row.workstation_label} on ${row.booking_date}, ${describeSlot(row.slot)}` };
}
