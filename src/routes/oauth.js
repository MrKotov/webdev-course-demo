// HTTP for "Sign in with Google". Unlike the rest of the API these two routes answer
// with redirects, because the browser has to visit Google and come back.
//
// All the reasoning lives in src/services/oauth.js. This file only moves values
// between the request, two short-lived cookies and the service.

import { redirect, setCookie } from '../http.js';
import * as oauth from '../services/oauth.js';
import { SESSION_COOKIE } from './auth.js';
import { config } from '../config.js';

const STATE_COOKIE = 'lb_oauth_state';
const VERIFIER_COOKIE = 'lb_oauth_verifier';
const FIVE_MINUTES = 300;

export const routes = [
  {
    method: 'GET',
    path: '/api/auth/google',
    handler: ({ res }) => {
      // Whoever reaches these two routes is looking at a browser window, not at JSON,
      // so every failure here goes back to the page as a message it can show.
      if (!oauth.isConfigured()) {
        return redirect(res, `/?error=${encodeURIComponent('Signing in with Google is not configured on this server')}`);
      }
      const { url, state, verifier } = oauth.begin();
      // Lax, not Strict: the browser arrives here from accounts.google.com, and a
      // Strict cookie is not sent on a cross-site navigation, so the callback would
      // find nothing to compare against. Lax is sent on a top-level GET, which is
      // exactly this case and nothing wider.
      setCookie(res, STATE_COOKIE, state, { maxAge: FIVE_MINUTES, sameSite: 'Lax' });
      setCookie(res, VERIFIER_COOKIE, verifier, { maxAge: FIVE_MINUTES, sameSite: 'Lax' });
      redirect(res, url);
    },
  },
  {
    method: 'GET',
    path: '/api/auth/google/callback',
    handler: async ({ db, res, url, cookies }) => {
      try {
        const { token } = await oauth.complete(db, {
          code: url.searchParams.get('code'),
          state: url.searchParams.get('state'),
          expectedState: cookies(STATE_COOKIE),
          verifier: cookies(VERIFIER_COOKIE),
        });
        setCookie(res, SESSION_COOKIE, token, { maxAge: config.sessionHours * 3600 });
        clear(res);
        redirect(res, '/');
      } catch (error) {
        clear(res);
        redirect(res, `/?error=${encodeURIComponent(error.message)}`);
      }
    },
  },
];

function clear(res) {
  setCookie(res, STATE_COOKIE, '', { maxAge: 0, sameSite: 'Lax' });
  setCookie(res, VERIFIER_COOKIE, '', { maxAge: 0, sameSite: 'Lax' });
}
