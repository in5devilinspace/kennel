import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../src/api/server.ts';
import { MemRepo } from '../src/db/repo.ts';

async function listen(srv: ReturnType<typeof createServer>) { await new Promise<void>(r => srv.listen(0, r)); return (srv.address() as any).port as number; }

test('healthz, readyz, metrics, 404', async () => {
  const srv = createServer({ ready: () => true });
  const port = await listen(srv);
  assert.equal((await fetch(`http://127.0.0.1:${port}/healthz`)).status, 200);
  assert.equal((await fetch(`http://127.0.0.1:${port}/readyz`)).status, 200);
  const m = await fetch(`http://127.0.0.1:${port}/metrics`);
  assert.match(await m.text(), /kennel_http_requests_total/);
  assert.equal((await fetch(`http://127.0.0.1:${port}/nope`)).status, 404);
  await new Promise<void>(r => srv.close(() => r()));
});

test('readyz is 503 when not ready', async () => {
  const srv = createServer({ ready: () => false });
  const port = await listen(srv);
  assert.equal((await fetch(`http://127.0.0.1:${port}/readyz`)).status, 503);
  await new Promise<void>(r => srv.close(() => r()));
});

test('POST then GET /v1/tickets over HTTP with an api key', async () => {
  const repo = new MemRepo(); const t = await repo.createTenant('onyx', 'Onyx'); const { key } = await repo.createApiKey(t.id, 'ci');
  const srv = createServer({ ready: () => true, repo });
  const port = await listen(srv);
  const c = await fetch(`http://127.0.0.1:${port}/v1/tickets`, { method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' }, body: JSON.stringify({ title: 'Disk full', body: 'worker node' }) });
  assert.equal(c.status, 201);
  const l = await fetch(`http://127.0.0.1:${port}/v1/tickets?status=new`, { headers: { authorization: `Bearer ${key}` } });
  const j: any = await l.json();
  assert.equal(j.tickets.length, 1); assert.equal(j.tickets[0].title, 'Disk full');
  assert.equal((await fetch(`http://127.0.0.1:${port}/v1/tickets`, { headers: {} })).status, 401);
  await new Promise<void>(r => srv.close(() => r()));
});
