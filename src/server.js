// Entry point. Start reading the code here.
//
//   src/server.js    boots: connect, migrate, listen
//   src/routes/      HTTP: match a path, check the session, format the answer
//   src/services/    the rules: what a booking is allowed to be
//   src/data/        SQL, one module per table group
//   src/db.js        the only file that names the database engine

import { createServer } from 'node:http';
import { config } from './config.js';
import { connect, migrate } from './db.js';
import { createHandler } from './routes/index.js';

const db = connect();
const applied = migrate(db);
if (applied.length) console.log(`migrations applied: ${applied.join(', ')}`);

const server = createServer(createHandler(db));
server.listen(config.port, () => {
  console.log(`lab-booking listening on http://localhost:${config.port}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(() => {
      db.close();
      process.exit(0);
    });
  });
}
