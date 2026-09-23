// Reference MCP server for the lecturer's demo. Students write their own.
// JSON-RPC 2.0 over stdio: one JSON object per line in, one per line out.
const fs = require('node:fs');
const path = require('node:path');

const lectures = JSON.parse(fs.readFileSync(path.join(__dirname, 'lectures.json'), 'utf8'));
const log = (...a) => console.error('[server]', ...a); // never stdout: that is the protocol
const send = (msg) => process.stdout.write(JSON.stringify(msg) + '\n');
const ok = (id, result) => send({ jsonrpc: '2.0', id, result });
const fail = (id, code, message) => send({ jsonrpc: '2.0', id, error: { code, message } });
const text = (body, isError = false) => ({ content: [{ type: 'text', text: body }], isError });

const tools = [
  {
    name: 'find_lecture',
    description: 'Look up a lecture of the Web Development course by its number (1 to 10). Returns the title and the topics it covers.',
    inputSchema: { type: 'object', properties: { number: { type: 'integer', minimum: 1, maximum: 10 } }, required: ['number'] },
  },
  {
    name: 'count_lectures',
    description: 'Return how many lectures the course has. Use it when asked about the size or length of the course.',
    inputSchema: { type: 'object', properties: {} },
  },
];

const run = (name, args) => {
  if (name === 'find_lecture') {
    const found = lectures.find((l) => l.number === args?.number);
    if (!found) return text(`There is no lecture ${args?.number}. The course has lectures 1 to ${lectures.length}.`, true);
    return text(`Lecture ${found.number}: ${found.title}. Topics: ${found.topics}`);
  }
  if (name === 'count_lectures') return text(`The course has ${lectures.length} lectures.`);
  return null;
};

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

function handle(line) {
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
      serverInfo: { name: 'course-lectures', version: '1.0.0' },
    });
  }
  if (method === 'notifications/initialized') return; // a notification gets no reply
  if (method === 'tools/list') return ok(id, { tools });
  if (method === 'tools/call') {
    const result = run(params?.name, params?.arguments);
    if (!result) return fail(id, -32602, `Unknown tool: ${params?.name}`);
    return ok(id, result);
  }
  return fail(id, -32601, `Unknown method: ${method}`);
}
