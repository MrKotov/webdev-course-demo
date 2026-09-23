# Lab booking

Book a workstation in one of the faculty labs for one block of the day.

This is the demo project of the course „Програмиране за Интернет". It was built
from the course template the same way your own project is: a spec, an agent, a
migration per change, tests that state a rule. It is deliberately small — the
whole thing is meant to be read on screen in one lecture.

What it does:

- you sign in with the e-mail the faculty gave you (there is no sign-up: accounts come from the faculty);
- you book a workstation for a date and one of the six timetable blocks;
- you may bring other registered people along, up to the number of seats;
- a workstation cannot be booked twice for the same block, and you may not hold more than three upcoming bookings;
- you can see everything booked in the labs on a given day.

## Run it

Needs Node 22 or newer. There are no dependencies to install — the database is
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

## Run the tests

```bash
npm test
```

Twelve tests, all on the built-in `node:test` runner. `test/bookings.test.js`
runs the rules against an in-memory database, `test/api.test.js` starts a real
server on a random port and talks to it over HTTP, cookies and all. The same
command runs in CI on every push.

## The API

| Method | Path | What |
|---|---|---|
| `POST` | `/api/auth/login` | e-mail and password in, session cookie out |
| `POST` | `/api/auth/logout` | drop the session |
| `GET` | `/api/auth/me` | who is signed in, or `null` |
| `GET` | `/api/labs` | labs with their workstations |
| `GET` | `/api/slots` | the six timetable blocks |
| `GET` | `/api/bookings` | the bookings you own or were added to |
| `GET` | `/api/bookings/day?date=YYYY-MM-DD` | everything booked that day |
| `POST` | `/api/bookings` | make one; 400/404/409 when a rule says no |
| `DELETE` | `/api/bookings/:id` | give the slot back |

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
| `src/web/` | The front end: two HTML pages, one stylesheet, one script. No framework. |
| `migrations/` | Numbered SQL files. Applied in order, once each, recorded in `schema_migrations`. |
| `legacy/` | The timetable grid, kept from the tool this app replaced. Still imported by the booking service — see `legacy/README.md`. |
| `test/` | Rules first, endpoints second. |
| `mcp-server/` | Exercise 1: the MCP server, and the self-check that grades it. |
| `Dockerfile` | One stage, no build step. Deployed to Render from this file. |
| `.github/workflows/ci.yml` | Tests, the MCP check and the image build, on every push. |

## The data model

```
users ──< bookings >── workstations ──< labs
            │
            └──< booking_attendees >── users      (many-to-many)
```

A booking has one owner (`bookings.user_id`) and any number of attendees
(`booking_attendees`). `GET /api/bookings` returns both kinds, which is why the
query in `src/data/bookings.js` has that `OR ... IN (...)` in it.

## Deploying

The image runs anywhere, and migrations run at boot, so a deploy is just a push.
On Render: Docker environment, port 3000, `SESSION_SECRET` set in the dashboard.
`DATABASE_URL` is what changes when the demo graduates from SQLite to Neon
Postgres — and `src/db.js` is the only file that has to change with it.
