// HTTP for the suggestion feature. The rule, the model call and the guard are all in
// src/services/suggest.js; this file unpacks the request and names the status code.

import * as suggest from '../services/suggest.js';

export const routes = [
  {
    method: 'GET',
    path: '/api/openings',
    signedIn: true,
    handler: ({ db, url }) => ({ openings: suggest.openings(db, url.searchParams.get('date')) }),
  },
  {
    method: 'POST',
    path: '/api/suggest',
    signedIn: true,
    handler: ({ db, body }) => suggest.suggest(db, body),
  },
];
