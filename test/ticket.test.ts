import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTicket, transition, InvariantViolation } from '../src/domain/ticket.ts';

const human = { kind: 'human', id: 'matt' } as const;
const agent = { kind: 'agent', id: 'triage-1' } as const;

test('a new ticket starts in new with an empty history', () => {
  const t = createTicket({ tenantId: 't1', title: 'Onyx voice room 502', body: 'x', source: 'discord' });
  assert.equal(t.status, 'new');
  assert.equal(t.history.length, 1);
  assert.equal(t.history[0].to, 'new');
});

test('invariant 1: an agent can move a ticket to triaged but never to resolved or closed', () => {
  const t = createTicket({ tenantId: 't1', title: 'a', body: 'b', source: 'http' });
  const t2 = transition(t, 'triaged', agent);
  assert.equal(t2.status, 'triaged');
  assert.throws(() => transition(t2, 'resolved', agent), InvariantViolation);
  assert.throws(() => transition(t2, 'closed', agent), InvariantViolation);
});

test('a human can resolve and close, and every step is recorded with the actor', () => {
  let t = createTicket({ tenantId: 't1', title: 'a', body: 'b', source: 'email' });
  t = transition(t, 'triaged', agent);
  t = transition(t, 'in_progress', human);
  t = transition(t, 'resolved', human);
  t = transition(t, 'closed', human);
  assert.equal(t.status, 'closed');
  assert.deepEqual(t.history.map(h => h.to), ['new', 'triaged', 'in_progress', 'resolved', 'closed']);
  assert.equal(t.history.at(-1)?.actor.id, 'matt');
});

test('illegal transitions are rejected for everyone', () => {
  const t = createTicket({ tenantId: 't1', title: 'a', body: 'b', source: 'email' });
  assert.throws(() => transition(t, 'closed', human), InvariantViolation);
});

test('transition never mutates its input', () => {
  const t = createTicket({ tenantId: 't1', title: 'a', body: 'b', source: 'email' });
  transition(t, 'triaged', agent);
  assert.equal(t.status, 'new');
});
