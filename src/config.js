// Everything the app reads from the environment, in one place.
// See .env.example for the full list.

export const config = {
  port: Number(process.env.PORT ?? 3000),
  // sqlite:<path>, or ':memory:' for tests. On Render this would become a postgres:// URL.
  databaseUrl: process.env.DATABASE_URL ?? 'sqlite:./data/lab-booking.db',
  sessionSecret: process.env.SESSION_SECRET ?? 'dev-only-not-a-secret',
  sessionHours: Number(process.env.SESSION_HOURS ?? 12),
  // A user may not hold more than this many bookings in the future at the same time.
  maxActiveBookings: Number(process.env.MAX_ACTIVE_BOOKINGS ?? 3),
};
