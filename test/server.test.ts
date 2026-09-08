import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../src/api/server.ts';

test('healthz and readyz answer, metrics is plain text', async () => {
  const srv = createServer({ ready: () => true });
  await new Promise<void>(r => srv.listen(0, r));
  const port = (srv.address() as any).port;
  const h = await fetch(`http://127.0.0.1:${port}/healthz`);
  assert.equal(h.status, 200);
  const r = await fetch(`http://127.0.0.1:${port}/readyz`);
  assert.equal(r.status, 200);
  const m = await fetch(`http://127.0.0.1:${port}/metrics`);
  assert.equal(m.status, 200);
  assert.match(await m.text(), /kennel_http_requests_total/);
  const nf = await fetch(`http://127.0.0.1:${port}/nope`);
  assert.equal(nf.status, 404);
  await new Promise<void>(r => srv.close(() => r()));
});

test('readyz is 503 when the readiness probe says no', async () => {
  const srv = createServer({ ready: () => false });
  await new Promise<void>(r => srv.listen(0, r));
  const port = (srv.address() as any).port;
  const r = await fetch(`http://127.0.0.1:${port}/readyz`);
  assert.equal(r.status, 503);
  await new Promise<void>(r => srv.close(() => r()));
});
