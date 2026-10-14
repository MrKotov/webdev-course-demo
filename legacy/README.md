# legacy/

What survived from the timetable tool this app replaced.

`slots.js` is the faculty's fixed timetable grid. It is imported by
`src/services/bookings.js` and by the tests, so it is part of the running app,
not an archive. Changing the six blocks changes what every booking means, so
treat it as reference data with a function around it.

Nothing else from the old tool was kept.
