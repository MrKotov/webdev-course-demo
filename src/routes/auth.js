// HTTP for signing in and out. Turns a request into service arguments and back.

import { config } from '../config.js';
import { setCookie } from '../http.js';
import * as auth from '../services/auth.js';

export const SESSION_COOKIE = 'lb_session';

export const routes = [
  {
    method: 'POST',
    path: '/api/auth/login',
    handler: ({ db, res, body }) => {
      const { token, user } = auth.signIn(db, body.email, body.password);
      setCookie(res, SESSION_COOKIE, token, { maxAge: config.sessionHours * 3600 });
      return { user };
    },
  },
  {
    method: 'POST',
    path: '/api/auth/logout',
    handler: ({ db, res, token }) => {
      auth.signOut(db, token);
      setCookie(res, SESSION_COOKIE, '', { maxAge: 0 });
      return { ok: true };
    },
  },
  {
    method: 'GET',
    path: '/api/auth/me',
    handler: ({ user }) => ({ user }),
  },
];
