# Lab booking

Book a workstation in one of the faculty labs for one block of the day.

This is the demo project of the course „Програмиране за Интернет". It was built
from the course template the same way your own project is: a spec, an agent, a
migration per change, tests that state a rule. It is deliberately small, and the
whole thing is meant to be read on screen in one lecture.

What it does:

- you sign in with the e-mail the faculty gave you, with a password or with Google;
- you describe what you need in words and get one concrete suggestion back;
- you book a workstation for a date and one of the six timetable blocks;
- you may bring other registered people along, up to the number of seats;
- a workstation cannot be booked twice for the same block, and you may not hold more than three upcoming bookings;
- you can see everything booked in the labs on a given day;
- an agent can do all of that through the project's own MCP server, under the same rules.

## Run it

Needs Node 22 or newer. There are no dependencies to install: the database is
the built-in `node:sqlite`, the HTTP server is the built-in `node:http`.

```bash
npm install          # writes package-lock.json; there is nothing to download
cp .env.example .env # optional: the defaults already work
npm start            # http://localhost:3000
```

The database file is created and migrated on the first start (`data/lab-booking.db`).
Delete that file to start from an empty database. To apply migrations without
starting the server: `npm run migrate`.

Demo accounts, created by migration `003`:

| e-mail | password |
|---|---|
| `ivan@tu-sofia.bg` | `parola123` |
| `maria@tu-sofia.bg` | `parola456` |
| `assistant@tu-sofia.bg` | `parola789` |

## Sign in with Google

Optional: without `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` the button says so
instead of failing. To switch it on, create an OAuth client in the Google Cloud console,
leave it in **Testing** mode with yourself as a test user, which is free and needs no app
verification, and add `<PUBLIC_BASE_URL>/api/auth/google/callback` to its list of
authorized redirect URIs. Google requires https for anything that is not localhost, so a
codespace's forwarded URL and a Render URL both work; register every address you will
sign in from.

## The suggestion feature

`POST /api/suggest` takes a sentence and a day and answers with one workstation and block.
Without `GEMINI_API_KEY` it falls back to the app's own rule (the earliest free block that
fits) and says on screen which of the two you are looking at. That is not a degraded mode
to be fixed: it is how the tests and CI run, and the reason the feature cannot take the
rest of the app down with it.

## The MCP server

```bash
MCP_TOKEN=<a session token> npm run mcp     # start it for an agent
npm run mcp:check                            # the Exercise 1 conformance checks
```

`mcp-server/server.js` is the protocol loop from Exercise 1, barely changed.
`mcp-server/tools.js` is the tool table, and every tool calls a function in
`src/services/`, never a query of its own. `MCP_TOKEN` is an ordinary session token, so
the agent may do exactly what that person may do.

## Run the tests

```bash
npm test                  # every test
npm run coverage:services # the rules layer, gated
npm run coverage          # everything, gated
```

All on the built-in `node:test` runner, no dependency. `test/bookings.test.js` and
`test/suggest.test.js` run the rules against an in-memory database; `test/oauth.test.js`
runs the whole Google flow with the one network call passed in; `test/mcp.test.js` drives
the tool table directly; `test/api.test.js` starts a real server on a random port and talks
to it over HTTP, cookies and all. Every acceptance criterion in `SPEC.md` has an id like
`AC-12`, and a test whose title names it.

The service layer is gated at 100% of lines and 85% of *branches*, and the gap between
those two numbers is on purpose. A line runs; a branch is a decision, and a condition can
be executed by every test you have and be true in none of them. The comment in
`.github/workflows/ci.yml` explains what to do about it, and it is worth reading before
you copy any of these numbers into your own project, where both should be 100.

## The API

