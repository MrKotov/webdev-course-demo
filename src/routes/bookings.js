// HTTP for bookings. Every rule lives in src/services/bookings.js; this file only
// unpacks the request and names the status code.

import * as bookings from '../services/bookings.js';

export const routes = [
  {
    method: 'GET',
    path: '/api/bookings',
    signedIn: true,
    handler: ({ db, user }) => ({ bookings: bookings.listMine(db, user.id) }),
  },
  {
    method: 'GET',
    path: '/api/bookings/day',
    signedIn: true,
    handler: ({ db, url }) => ({ bookings: bookings.listByDate(db, url.searchParams.get('date')) }),
  },
  {
    method: 'POST',
    path: '/api/bookings',
    signedIn: true,
    status: 201,
    handler: ({ db, user, body }) => ({ booking: bookings.create(db, user.id, body) }),
  },
  {
    method: 'DELETE',
    path: '/api/bookings/:id',
    signedIn: true,
    handler: ({ db, user, params }) => bookings.cancel(db, user.id, params.id),
  },
];
