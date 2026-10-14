# Readiness report: Lab booking

Written for Exercise 4. Everything below is something I checked, not something I assume.
Where I could not check a thing, it says so.

## 1. Live URL and how to verify it

`https://lab-booking.onrender.com`

Three checks, in order, taking about a minute:

```bash
curl -s https://lab-booking.onrender.com/api/slots | head -c 80
# {"slots":[{"slot":1,"start":"07:45","end":"09:20","name":"first block"}, ...
```

1. `GET /api/slots` answers 200 with six blocks. This is also Render's health check, so
   if it fails the service never goes live at all.
2. Open the site: the sign-in card appears, with the password form and the Google button.
3. Sign in as `ivan@tu-sofia.bg` / `parola123`, ask for a suggestion, book it, cancel it.

**How I checked:** ran all three from a browser and a terminal on a machine that had
never opened the site, on 2026-09-24. The first request took 41 seconds, because a free
service sleeps after fifteen minutes of quiet; the second took 180 ms.

## 2. Environment variables

| Name | What it is for | Where the value comes from | Secret |
| --- | --- | --- | --- |
| `PORT` | the port the app listens on | set by Render, read by `src/config.js` | no |
| `DATABASE_URL` | which database, and where | `render.yaml`; a Neon URL when this stops being a demo | yes, once it is Postgres |
| `SESSION_SECRET` | reserved for signing the session cookie | `generateValue: true` in `render.yaml` | yes |
| `SESSION_HOURS` | how long a sign-in lasts | default 12 | no |
| `MAX_ACTIVE_BOOKINGS` | how many upcoming bookings one person may hold | default 3 | no |
| `PUBLIC_BASE_URL` | builds the OAuth redirect URI | Render fills it from the service's own hostname | no |
| `GOOGLE_CLIENT_ID` | identifies this app to Google | Google Cloud console | no, but it is configuration |
| `GOOGLE_CLIENT_SECRET` | proves this app to Google | Google Cloud console, typed into Render (`sync: false`) | **yes** |
| `GEMINI_API_KEY` | the suggestion feature | aistudio.google.com, typed into Render (`sync: false`) | **yes** |
| `MODEL_NAME` | which model | default `gemini-2.5-flash` | no |
| `MCP_TOKEN` | which user the MCP server acts as | a session token, never set on the web service | **yes** |

**How I checked:** `grep -r process.env src/` lists exactly these; every one appears in
`.env.example` with a placeholder, and `git log -p -- .env` is empty because there is no
`.env` in the repository.

## 3. What happens when things fail

| What fails | What the user sees | What the app does |
| --- | --- | --- |
| The service is asleep | up to ~50 seconds of nothing, then the page | Render starts the container; this is the free plan's behaviour, not a bug |
| The database file is gone after a restart | the seeded demo accounts, no bookings | migrations run at boot, so the schema is always there; the free plan has no disk, which is why this is a demo |
| Gemini is down, rate-limited or slow | a suggestion tagged **app rule** instead of **suggested** | `src/model/gemini.js` returns null after 8 seconds; `suggest.js` uses its own rule |
| No `GEMINI_API_KEY` at all | the same as above, always | the feature never calls out; this is how CI runs |
| Google is unreachable mid-sign-in | back on the sign-in page with a readable message | `src/routes/oauth.js` catches and redirects with `?error=` |
| The network drops while the page is open | "Could not reach the server. Check your connection and try again." | `src/web/api.js` turns a failed `fetch` into that sentence |
| An unhandled exception in a handler | "Something went wrong on our side" and a 500 | the real error goes to the server log, never to the user |

**How I checked:** the model paths are covered by `test/suggest.test.js` with a fake
client; the network-drop message by replacing `window.fetch` in the browser console and
watching the suggestion card show its error state while the rest of the page kept working;
the sleep by leaving the service alone for twenty minutes and timing the next request.

**Not checked:** the behaviour when Neon is unreachable, because this deployment still
uses SQLite. That is in the gaps below.

## 4. Four states of one screen

The "My bookings" list:

- **Loading:** three grey blocks the height of a booking row, so nothing moves when the
  real rows arrive.
- **Empty:** "No bookings yet", then "Pick a workstation and a block above, and it will
  appear here." Never a blank area.
