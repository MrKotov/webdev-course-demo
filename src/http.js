// The thin HTTP layer: read a body, write a response, read a cookie, serve a file.
// Plain node:http, no framework. Nothing here knows about bookings.

import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const webDir = join(dirname(fileURLToPath(import.meta.url)), 'web');
const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript' };

export function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(payload);
}

export async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 64 * 1024) throw new Error('Body too large');
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new Error('Body is not valid JSON');
  }
}

export function readCookie(req, name) {
  const header = req.headers.cookie ?? '';
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}

export function setCookie(res, name, value, { maxAge, sameSite = 'Strict' } = {}) {
  const bits = [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'HttpOnly', `SameSite=${sameSite}`];
  if (maxAge !== undefined) bits.push(`Max-Age=${maxAge}`);
  appendCookie(res, bits.join('; '));
}

/** Add a cookie without dropping one that was already set on this response. */
function appendCookie(res, value) {
  const existing = res.getHeader('set-cookie');
  res.setHeader('set-cookie', existing ? [].concat(existing, value) : value);
}

/** 302 somewhere else. Used by the OAuth flow, which is a browser redirect, not JSON. */
export function redirect(res, location) {
  res.writeHead(302, { location });
  res.end();
}

/** Serve src/web/<file>. Returns false when there is nothing to serve. */
export async function serveStatic(res, pathname) {
  const rel = normalize(pathname === '/' ? '/index.html' : pathname).replace(/^(\.\.[/\\])+/, '');
  try {
    const body = await readFile(join(webDir, rel));
    res.writeHead(200, { 'content-type': TYPES[extname(rel)] ?? 'application/octet-stream' });
    res.end(body);
    return true;
  } catch {
    return false;
  }
}
