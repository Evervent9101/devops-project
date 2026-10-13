const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { createApp } = require('../src/app');

let server;
let base;

before(async () => {
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => server.close());

test('GET /api/health returns ok', async () => {
  const res = await fetch(`${base}/api/health`);
  assert.strictEqual(res.status, 200);
  assert.strictEqual((await res.json()).status, 'ok');
});

test('POST /api/items creates an item', async () => {
  const res = await fetch(`${base}/api/items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'write tests' }),
  });
  assert.strictEqual(res.status, 201);
  const item = await res.json();
  assert.strictEqual(item.name, 'write tests');
});

test('POST /api/items rejects empty name', async () => {
  const res = await fetch(`${base}/api/items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: '' }),
  });
  assert.strictEqual(res.status, 400);
});

test('GET /metrics exposes prometheus metrics', async () => {
  await fetch(`${base}/api/health`);
  const res = await fetch(`${base}/metrics`);
  const text = await res.text();
  assert.strictEqual(res.status, 200);
  assert.match(text, /http_request_duration_seconds/);
});
