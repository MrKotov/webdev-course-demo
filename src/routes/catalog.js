// HTTP for the read-only catalogue: what exists and when it can be booked.

import * as catalog from '../services/catalog.js';

export const routes = [
  { method: 'GET', path: '/api/labs', handler: ({ db }) => ({ labs: catalog.listLabs(db) }) },
  { method: 'GET', path: '/api/slots', handler: () => ({ slots: catalog.listSlots() }) },
];
