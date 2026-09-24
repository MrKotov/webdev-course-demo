// Everything the app reads from the environment, in one place.
// See .env.example for the full list.

const baseUrl = (process.env.PUBLIC_BASE_URL ?? `http://localhost:${process.env.PORT ?? 3000}`).replace(/\/$/, '');

export const config = {
  port: Number(process.env.PORT ?? 3000),
  // sqlite:<path>, or ':memory:' for tests. On Render this would become a postgres:// URL.
  databaseUrl: process.env.DATABASE_URL ?? 'sqlite:./data/lab-booking.db',
  sessionSecret: process.env.SESSION_SECRET ?? 'dev-only-not-a-secret',
  sessionHours: Number(process.env.SESSION_HOURS ?? 12),
  // A user may not hold more than this many bookings in the future at the same time.
  maxActiveBookings: Number(process.env.MAX_ACTIVE_BOOKINGS ?? 3),
  baseUrl,

  // Sign in with Google. Empty here means the button is not shown and the routes say so:
  // the app must run for somebody who has not set an OAuth client up, including in tests.
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID ?? '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
    // Google matches this string exactly against the list in the cloud console.
    redirectUri: `${baseUrl}/api/auth/google/callback`,
  },

  // The model feature. No key is a supported state, not a broken one: the suggestion
  // falls back to a rule the app computes itself. See src/services/suggest.js.
  model: {
    apiKey: process.env.GEMINI_API_KEY ?? '',
    name: process.env.MODEL_NAME ?? 'gemini-2.5-flash',
    timeoutMs: Number(process.env.MODEL_TIMEOUT_MS ?? 8000),
  },
};
