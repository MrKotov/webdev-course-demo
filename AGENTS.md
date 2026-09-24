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
- Coverage: `npm run coverage:services` then `npm run coverage` (both gate in CI)
- MCP server: `npm run mcp` (needs `MCP_TOKEN`)
- MCP conformance: `npm run mcp:check`
- Migrate only: `npm run migrate`

## Conventions
- Three layers, and they do not skip each other: `routes/` → `services/` → `data/`.
  No SQL outside `src/data/`. No `req`/`res` outside `src/routes/`.
- `src/db.js` is the only file allowed to name the database engine. The same rule holds
  for the other two outside things: `src/model/gemini.js` is the only file that names the
  model provider, `src/providers/google.js` the only one that talks to Google.
- Every schema change is a new numbered file in `migrations/`. Never edit one that has run.
- Errors: throw the helpers from `src/errors.js`; the router turns them into
  `{"error": "..."}` with the right status. Messages are one readable sentence.
- Business rules go in `src/services/`, and every rule gets a test that names it.
- Node 22, ESM, no dependencies. Adding one needs a reason and an ask.

## Layers
Requests arrive two ways and both end in the same place:

- HTTP route handler → service → data → database
- MCP tool → **the same service** → data → database

A rule written in a route handler protects one caller. A rule written in a service
protects both. Every rule in this project is in a service for that reason.

## The model feature
- `src/model/gemini.js` is the only file that names the provider. Its `ask` returns
  `null` for every failure — no key, timeout, 429, wrong shape — and the caller always
  has a plan.
- `src/services/suggest.js` re-checks whatever the model picked against the real list
  before anything is offered to a user. Never delete that check.
- The fallback is not optional. The app must work with `GEMINI_API_KEY` unset, because
  that is how the tests and CI run.
- Never log a prompt: it holds what a user typed. `model_calls` records the shape of a
  call and nothing of its content.

## The MCP server
- `mcp-server/server.js` is the protocol loop; `mcp-server/tools.js` is the tool table.
- Every tool calls a function in `src/services/`. No SQL, no `src/data/`, no `db.get`.
  `test/mcp.test.js` asserts this, and it is the one test never to relax.
- `MCP_TOKEN` is an ordinary session token. A tool may do exactly what its owner may do.
- A new tool also needs a row in the table in `SPEC.md` and a description of at least
  20 characters: that description is all the model reads when it chooses.

## Tests and coverage
- Every criterion in `SPEC.md` has an id like `AC-12`, and a test whose title names it.
  Adding a criterion means adding a test; the `Traceability` table is the index.
- Two gates in CI: the service layer and the whole project, each on lines *and* branches.
  The service branch gate sits just below its current value on purpose — read the comment
  in `.github/workflows/ci.yml` before you touch it, and never raise a number by deleting
  code or by writing a test that asserts nothing.

## Always ask before
- deleting files or folders
- editing a migration that has already run
- installing or removing dependencies
- pushing, tagging or changing CI
- anything that touches secrets or `.env`
- changing an authentication or authorization rule
- adding, renaming or removing an MCP tool
- changing a coverage threshold
- sending user data to a third-party model

## Never
- commit secrets, passwords, API keys or an OAuth client secret
- weaken or delete a test to make it pass
- lower a coverage threshold or switch off a CI job to make the build green
- add an MCP tool that reaches past the service layer
- log a prompt that contains somebody's personal data
