# Lab booking

The demo project. Written the way the exercise asks: non-goals first.

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
- Small enough to read out loud: under 700 lines of source.

## Acceptance criteria

### Slice 1: sign in and see my bookings
- Wrong password gives 401 and the same message as an unknown e-mail.
- After signing in, `GET /api/bookings` lists what I own and what I was added to.
- The session survives a page reload and ends on sign-out.

### Slice 2: book and cancel
- A booking needs an existing, active workstation, a date that is not past, and a block 1–6.
- A second booking of the same workstation, day and block is refused with 409 and a sentence naming the workstation.
- A fourth upcoming booking for the same person is refused with 409.
- More people than seats is refused with 400.
- Cancelling frees the slot: the same workstation, day and block can be booked again right after.
- A block that has already started cannot be cancelled.

### Slice 3: the day view
- `GET /api/bookings/day?date=` lists every booking that day, across labs.
- A date that is not `YYYY-MM-DD` gives 400.

## Spec vs result

The agent got slices 1 and 2 nearly right on the first pass. Two things it did
not do until it was told:

1. It put the "not more than three upcoming" count in the route handler. Moved
   into `src/services/bookings.js`, where the other rules live.
2. It invented its own list of time blocks instead of importing `legacy/slots.js`,
   because the folder name made it assume the file was dead. That is the reason
   `legacy/README.md` now says out loud that the module is still in use.

Criterion "a block that has already started cannot be cancelled" is in the code
but has no test: it needs a clock the test can move, and that was left for later.
