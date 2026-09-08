import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { MemRepo } from '../src/db/repo.ts';
import { triageTicket, triageNewTickets, TRIAGE_ACTOR } from '../src/triage/service.ts';
import { stubChat } from '../src/triage/model.ts';
import { buildPrompt, parseTriageJson } from '../src/triage/prompt.ts';
import { runEval, type Fixture } from '../src/triage/eval.ts';

test('prompt hashes are stable for the same inputs and differ for different tickets', () => {
  const a = buildPrompt({ title: 'a', body: 'b', source: 'http' }, []);
  const b = buildPrompt({ title: 'a', body: 'b', source: 'http' }, []);
  const c = buildPrompt({ title: 'a', body: 'c', source: 'http' }, []);
  assert.equal(a.promptHash, b.promptHash); assert.equal(a.inputsHash, b.inputsHash); assert.notEqual(a.inputsHash, c.inputsHash);
});

test('parseTriageJson rejects unknown categories and clamps confidence', () => {
  assert.equal(parseTriageJson('{"category":"nope","priority":"p1"}'), null);
  assert.equal(parseTriageJson('junk'), null);
  assert.equal(parseTriageJson('text {"category":"infra","priority":"p1","confidence":9}')?.confidence, 1);
});

test('triageTicket records a proposal with provenance and moves new -> triaged, never further', async () => {
  const repo = new MemRepo(); const t = await repo.createTenant('onyx', 'Onyx');
  const ticket = (await repo.insertTicket({ tenantId: t.id, title: 'Voice room 502, production down', body: 'all users', source: 'discord' }))!;
  const out = await triageTicket(repo, stubChat, ticket);
  assert.equal(out.status, 'triaged');
  assert.equal(out.proposals[0].model, 'stub/keywords');
  assert.match(out.proposals[0].promptHash, /^sha256:/);
  assert.equal(out.proposals[0].actor.id, TRIAGE_ACTOR.id);
  const stored = (await repo.getTicket(t.id, ticket.id))!;
  assert.equal(stored.status, 'triaged'); assert.equal(stored.proposals.length, 1);
});

test('a model that answers garbage fails loudly and leaves the ticket untouched (invariant 5)', async () => {
  const repo = new MemRepo(); const t = await repo.createTenant('onyx', 'Onyx');
  const ticket = (await repo.insertTicket({ tenantId: t.id, title: 'x', body: 'y', source: 'http' }))!;
  await assert.rejects(triageTicket(repo, async () => ({ text: 'lol', model: 'bad' }), ticket), /no valid JSON/);
  assert.equal((await repo.getTicket(t.id, ticket.id))!.status, 'new');
  const r = await triageNewTickets(repo, async () => ({ text: 'lol', model: 'bad' }), t.id);
  assert.deepEqual(r, { triaged: 0, failed: 1 });
});

test('eval harness scores the stub above chance on the fixture set', async () => {
  const fixtures: Fixture[] = JSON.parse(await readFile(new URL('./fixtures/tickets.json', import.meta.url), 'utf8'));
  const r = await runEval(fixtures, stubChat);
  assert.equal(r.n, 10); assert.equal(r.invalid, 0);
  assert.ok(r.categoryAccuracy >= 0.6, `category accuracy ${r.categoryAccuracy}`);
  assert.ok(r.priorityAccuracy >= 0.5, `priority accuracy ${r.priorityAccuracy}`);
  assert.ok(r.escalation.recall >= 0.5);
});
