import assert from 'node:assert/strict';
import { once } from 'node:events';
import express from 'express';
import { after, test } from 'node:test';
import { localWebCors } from '../src/server/cors.ts';

const app = express();
app.use(localWebCors);
app.post('/api/auth/login', (_req, res) => res.json({ success: true }));
app.all('/api/*', (_req, res) => res.sendStatus(404));

const server = app.listen(0);
await once(server, 'listening');
const address = server.address();
assert(address && typeof address !== 'string');
const baseUrl = `http://127.0.0.1:${address.port}`;

after(async () => {
  server.close();
  await once(server, 'close');
});

test('allows Flutter web localhost preflight for JSON and authorization headers', async () => {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'OPTIONS',
    headers: {
      Origin: 'http://localhost:22747',
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'content-type,authorization',
    },
  });

  assert.equal(response.status, 204);
  assert.equal(response.headers.get('access-control-allow-origin'), 'http://localhost:22747');
  assert.match(response.headers.get('access-control-allow-methods') ?? '', /\bPOST\b/);
  assert.match(response.headers.get('access-control-allow-headers') ?? '', /Content-Type/i);
  assert.match(response.headers.get('access-control-allow-headers') ?? '', /Authorization/i);
});

test('adds CORS headers to requests from the allowed local web origin', async () => {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: {
      Origin: 'http://localhost:22747',
      'Content-Type': 'application/json',
    },
    body: '{}',
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('access-control-allow-origin'), 'http://localhost:22747');
});

test('does not allow an unrelated origin', async () => {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'OPTIONS',
    headers: { Origin: 'https://attacker.example' },
  });

  assert.equal(response.status, 404);
  assert.equal(response.headers.get('access-control-allow-origin'), null);
});
