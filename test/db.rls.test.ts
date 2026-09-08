import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getPool, closePool, withTenant } from '../src/db/pool.ts';
import { migrate } from '../src/db/migrate.ts';
import { PgRepo } from '../src/db/repo.ts';

const url = process.env.DATABASE_URL;
const skip = url ? false : 'DATABASE_URL not set';

test('migrations apply and are idempotent', { skip }, async () => {
  await migrate(url);
  const again = await migrate(url);
  assert.deepEqual(again, []);
});

test('invariant 3: a tenant session cannot see another tenant\'s tickets', { skip }, async () => {
  const db = getPool(url);
  const repo = new PgRepo(db);
  const a = await repo.createTenant('rls-a-' + Date.now(), 'A');
  const b = await repo.createTenant('rls-b-' + Date.now(), 'B');
  const ta = await repo.insertTicket({ tenantId: a.id, title: 'A only', body: 'x', source: 'http' });
  assert.ok(ta);
  const seenByB = await repo.listTickets(b.id);
  assert.equal(seenByB.some(t => t.id === ta!.id), false);
  assert.equal(await repo.getTicket(b.id, ta!.id), null);
  // Raw query under tenant B, no app filter at all: still nothing.
  const raw = await withTenant(db, b.id, c => c.query('select count(*)::int as n from tickets where id = $1', [ta!.id]));
  assert.equal(raw.rows[0].n, 0);
});

test('invariant 1 in the database: an agent transition to closed is rejected', { skip }, async () => {
  const db = getPool(url);
  const repo = new PgRepo(db);
  const a = await repo.createTenant('rls-c-' + Date.now(), 'C');
  const t = await repo.insertTicket({ tenantId: a.id, title: 't', body: 'x', source: 'http' });
  await assert.rejects(repo.saveTransition(a.id, t!.id, 'new', 'closed', { kind: 'agent', id: 'bot' }), /agent_never_disposes/);
});

test('invariant 2 in the database: a proposal without a model is rejected', { skip }, async () => {
  const db = getPool(url);
  const repo = new PgRepo(db);
  const a = await repo.createTenant('rls-d-' + Date.now(), 'D');
  const t = await repo.insertTicket({ tenantId: a.id, title: 't', body: 'x', source: 'http' });
  await assert.rejects(repo.saveProposal(a.id, t!.id, { category: 'c', priority: 'p3', confidence: 0.5, model: '', promptHash: 'h', inputsHash: 'i', at: new Date(), actor: { kind: 'agent', id: 'bot' } }), /model|check/);
});

test('dedupe: the same external id never creates two tickets', { skip }, async () => {
  const repo = new PgRepo(getPool(url));
  const a = await repo.createTenant('rls-e-' + Date.now(), 'E');
  const first = await repo.insertTicket({ tenantId: a.id, title: 't', body: 'x', source: 'discord', externalId: 'msg-1' });
  const second = await repo.insertTicket({ tenantId: a.id, title: 't', body: 'x', source: 'discord', externalId: 'msg-1' });
  assert.ok(first); assert.equal(second, null);
});

test('api key round-trip', { skip }, async () => {
  const repo = new PgRepo(getPool(url));
  const a = await repo.createTenant('rls-f-' + Date.now(), 'F');
  const { key } = await repo.createApiKey(a.id, 'test');
  assert.equal(await repo.tenantForApiKey(key), a.id);
  assert.equal(await repo.tenantForApiKey('kn_nope'), null);
  await closePool();
});
