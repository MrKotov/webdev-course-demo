# Instructions for the agent

Read this file at the start of every session. Keep it short and correct; update it when the project changes.

## Project
Booking a lab workstation for one block of the day: users, labs, workstations,
bookings, and the people brought along. See `SPEC.md` for goals, non-goals and
acceptance criteria, and `README.md` for the file map.

## Commands
- Install: `npm install`
- Run: `npm start` (serves http://localhost:3000; migrations run at boot)
- Test: `npm test`
- Migrate only: `npm run migrate`
- Exercise 1 self-check: `node mcp-server/check.mjs -- node mcp-server/server.js`

## Conventions
- Three layers, and they do not skip each other: `routes/` → `services/` → `data/`.
  No SQL outside `src/data/`. No `req`/`res` outside `src/routes/`.
- `src/db.js` is the only file allowed to name the database engine.
- Every schema change is a new numbered file in `migrations/`. Never edit one that has run.
- Errors: throw the helpers from `src/errors.js`; the router turns them into
  `{"error": "..."}` with the right status. Messages are one readable sentence.
- Business rules go in `src/services/`, and every rule gets a test that names it.
- Node 22, ESM, no dependencies. Adding one needs a reason and an ask.

## Always ask before
- deleting files or folders
- editing a migration that has already run
- installing or removing dependencies
- pushing, tagging or changing CI
- anything that touches secrets or `.env`

## Never
- commit secrets, passwords or API keys
- weaken or delete a test to make it pass
