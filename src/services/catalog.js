// What can be booked. Read-only: labs and workstations come from migrations.

import * as catalog from '../data/catalog.js';
import { SLOTS } from '../../legacy/slots.js';

export function listLabs(db) {
  return catalog.allLabs(db).map((lab) => ({
    id: lab.id,
    code: lab.code,
    name: lab.name,
    building: lab.building,
    workstations: catalog.workstationsOfLab(db, lab.id).map((w) => ({
      id: w.id,
      label: w.label,
      seats: w.seats,
      active: Boolean(w.active),
    })),
  }));
}

export const listSlots = () => SLOTS;
