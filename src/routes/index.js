// The router: match method + path, find the signed-in user, call the handler,
// and turn whatever comes back (or is thrown) into one JSON response.

import { AppError, unauthorized } from '../errors.js';
import { readCookie, readJson, sendJson, serveStatic } from '../http.js';
import * as auth from '../services/auth.js';
import { routes as authRoutes, SESSION_COOKIE } from './auth.js';
import { routes as bookingRoutes } from './bookings.js';
import { routes as catalogRoutes } from './catalog.js';

const ROUTES = [...authRoutes, ...catalogRoutes, ...bookingRoutes].map((route) => ({
  ...route,
  // '/api/bookings/:id' -> /^\/api\/bookings\/(?<id>[^/]+)$/
  matcher: new RegExp(`^${route.path.replace(/:(\w+)/g, '(?<$1>[^/]+)')}$`),
}));

function match(method, pathname) {
  let wrongMethod = null;
  for (const route of ROUTES) {
    const found = route.matcher.exec(pathname);
    if (!found) continue;
    const hit = { route, params: found.groups ?? {}, methodOk: route.method === method };
    if (hit.methodOk) return hit;
    // keep looking: several routes share a path and differ only by method
    wrongMethod ??= hit;
  }
  return wrongMethod;
}

/** Build the request listener. `db` is injected so the tests can pass their own. */
export function createHandler(db) {
  return async function handle(req, res) {
    const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);

    if (!url.pathname.startsWith('/api/')) {
      if (await serveStatic(res, url.pathname)) return;
      return sendJson(res, 404, { error: 'Not found' });
    }

    const hit = match(req.method, url.pathname);
    if (!hit) return sendJson(res, 404, { error: `No route for ${url.pathname}` });
    if (!hit.methodOk) return sendJson(res, 405, { error: `${req.method} not allowed here` });

    try {
      const token = readCookie(req, SESSION_COOKIE);
      const user = auth.currentUser(db, token);
      if (hit.route.signedIn && !user) throw unauthorized();

      const body = req.method === 'POST' || req.method === 'PUT' ? await readJson(req) : {};
      const result = await hit.route.handler({ db, req, res, url, token, user, body, params: hit.params });
      return sendJson(res, hit.route.status ?? 200, result);
    } catch (err) {
      if (err instanceof AppError) return sendJson(res, err.status, { error: err.message });
      console.error('unhandled', err);
      return sendJson(res, 500, { error: 'Something went wrong on our side' });
    }
  };
}
