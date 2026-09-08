/** HTTP intake: POST /v1/tickets with `Authorization: Bearer <api key>`. */
import type http from 'node:http';
import type { Repo } from '../db/repo.ts';
import type { Priority } from '../domain/ticket.ts';

export type IntakeResult = { status: number; body: unknown };

export async function handleCreateTicket(repo: Repo, req: http.IncomingMessage, rawBody: string): Promise<IntakeResult> {
  const auth = req.headers.authorization ?? '';
  const key = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!key) return { status: 401, body: { error: 'missing bearer api key' } };
  const tenantId = await repo.tenantForApiKey(key);
  if (!tenantId) return { status: 401, body: { error: 'unknown api key' } };
  let parsed: any;
  try { parsed = JSON.parse(rawBody || '{}'); } catch { return { status: 400, body: { error: 'body is not json' } }; }
  const title = String(parsed.title ?? '').trim();
  const body = String(parsed.body ?? '').trim();
  if (!title || !body) return { status: 422, body: { error: 'title and body are required' } };
  const priority = (['p1', 'p2', 'p3', 'p4'] as Priority[]).includes(parsed.priority) ? parsed.priority as Priority : undefined;
  const t = await repo.insertTicket({ tenantId, title: title.slice(0, 200), body: body.slice(0, 20_000), source: 'http', priority, requester: parsed.requester ? String(parsed.requester).slice(0, 200) : undefined, externalId: parsed.externalId ? String(parsed.externalId).slice(0, 200) : undefined });
  if (!t) return { status: 200, body: { duplicate: true } };
  return { status: 201, body: { id: t.id, status: t.status, priority: t.priority } };
}
