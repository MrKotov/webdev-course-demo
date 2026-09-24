# Defence notes

Written for Exercise 5, before the defence, while the project is still fresh. This is the
worked example: yours will be shorter and about your own project, but it should have the
same shape — a claim, then the file that backs it.

## What it does

A student books one of the faculty's lab workstations for one block of the timetable, on
a day of their choosing, and cancels a booking they no longer need. Anybody signed in can
see what the labs look like on a given day. The timetable's six blocks are fixed by the
faculty and are not ours to redesign.

## The three files I will open

1. **`src/services/bookings.js`** — because it is where every rule actually lives, and
   because I can point at each rule and say which acceptance criterion it satisfies and
   which test names that criterion. It is also the file the coverage report keeps
   pointing at, which I have written into my gaps below.
2. **`mcp-server/tools.js`** — because it is the shortest way to show why the layering
   matters. Every tool calls a service function. If I had put the booking limit in the
   route handler, an agent would be able to walk straight past it — and the same is true
   of every other rule, which cuts both ways.
3. **`src/services/suggest.js`** — because it holds the three lines that stop a model's
   answer being believed, and those three lines are the difference between a feature and
   a liability.

## Decisions I can defend

**Stack: Node 22, no dependencies at all.** I rejected Express and `passport` and an
OAuth client library. The reason is not purity: it is that the whole thing must run in a
codespace with no build step, the Dockerfile has to stay a single stage, and every line in
the repository has to be one I can explain. The cost is real — I wrote the OAuth flow by
hand, and a library would have handled token refresh, JWKS rotation and three providers
that I do not. What would change my mind: a second provider, or any need to verify a token
we did not fetch ourselves.

**Where the rules live: in `src/services/`, never in a route handler.** The route reads the
request, calls a service, names a status code. That looked like ceremony until the MCP
server arrived and became a second caller of the same rules. It is also the reason
`src/services/catalog.js` exists while holding no rule at all: I would rather have one
honest inconsistency than a rule with exceptions a reader has to memorise.

**Authentication and authorization.** Authentication is "who are you" — a password checked
with scrypt and `timingSafeEqual`, or Google's word for it. Authorization is "may you do
this", and it is a different question asked in a different place: in the service, on the
row, every time. `listMine` filtering by owner is the clearest example, and the rule I
would most want a reviewer to check is that every write does the same.

**scrypt, not SHA-256.** A general-purpose hash is designed to be fast, and fast is exactly
wrong here: it means an attacker who steals the table can try billions of guesses a second.
scrypt is deliberately slow and deliberately memory-hungry, which makes custom hardware
expensive. Argon2id would be the current first choice; scrypt is in the Node standard
library, and the dependency rule decided it.

**Google over the authorization-code flow with PKCE, on the server.** The client secret
never reaches the browser, because anything the browser holds the user can read. `state`
stops somebody handing my browser their callback URL and signing me into their account.
PKCE binds the code to whoever started the flow, so a stolen code is useless. I read the
`id_token`'s claims without checking its signature, and I can say exactly why that is safe
here and would not be anywhere else: I fetched it myself, over TLS, from Google's token
endpoint, with my client secret. If that token ever arrived another way, it would have to
be verified against Google's public keys first.

**Accounts linked on the provider's account id, not on the e-mail.** People change their
address; they are still the same person. And an address Google has not verified is not
evidence of anything, because anybody can type somebody else's address into a profile —
linking on it would hand over that person's account.

**The model: Gemini 2.5 Flash, hosted, named in one file.** A model that runs locally would
cost nothing per call and send nothing anywhere, which are two real advantages. It is also
a ~100 MB dependency that does not fit in Render's free 512 MB, and the dependency rule
above. So: hosted, with the provider named only in `src/model/gemini.js`, the same way
`src/db.js` is the only file that names the database. The interesting design decision is not
which model — it is that **the model's answer is checked against the real data before
anybody sees it**, and that the feature works with no key at all.

**What the MCP server exposes, and what it deliberately does not.** Six tools over the
bookings, plus the two from Exercise 1. Every one goes through a service. There is no tool
that runs a query, no tool that takes a user id as an argument, and no admin token: the
server carries an ordinary session token and may do exactly what its owner may do. What it
does not expose is anything about other people — `my_bookings` is scoped to the token's
user, and there is no `list_all_users`.

**The database shape.** Four entities and one many-to-many: `booking_attendees` joins
bookings and users, because a booking can bring several people and a person can be in
several bookings. `identities` is a separate table rather than two columns on `users`, so a
second provider is a row and not a migration of the users table.

## How I know it works

- **Traceability.** Twenty-six acceptance criteria in `SPEC.md`, each with an id, each named
  in the title of a test. `npm test` is the proof; the `Traceability` table is the index.
  I can pick any criterion and run the one test that proves it.
- **Two coverage gates**, both enforced in CI: the service layer and the whole project.
- **What coverage does not tell me,** and this is the answer I most want to be asked for.
  My service layer is at **100% line coverage** and **85.7% branch coverage**, and the
  difference between those two words is the whole point. A line runs. A branch is a
  decision, and a condition can be evaluated by every test I have and be true in none of
  them, so the line is covered and the decision has never once been made. I have not
  finished chasing that gap down, and it is on my list below rather than quietly rounded
  up. Coverage finds code nobody executed; it cannot find code somebody read badly, and a
  line can be covered by a test that asserts nothing at all.
- **What I checked by hand,** because no test does: the four states of a screen, the whole
  booking flow on a keyboard with no mouse, colour contrast in both themes, and that a
  cold start plus a model call still shows a pending state rather than a dead button. The
  evidence is in `docs/UI.md`.
- **The MCP server**: `npm run mcp:check` runs the same twelve protocol checks the course
  uses for Exercise 1, and `test/mcp.test.js` asserts that no tool contains a query.

## What is wrong with it

In the order I would fix them, from `READINESS.md`:

1. **No rate limiting anywhere.** Sign-in can be brute-forced as fast as the network allows,
   and the suggestion endpoint costs money per call and has no per-user cap.
2. **The database does not survive a restart,** because Render's free plan has no disk.
3. **There is a branch in the service layer that no test takes,** which is why the branch
   gate sits at 85.7% instead of 100%. I know it is there and I have not yet worked out
   whether it is dead code, a missing test, or a rule I never wrote. It is the first thing
   I would look at with another afternoon, because "no test takes this decision" and "this
   decision is wrong" are uncomfortably close to each other.
4. **No sign-up, no password reset,** and an account created through Google can never use a
   password because there is no screen to set one.
5. **No audit trail:** a cancelled booking leaves no record of who cancelled it, which
   means that if something ever did go wrong with a cancellation I could not reconstruct it.

## The thing in this repository I did not write and cannot explain

The PKCE `code_challenge`. I know what it is for and I can say what attack it stops, and I
wrote the four lines that produce it. What I could not have derived, and took from the
specification, is *why S256 and not the plain method* — I know the plain method sends the
verifier itself and is therefore useless against an attacker who can read the request, but
I have not read enough of RFC 7636 to say what else the hash buys, or when the plain method
is still considered acceptable. If I am asked, that is the answer I will give, rather than
a confident guess.
