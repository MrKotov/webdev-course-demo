// The only module in the app that talks to Google.
//
// Same rule as src/db.js and src/model/gemini.js: one file names the outside thing,
// everything above it talks to a small interface. Adding GitHub sign-in tomorrow means
// writing src/providers/github.js and changing one line in src/services/oauth.js.
//
// It is also the only file in the app that makes a network call for authentication,
// which is why src/services/oauth.js can be tested end to end without the internet:
// it takes this exchange as an argument.

import { config } from '../config.js';
import { unauthorized } from '../errors.js';

export const TOKEN_URL = 'https://oauth2.googleapis.com/token';
export const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';

/**
 * Swap the one-time code for an id_token and return its claims.
 *
 * We read those claims without verifying the token's signature, and that is safe
 * *only because of how we got it*: this is our own HTTPS request to Google's token
 * endpoint, authenticated with our client secret. Nobody else is in the middle.
 * An id_token that arrived any other way — pushed to us by a browser, read out of a
 * URL — must have its signature checked against Google's public keys before a single
 * claim in it is believed.
 */
export async function exchange({ code, verifier }) {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: config.google.clientId,
      client_secret: config.google.clientSecret,
      redirect_uri: config.google.redirectUri,
      grant_type: 'authorization_code',
      code_verifier: verifier,
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) throw unauthorized('Google refused the sign-in');
  const { id_token: idToken } = await res.json();
  if (!idToken) throw unauthorized('Google returned no id_token');
  return decodeClaims(idToken);
}

/** The middle part of a JWT is base64url-encoded JSON. This reads it; it does not trust it. */
export function decodeClaims(idToken) {
  const payload = String(idToken).split('.')[1];
  if (!payload) throw unauthorized('That id_token is not a JWT');
  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    throw unauthorized('That id_token carries no readable claims');
  }
}