| Method | Path | What |
|---|---|---|
| `POST` | `/api/auth/login` | e-mail and password in, session cookie out |
| `POST` | `/api/auth/logout` | drop the session |
| `GET` | `/api/auth/me` | who is signed in, or `null` |
| `GET` | `/api/auth/google` | start the Google flow; 302 to Google |
| `GET` | `/api/auth/google/callback` | come back from Google; 302 to `/` with the same session cookie the password path issues |
| `GET` | `/api/labs` | labs with their workstations |
| `GET` | `/api/slots` | the six timetable blocks |
| `GET` | `/api/bookings` | the bookings you own or were added to |
| `GET` | `/api/bookings/day?date=YYYY-MM-DD` | everything booked that day |
| `POST` | `/api/bookings` | make one; 400/404/409 when a rule says no |
| `DELETE` | `/api/bookings/:id` | give the slot back |
| `GET` | `/api/openings?date=YYYY-MM-DD` | every workstation-and-block pair still free that day |
| `POST` | `/api/suggest` | a sentence in, one suggestion out, with `source: "model"` or `"fallback"` |

Errors are always `{"error": "one readable sentence"}` with an honest status code.

## The file map

Read in this order.

| Path | What it is |
|---|---|
| `src/server.js` | **Start here.** Connect, migrate, listen. Nothing else. |
| `src/routes/` | The HTTP layer: one route table per area, plus `index.js`, which matches, checks the session and formats the answer. |
| `src/services/` | The rules. `bookings.js` is the file the course is actually about. No SQL, no HTTP. |
| `src/data/` | SQL, one module per group of tables. Nothing above this layer writes SQL. |
| `src/db.js` | The only file that names the database engine. Also applies the migrations. |
| `src/http.js` | Body, cookies, static files. Twenty lines of what a framework would give you. |
| `src/config.js` | Everything read from the environment. |
| `src/model/gemini.js` | The only file that names the model provider. Returns `null` for every kind of failure. |
| `src/providers/google.js` | The only file that talks to Google. The one network call of the sign-in flow. |
| `src/web/` | The front end: two HTML pages, one token stylesheet, three modules: `api.js` talks to the server, `ui.js` draws, `app.js` holds the flows. No framework, no build step. |
| `migrations/` | Numbered SQL files. Applied in order, once each, recorded in `schema_migrations`. |
| `legacy/` | The timetable grid, kept from the tool this app replaced. Still imported by the booking service; see `legacy/README.md`. |
| `test/` | Rules first, endpoints second. |
| `mcp-server/` | The project's MCP server. `server.js` is the Exercise 1 protocol loop; `tools.js` is the tool table, and every tool goes through `src/services/`. |
| `docs/UI.md` | The UI checklist this project is graded against, with the evidence. |
| `READINESS.md`, `DEFENSE.md` | The Exercise 4 and 5 deliverables, written out in full as worked examples. |
| `Dockerfile` | One stage, no build step. Deployed to Render from this file. |
| `.github/workflows/ci.yml` | Tests, the two coverage gates, the MCP check and the image build, on every push. |

## The data model

```
users ──< bookings >── workstations ──< labs
   │        │
   │        └──< booking_attendees >── users      (many-to-many)
   │
   └──< identities                                (one per provider account)

model_calls                                       (no foreign key: it is a log, not a relation)
```

A booking has one owner (`bookings.user_id`) and any number of attendees
(`booking_attendees`). `GET /api/bookings` returns both kinds, which is why the
query in `src/data/bookings.js` has that `OR ... IN (...)` in it.

`identities` is a separate table rather than two more columns on `users`, so one person
stays one account however many ways they sign in, and adding a second provider is a row
rather than a migration of the users table.

## Deploying

The image runs anywhere, and migrations run at boot, so a deploy is just a push.
On Render: Docker environment, port 3000. `render.yaml` generates `SESSION_SECRET` and
fills `PUBLIC_BASE_URL` from the service itself; `GOOGLE_CLIENT_ID`,
`GOOGLE_CLIENT_SECRET` and `GEMINI_API_KEY` are marked `sync: false`, which means the
value is typed into the dashboard and never enters this repository. That matters more than
usual here, because the repository is public.

The free plan has no disk and sleeps after fifteen minutes, so bookings are lost on a
restart and the first request after a quiet spell can take the best part of a minute. Both
are written down in `READINESS.md` rather than discovered by whoever demonstrates it next.
`DATABASE_URL` is what changes when the demo graduates from SQLite to Neon
Postgres, and `src/db.js` is the only file that has to change with it.
