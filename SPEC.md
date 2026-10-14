# Lab booking

The demo project. Written the way the exercise asks: non-goals first, and using the
headings the self-checks look for by name.

## Project option

Lab booking. A student sees which university lab workstations are free on a given day,
books a block and cancels their own booking.

## Non-goals

- No sign-up, no password reset, no e-mail. Accounts come from the faculty.
- No roles. An assistant is an ordinary account.
- No recurring bookings, no waiting list, no notifications.
- No calendar integration and no export.
- No admin screen: labs and workstations change through a migration.

## Goals

- A student books a free workstation for a date and one block of the timetable.
- A student sees what they hold and cancels what they no longer need.
- Anyone signed in can see what is booked in the labs on a given day.
- A booking may list other registered people, so the assistant knows who to expect.

## Constraints

- Node 22, no framework, no dependencies that need compiling: it has to run in a codespace.
- The six timetable blocks are fixed by the faculty (`legacy/slots.js`).
- One relational database, reachable through one module, so it can move to Neon Postgres later.
- Small enough to read out loud: under 700 lines of **server** source. The front end
  is counted separately, because the four states of every screen and a usable keyboard
  path cost lines that the layering lesson does not.
- No dependency at all, including for OAuth, the model call and coverage. Everything
  used here is in the Node standard library, which is what keeps `npm ci` instant and
  the Dockerfile a single stage. A model running locally would break this constraint,
  and that is the reason this project uses a hosted one; see "The model feature".

## The model feature

- **Model:** Gemini 2.5 Flash, over the REST API, named in exactly one file
  (`src/model/gemini.js`) the way `src/db.js` is the only file that names the database.
