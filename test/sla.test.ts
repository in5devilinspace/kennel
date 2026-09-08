import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTicket } from '../src/domain/ticket.ts';
import { firstResponseDue, isBreached, DEFAULT_POLICY } from '../src/domain/sla.ts';

test('first response due = created + policy minutes for the priority', () => {
  const t = createTicket({ tenantId: 't1', title: 'a', body: 'b', source: 'email', priority: 'p1', now: new Date('2026-09-08T00:00:00Z') });
  const due = firstResponseDue(t, DEFAULT_POLICY);
  assert.equal(due.toISOString(), '2026-09-08T00:30:00Z'.replace('Z', '.000Z'));
});

test('breach is true only after due and only while no human has responded', () => {
  const t = createTicket({ tenantId: 't1', title: 'a', body: 'b', source: 'email', priority: 'p1', now: new Date('2026-09-08T00:00:00Z') });
  assert.equal(isBreached(t, DEFAULT_POLICY, new Date('2026-09-08T00:29:00Z')), false);
  assert.equal(isBreached(t, DEFAULT_POLICY, new Date('2026-09-08T00:31:00Z')), true);
  const answered = { ...t, firstHumanResponseAt: new Date('2026-09-08T00:10:00Z') };
  assert.equal(isBreached(answered, DEFAULT_POLICY, new Date('2026-09-09T00:00:00Z')), false);
});
