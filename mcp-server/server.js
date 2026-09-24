// The MCP server for this project. JSON-RPC 2.0 over stdio: one JSON object per line
// in, one per line out.
//
// It started life in Exercise 1 as a server over a JSON file of lectures. The protocol
// loop below is still that code, almost unchanged — that part is the lesson, and it is
// small. What grew is mcp-server/tools.js, where the tools now reach the real booking
// data through the same services the HTTP API uses.
//
// Start it with:  npm run mcp        (MCP_TOKEN in the environment)
// Check it with:  node mcp-server/check.mjs -- npm run --silent mcp

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { connect, migrate } from '../src/db.js';
import * as auth from '../src/services/auth.js';
import { AppError } from '../src/errors.js';
import { advertise, byName } from './tools.js';

const here = dirname(fileURLToPath(import.meta.url));
const lectures = JSON.parse(readFileSync(join(here, 'lectures.json'), 'utf8'));

const log = (...a) => console.error('[server]', ...a); // never stdout: that is the protocol
const send = (msg) => process.stdout.write(JSON.stringify(msg) + '\n');
const ok = (id, result) => send({ jsonrpc: '2.0', id, result });
const fail = (id, code, message) => send({ jsonrpc: '2.0', id, error: { code, message } });
const text = (body, isError = false) => ({ content: [{ type: 'text', text: body }], isError });

const db = connect();
migrate(db);

// MCP_TOKEN is an ordinary session token, the same kind the browser gets from
// POST /api/auth/login. So the agent acts as that person and may do what they may do.
// No token is fine: the tools that need nobody in particular still work.
const user = auth.currentUser(db, process.env.MCP_TOKEN);
if (process.env.MCP_TOKEN && !user) log('MCP_TOKEN is not a live session; only the public tools will work');

let buffer = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  let i;
  while ((i = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, i).trim();
    buffer = buffer.slice(i + 1);
    if (line) handle(line);
  }
});

async function handle(line) {
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return fail(null, -32700, 'Parse error');
  }
  const { id, method, params } = msg;
  log('received', method);

  if (method === 'initialize') {
    return ok(id, {
      protocolVersion: params?.protocolVersion ?? '2025-11-25',
      capabilities: { tools: {} },
      serverInfo: { name: 'lab-booking', version: '1.0.0' },
    });
  }
  if (method === 'notifications/initialized') return; // a notification gets no reply
  if (method === 'tools/list') return ok(id, { tools: advertise() });
  if (method === 'tools/call') {
    // Two different failures, answered two different ways. A tool that does not exist
    // is the client getting the protocol wrong, so it is a JSON-RPC error. A rule
    // saying no is a normal result the model should read and work around, so it is a
    // result with isError. Collapsing them would leave the model nothing to act on.
    if (!byName(params?.name)) return fail(id, -32602, `Unknown tool: ${params?.name}`);
    return ok(id, await call(params.name, params?.arguments));
  }
  return fail(id, -32601, `Unknown method: ${method}`);
}

async function call(name, args) {
  const tool = byName(name);
  if (tool.signedIn && !user) return text('This tool acts on somebody\'s behalf. Set MCP_TOKEN to a live session token.', true);

  try {
    return await tool.run({ db, user, lectures }, args ?? {});
  } catch (error) {
    // A rule saying no is a normal result, not a protocol failure: the model should
    // read it and try something else, which it cannot do with a JSON-RPC error.
    if (error instanceof AppError) return text(error.message, true);
    log('tool failed', name, error);
    return text('Something went wrong running that tool.', true);
  }
}