- **Input:** a sentence the student types ("a quiet machine for three of us, early if
  possible"), plus the list of workstation-and-block pairs that are genuinely free that
  day. The model never sees the database; it sees a list we built.
- **Output:** one pick from that list and a one-sentence reason, forced into a fixed
  JSON shape by the provider's response schema.
- **When it fails:** no key, a timeout, a 429 or a reply in the wrong shape all produce
  the same thing (no answer) and the app falls back to its own rule, the earliest free
  block that has enough seats. The user gets a worse suggestion, labelled as the app's
  rule rather than a suggestion, instead of an error. `src/services/suggest.js` also
  re-checks whatever the model picked against the real list, so an invented workstation
  or one booked while the model was thinking is dropped.
- **Why hosted and not local:** a small local model is a ~100 MB dependency and does not
  fit Render's free 512 MB. Stated here because the choice is a trade-off, not an obvious
  right answer: a local model would cost nothing per call and leak nothing.
- **What leaves the app:** the typed sentence and the free-slot list. No names, no
  e-mail addresses, no booking history. Nothing about a call is logged except its shape.
  See `migrations/005_model_calls.sql`.

## Auth

- **Local:** e-mail and password. Stored as scrypt with a per-account salt, compared with
  `timingSafeEqual`. A wrong password and an unknown address give the same message, so the
  response does not say which addresses exist.
- **Provider:** Sign in with Google, the authorization-code flow with PKCE, entirely on the
  server (`src/services/oauth.js`, with the one network call in `src/providers/google.js`).
  The client secret never reaches the browser, which is the reason this flow lives here.
- **Linking:** one person, one row in `users`. A Google account is an extra row in
  `identities`, matched on Google's permanent account id rather than on the e-mail address,
  so changing an address at Google does not create a second account. An address Google has
  not verified is never linked, because anyone can type somebody else's address into a
  profile.
- **Both paths issue the same `lb_session` cookie**, so nothing downstream knows or cares
  which was used.
- **Authorization** is separate and lives in the services: only the owner may cancel.

## MCP tools

The server in `mcp-server/` grew out of Exercise 1. Every tool calls a function in
`src/services/`; none writes a query. It carries a session token in `MCP_TOKEN`, so it
acts as that person and may do exactly what they may do.

| Tool | What it does | Who may call it |
| --- | --- | --- |
| `list_labs` | Lists the labs and their workstations, with seats and whether each is in service | anyone |
| `list_free_slots` | Shows which workstation-and-block pairs are still free on a given day | anyone |
| `my_bookings` | Lists the bookings of the token's owner, including ones they were added to | the token's owner |
| `book_slot` | Books a workstation for one block, under the same rules as the HTTP API | the token's owner |
| `cancel_booking` | Cancels a booking and frees the block | the token's owner |
| `suggest_slot` | Describe what you need in words, get one concrete suggestion back | the token's owner |
| `find_lecture` | Looks up a course lecture by number. Kept from Exercise 1 | anyone |
| `count_lectures` | Says how many lectures the course has. Kept from Exercise 1 | anyone |

## UI

Plain HTML, ES modules and one hand-written stylesheet; no framework and no build step.
Three screens: sign in, book (suggestion, manual form, my bookings), and one whole day.
Colour, spacing, type and radius all come from tokens at the top of `src/web/style.css`.
Every list has four states: loading, empty, error, success. The graded checklist and the
evidence are in `docs/UI.md`.

## Architecture

One request, `POST /api/bookings`, through every layer:

1. `src/server.js` hands the request to the listener built by `src/routes/index.js`.
2. That router matches the method and path, reads the `lb_session` cookie, and asks
   `src/services/auth.js` who the caller is. `signedIn: true` on the route means no user
   is a 401 before the handler runs.
3. `src/routes/bookings.js` unpacks the body and calls `bookings.create(db, user.id, body)`.
   It names the status code (201) and nothing else.
4. `src/services/bookings.js` holds every rule: the date shape, the block exists, the day
   is not past, the workstation is active and free, the user is under their limit, the
   people fit in the seats. It throws `AppError`, which knows a status but not HTTP.
5. `src/data/bookings.js` is the only place a query for this table is written.
6. `src/db.js` is the only module that names the engine.
7. Back out: the router turns the returned object, or the thrown `AppError`, into one
   JSON response. In the browser `src/web/api.js` turns a failed response into an Error
   carrying a readable sentence, `app.js` redraws, `ui.js` does the drawing.

The **MCP server enters at step 4**, not at step 1: `mcp-server/tools.js` calls the same
service function with the same user id. That is why a rule written in a route handler
protects one caller and a rule written in a service protects both.

**Where this codebase does not match its own layering:** `src/services/catalog.js` is a
pass-through: it reshapes rows and holds no rule at all, so the layer earns nothing there.
It is kept for symmetry, so that every route talks to a service and a reader never has to
ask which ones are special. That is a deliberate trade of one honest inconsistency for a
rule with no exceptions.

## Acceptance criteria

### Slice 1: sign in and see my bookings
- [AC-1] Wrong password gives 401 and the same message as an unknown e-mail.
- [AC-2] After signing in, `GET /api/bookings` lists what I own and what I was added to.
- [AC-3] The session survives a page reload and ends on sign-out.

### Slice 2: book and cancel
- [AC-4] A booking needs an existing, active workstation, a date that is not past, and a block 1–6.
- [AC-5] A second booking of the same workstation, day and block is refused with 409 and a sentence naming the workstation.
- [AC-6] A fourth upcoming booking for the same person is refused with 409.
- [AC-7] More people than seats is refused with 400.
- [AC-8] Cancelling frees the slot: the same workstation, day and block can be booked again right after.
- [AC-9] A block that has already started cannot be cancelled.

### Slice 3: the day view
- [AC-10] `GET /api/bookings/day?date=` lists every booking that day, across labs.
- [AC-11] A date that is not `YYYY-MM-DD` gives 400.

### Slice 4: signing in with Google
- [AC-12] A callback whose `state` does not match the cookie is refused with 401, and nobody is signed in.
- [AC-13] A Google account whose e-mail address Google has not verified is refused and no row is written to `identities`.
- [AC-14] Signing in with a Google account whose verified address already exists links to that account: `users` gains no row.
- [AC-15] Signing in with the same Google account twice creates exactly one row in `identities`.
- [AC-16] An account created through Google has no password that can be used: `verifyPassword` returns false for every input.
- [AC-17] The authorization URL carries `response_type=code`, an `S256` `code_challenge` that is not the verifier, and never the client secret.

### Slice 5: the suggestion
- [AC-18] A suggestion the model picked from the offered list is returned with `source: "model"`.
- [AC-19] A pick that is not in the offered list (invented, or taken while the model was thinking) is discarded, and the answer falls back to the app's rule.
- [AC-20] With no answer from the provider, the endpoint still answers 200 with `source: "fallback"` and the earliest free block that has enough seats.
- [AC-21] A day with nothing free for that many people answers with no suggestion rather than a wrong one.
- [AC-22] Every call is recorded in `model_calls` with its outcome, and no column of that table holds what the user typed.

### Slice 6: the MCP server
- [AC-23] No tool implementation contains SQL or calls the data layer: every one goes through `src/services/`.
- [AC-24] `book_slot` produces a booking owned by the token's user and obeys the same 409 rules as `POST /api/bookings`.
- [AC-25] `my_bookings` shows only the bookings of the token's user.
- [AC-26] Every advertised tool has a description of at least 20 characters and an input schema, and `tools/list` exposes nothing else.

## Traceability

Each criterion, and the test whose title names it. `npm test` is the proof; this table
is only the index.

| Criterion | Test |
| --- | --- |
| AC-1 | `test/api.test.js` · the wrong password does not sign anyone in |
| AC-2 | `test/api.test.js` · a booking made over HTTP comes back in the list |
| AC-3 | `test/api.test.js` · signing out ends the session |
| AC-4 | `test/bookings.test.js` · a slot outside the timetable is refused / a day that is already over is refused |
| AC-5 | `test/bookings.test.js` · the same workstation cannot be taken twice in one slot |
| AC-6 | `test/bookings.test.js` · a user cannot hold more than three upcoming bookings |
| AC-7 | `test/bookings.test.js` · the people brought along must fit in the seats |
| AC-8 | `test/bookings.test.js` · cancelling a booking frees the slot again |
| AC-9 | `test/bookings.test.js` · a block that has already started cannot be cancelled |
| AC-10 | `test/api.test.js` · the day view lists every booking that day |
| AC-11 | `test/api.test.js` · a bad date reaches the caller as a 400, not a 500 |
| AC-12 | `test/oauth.test.js` · a state that does not match the cookie is refused |
| AC-13 | `test/oauth.test.js` · an unverified e-mail address is not proof of anything |
| AC-14 | `test/oauth.test.js` · a verified address links to the account that already has it |
| AC-15 | `test/oauth.test.js` · signing in with the provider twice does not make a second account |
| AC-16 | `test/oauth.test.js` · an address nobody has yet creates one account, with no usable password |
| AC-17 | `test/oauth.test.js` · begin builds an authorization URL with state and PKCE |
| AC-18 | `test/suggest.test.js` · a suggestion the model picked from the list is used |
| AC-19 | `test/suggest.test.js` · a workstation the model invented is thrown away / a slot that was taken while the model was thinking |
| AC-20 | `test/suggest.test.js` · no answer from the provider still produces a suggestion |
| AC-21 | `test/suggest.test.js` · a day with nothing free says so instead of guessing |
| AC-22 | `test/suggest.test.js` · every call is recorded, and the prompt is not |
| AC-23 | `test/mcp.test.js` · no tool writes its own query |
| AC-24 | `test/mcp.test.js` · book_slot goes through the same rules as POST /api/bookings |
| AC-25 | `test/mcp.test.js` · my_bookings shows only what belongs to the token's owner |
| AC-26 | `test/mcp.test.js` · every advertised tool has a description a model could choose by |

## Spec vs result

The agent got slices 1 and 2 nearly right on the first pass. Two things it did
not do until it was told:

1. It put the "not more than three upcoming" count in the route handler. Moved
   into `src/services/bookings.js`, where the other rules live.
2. It invented its own list of time blocks instead of importing `legacy/slots.js`,
   because the folder name made it assume the file was dead. That is the reason
   `legacy/README.md` now says out loud that the module is still in use.

Criterion AC-9, "a block that has already started cannot be cancelled", is in the code
but had no test for a long time: it needs a clock the test can move, and that was left
for later. It is written down here rather than quietly dropped, which is the only useful
thing to do with a gap you are not closing today.

The later slices, added when the project grew to its full shape:

3. Asked for "sign in with Google", the agent reached for a library and put the whole
   flow in the route handler. Both were wrong for this codebase, and for different
   reasons: the dependency breaks a stated constraint, and a route handler is not where
   rules live. The flow moved to `src/services/oauth.js`, the one network call to
   `src/providers/google.js`.
4. Asked for the suggestion feature, it wrote a working call to the model and no
   fallback at all, so the feature, and the page around it, simply failed without a
   key. The guard that re-checks the model's pick was also missing, and that is the more
   interesting omission: the code was correct for every answer the model gets right.
5. Asked to expose the bookings over MCP, it wrote fresh SQL in the tool handlers. It
   worked, and it silently skipped every rule in `src/services/`, including the booking
   limit. `test/mcp.test.js` now asserts that no tool contains a query, because this is
   the mistake that will be made again.

## Coverage

Two gates, in `.github/workflows/ci.yml`. The service layer is at 100% of lines, 100% of
functions and 85% of branches; the whole project at 90% of lines and 85% of branches.

The gap between the service layer's line number and its branch number is not slack that
somebody forgot to close, and the branch gate is deliberately set just below the current
value rather than raised to make the report look tidy. A branch no test takes is a
decision nobody has checked, and the run keeps saying so until somebody goes and reads it.