- **Error:** "That did not load", the reason in a sentence, and a **Try again** button.
- **Success:** the rows, and a message in the live region naming what changed ("WS-01 on
  2026-09-26, 15:30–17:05 is free again").

The suggestion card has the same four, plus a fifth that matters more: while the model is
being asked, it shows "Looking for something that fits…" with an animated marker, because
a model call plus a cold start can run past forty seconds and a still button reads as broken.

**How I checked:** each state forced in the browser: loading by throttling the network,
empty by cancelling everything, error by making `fetch` reject, success by booking. Screenshots
are in `docs/UI.md`.

## 5. Request waterfall

Opening the site, signed in:

| Request | Why | Time |
| --- | --- | --- |
| `GET /` | the HTML | 12 ms |
| `GET /style.css`, `/app.js` | one stylesheet, one module | 4 ms each, in parallel |
| `GET /api.js`, `/ui.js` | imported by `app.js`, so they start after it arrives | 3 ms each |
| `GET /api/auth/me` | who is this | 6 ms |
| `GET /api/labs`, `GET /api/slots` | the pickers, requested together with `Promise.all` | 8 ms |
| `GET /api/bookings` | the list | 7 ms |

Two things I would change if this had to be fast: the two module imports are a second
round trip that a bundler would remove, and `/api/auth/me` could be inlined into the HTML
so the page does not need a request to decide which half of itself to show.

**How I checked:** the browser's network panel on a warm service, reload with cache disabled.

## 6. Security basics checked

- Passwords are scrypt with a per-account salt, compared with `timingSafeEqual`.
- A wrong password and an unknown address give the same message and the same status.
- The session cookie is `HttpOnly`, `SameSite=Strict`, and expires.
- The OAuth `state` cookie is `SameSite=Lax`, because the browser arrives from Google;
  a `Strict` cookie would not be sent and the flow could not be verified at all.
- The client secret is never sent to the browser: the token exchange is server to server.
- An id_token is only trusted because we fetched it ourselves over TLS; that reasoning is
  written in `src/providers/google.js` rather than assumed.
- Every query is parameterized; SQL exists only in `src/data/`.
- Everything a user typed is escaped before it goes into HTML (`esc` in `src/web/ui.js`).
- The static file server normalizes the path, so `/../../package.json` does not serve.
- The request body is capped at 64 KB.
- No prompt, and nothing a user typed, is written to any log.

**How I checked:** by reading each of those lines of code and, for the last four, by
trying them: a path traversal, a 200 KB body, a booking purpose of `<img src=x onerror=…>`,
and `grep -rn "console.log" src/` to see what is actually written out.

**Not checked:** rate limiting, because there is none. See the gaps.

## 7. Model feature

- **What leaves the app:** the sentence the user typed, and the list of free
  workstation-and-block pairs for that day (ids, labels, seat counts, block times). No
  name, no e-mail address, no booking history, nothing about other people.
- **What is kept:** for every call, the model name, how long it took, the token counts the
  provider reported and whether it worked. Deliberately not the prompt;
  `migrations/005_model_calls.sql` says why, and `test/suggest.test.js` asserts that no
  column of that table could hold it.
- **Cost per request:** a suggestion sends roughly 900 input tokens and gets back about 60.
  At Gemini 2.5 Flash's list price on 2026-09-24 that is about **$0.0004 per suggestion**,
  or around 2,500 suggestions per dollar. The free tier charged nothing, so this is an
  arithmetic exercise, and it is an upper bound: the free tier does not report cache hits.
- **When the provider is down:** the app answers anyway, with its own rule, and says so on
  the screen. Nothing in the app is unavailable because the model is.
- **Correctness:** the model's pick is checked against the real list before it is shown.
  An invented workstation, or one booked while the model was thinking, is dropped and the
  fallback runs instead.

**How I checked:** ran it with a key, without a key, and with a key and no network. The
token counts come from the `model_calls` rows of a real run; the price from Google's
pricing page on 2026-09-24.

## 8. MCP

- **Which tools:** `list_labs`, `list_free_slots`, `my_bookings`, `book_slot`,
  `cancel_booking`, `suggest_slot`, plus `find_lecture` and `count_lectures` from
  Exercise 1. The table in `SPEC.md` is the list of record.
- **Who may call them:** the server reads `MCP_TOKEN`, an ordinary session token, and
  resolves it to a user exactly as the HTTP router resolves the cookie. Four tools need
  that user; the other four are public in the app too.
- **What a token grants:** precisely what that person may do in the browser, because the
  tool calls the same service function. It is not an admin key and there is no way to make
  it one without changing a service.
- **Not deployed.** The MCP server runs beside a developer's agent over stdio, not on
  Render. Nothing exposes it over the network, which is the reason it can be this simple.
- **Whatever is true of the API is true here.** Every tool calls the same service function
  a route calls, so a rule enforced there is enforced for both, and anything missing there
  is missing for both. That is the correct consequence of the design and the reason the
  review in Exercise 5 should read the services rather than the routes.

**How I checked:** `npm run mcp:check` passes all twelve protocol checks;
`test/mcp.test.js` asserts no tool contains a query and that `my_bookings` shows only the
token owner's rows.

## 9. Known gaps, ranked by risk

1. **No rate limiting anywhere.** Sign-in can be tried as fast as the network allows, and
   so can the suggestion endpoint, which costs money per call. Highest risk, and the
   cheapest to fix: a counter per address in `sessions`, and a per-user cap on suggestions.
2. **The database does not survive a restart.** Render's free plan has no disk, so bookings
   are lost whenever the container recycles. Acceptable for a demo, unacceptable for a lab
   that people rely on. The fix is the Neon URL and a Postgres branch in `src/db.js`.
3. **There is no sign-up and no password reset.** Accounts come from a migration. Anyone
   locked out stays locked out.
4. **An account created through Google can never use a password,** and there is no screen
   to set one. Reasonable today, confusing the first time somebody tries.
5. **The suggestion is not rate-limited per user either,** so one person can spend the
   whole day's free quota and every other user silently gets the fallback. They will not be
   told why.
6. **No audit trail.** A cancelled booking leaves no record of who cancelled it.
7. **The service layer is at 100% line coverage and 85.7% branch coverage,** and the
   difference is a branch in `src/services/bookings.js` that no test ever takes. A branch
   nobody takes is a decision nobody has checked. I have not yet established whether it is
   dead code, a missing test, or a rule that was never written, and the gate is set below
   the number rather than on it so the report keeps asking.
8. **A signed-out visitor on the day view sees an error, not an invitation.** "You are not
   signed in" is not a loading failure and should not be shown as one. The page should say
   what it is and offer the sign-in screen.
9. **`src/services/catalog.js` holds no rule** and is a pass-through, so the layer earns
   nothing there. Kept for consistency; see the note in `SPEC.md`.

There are gaps. A readiness report with none is a report nobody believes.
