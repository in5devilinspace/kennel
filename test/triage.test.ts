import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTicket } from '../src/domain/ticket.ts';
import { recordProposal, InvalidProposal } from '../src/domain/triage.ts';

const base = { category: 'infra', priority: 'p2', confidence: 0.82, model: 'openrouter/anthropic/claude-sonnet-5', promptHash: 'sha256:abc', inputsHash: 'sha256:def' } as const;

test('invariant 2: a proposal is stored with model, prompt hash, inputs hash and a timestamp', () => {
  const t = createTicket({ tenantId: 't1', title: 'a', body: 'b', source: 'discord' });
  const t2 = recordProposal(t, base, { kind: 'agent', id: 'triage-1' });
  assert.equal(t2.proposals.length, 1);
  const p = t2.proposals[0];
  assert.equal(p.model, base.model);
  assert.equal(p.promptHash, 'sha256:abc');
  assert.ok(p.at);
  assert.equal(t2.status, 'triaged');
});

test('a proposal without provenance is rejected', () => {
  const t = createTicket({ tenantId: 't1', title: 'a', body: 'b', source: 'discord' });
  assert.throws(() => recordProposal(t, { ...base, model: '' }, { kind: 'agent', id: 'x' }), InvalidProposal);
  assert.throws(() => recordProposal(t, { ...base, promptHash: '' }, { kind: 'agent', id: 'x' }), InvalidProposal);
});

test('a proposal never resolves or closes a ticket, whatever it says', () => {
  const t = createTicket({ tenantId: 't1', title: 'a', body: 'b', source: 'discord' });
  const t2 = recordProposal(t, { ...base, suggestedStatus: 'closed' } as any, { kind: 'agent', id: 'x' });
  assert.equal(t2.status, 'triaged');
});
