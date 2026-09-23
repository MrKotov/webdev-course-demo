// The only module in the app that knows which database engine we use.
//
// Everything above this file talks to the small interface below (all/get/run/tx),
// so swapping SQLite for Postgres means rewriting this file and the placeholder
// style in src/data/*.js, and nothing else. That is the point of the layer:
// node:sqlite is synchronous, so all/get/run return values directly; a Postgres
// version would return promises and the data layer would gain `await`.

import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, '..', 'migrations');

function fileFromUrl(url) {
  const path = url.startsWith('sqlite:') ? url.slice('sqlite:'.length) : url;
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  return path;
}

export function connect(url = config.databaseUrl) {
  const handle = new DatabaseSync(fileFromUrl(url));
  handle.exec('PRAGMA foreign_keys = ON');

  return {
    all: (sql, ...params) => handle.prepare(sql).all(...params),
    get: (sql, ...params) => handle.prepare(sql).get(...params),
    run: (sql, ...params) => handle.prepare(sql).run(...params),
    exec: (sql) => handle.exec(sql),
    /** Run fn inside a transaction; anything thrown rolls the whole thing back. */
    tx(fn) {
      handle.exec('BEGIN');
      try {
        const out = fn();
        handle.exec('COMMIT');
        return out;
      } catch (err) {
        handle.exec('ROLLBACK');
        throw err;
      }
    },
    close: () => handle.close(),
  };
}

/** Apply every migration file that has not run yet. Safe to call on every boot. */
export function migrate(db) {
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');
  const done = new Set(db.all('SELECT name FROM schema_migrations').map((r) => r.name));
  const applied = [];

  for (const name of readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort()) {
    if (done.has(name)) continue;
    db.tx(() => {
      db.exec(readFileSync(join(migrationsDir, name), 'utf8'));
      db.run("INSERT INTO schema_migrations (name, applied_at) VALUES (?, datetime('now'))", name);
    });
    applied.push(name);
  }
  return applied;
}

/** A fresh, fully migrated in-memory database. Used by the tests. */
export function connectForTests() {
  const db = connect(':memory:');
  migrate(db);
  return db;
}

// `npm run migrate` runs this file directly.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const db = connect();
  const applied = migrate(db);
  console.log(applied.length ? `applied: ${applied.join(', ')}` : 'already up to date');
  db.close();
}
