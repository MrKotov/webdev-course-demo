// The faculty timetable grid. Moved here unchanged from the old timetable tool
// that the labs used before this app; the six slots and their names are what is
// printed on the doors, so they are not ours to redesign.
//
// The booking service imports this module. It is the single source of truth for
// what a "slot" means, and the API refuses any slot number that is not in here.

export const SLOTS = [
  { slot: 1, start: '07:45', end: '09:20', name: 'first block' },
  { slot: 2, start: '09:30', end: '11:05', name: 'second block' },
  { slot: 3, start: '11:15', end: '12:50', name: 'third block' },
  { slot: 4, start: '13:45', end: '15:20', name: 'fourth block' },
  { slot: 5, start: '15:30', end: '17:05', name: 'fifth block' },
  { slot: 6, start: '17:15', end: '18:50', name: 'evening block' },
];

export function findSlot(slot) {
  return SLOTS.find((s) => s.slot === slot);
}

export function describeSlot(slot) {
  const s = findSlot(slot);
  return s ? `${s.start}-${s.end} (${s.name})` : `unknown slot ${slot}`;
}

/** True when the slot on that date has already started. Dates are 'YYYY-MM-DD'. */
export function hasStarted(date, slot, now = new Date()) {
  const s = findSlot(slot);
  if (!s) return false;
  return new Date(`${date}T${s.start}:00`) <= now;
}

/** 'YYYY-MM-DD' for a Date, in local time. The old tool called this `stamp`. */
export function stamp(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
