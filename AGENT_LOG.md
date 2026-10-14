# Agent log

One entry per session: what was asked, what came back, what had to be corrected.

## Session 1: Exercise 1, the MCP server
Asked the agent to explain the `initialize` handshake and to review the handler.
The protocol code is hand-written (`mcp-server/server.js`); the agent only
explained messages. `node mcp-server/check.mjs -- node mcp-server/server.js`
passes 11/11.

## Session 2: schema and sign-in
Gave it `SPEC.md` slice 1. It produced the three tables and a working sign-in on
the first pass, but stored passwords with a plain SHA-256. Told it to use scrypt
with a per-user salt; it did, and moved the check into `src/services/auth.js`.

## Session 3: booking rules
Slice 2. It wrote the rules into the route handler. Asked for the three layers
from `AGENTS.md` and it split them into `routes` / `services` / `data` without
complaint. It also re-invented the six timetable blocks instead of importing
`legacy/slots.js`, because it assumed a folder called `legacy` was dead. Fixed by hand
and written down in `legacy/README.md`.

## Session 4: tests, Docker, CI
Asked for tests that name a rule rather than a function. Twelve tests, green.
The Dockerfile and `ci.yml` were one pass each; the only correction was that it
wanted `npm ci` unconditionally, which fails before the lock file exists.
