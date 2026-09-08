/**
 * Repository interface + Postgres implementation + in-memory implementation.
 * Domain objects stay pure; this layer only persists them.
 */
import type pg from 'pg';
import { createHash } from 'node:crypto';
import { withTenant } from './pool.ts';
import type { Actor, Priority, Source, Ticket, TicketStatus, TriageProposal } from '../domain/ticket.ts';

export type NewTicket = { tenantId: string; title: string; body: string; source: Source; priority?: Priority; requester?: string; externalId?: string };

export interface Repo {
  createTenant(slug: string, name: string): Promise<{ id: string; slug: string }>;
  createApiKey(tenantId: string, label: string): Promise<{ key: string }>;
  tenantForApiKey(key: string): Promise<string | null>;
  insertTicket(t: NewTicket): Promise<Ticket | null>;        // null = duplicate externalId
  getTicket(tenantId: string, id: string): Promise<Ticket | null>;
  listTickets(tenantId: string, status?: TicketStatus): Promise<Ticket[]>;
  saveTransition(tenantId: string, ticketId: string, from: TicketStatus | null, to: TicketStatus, actor: Actor): Promise<void>;
  saveProposal(tenantId: string, ticketId: string, p: TriageProposal): Promise<void>;
}

export const hashKey = (key: string) => 'sha256:' + createHash('sha256').update(key).digest('hex');

// ---------------------------------------------------------------- Postgres
export class PgRepo implements Repo {
  private db: pg.Pool;
  constructor(db: pg.Pool) { this.db = db; }

  async createTenant(slug: string, name: string) {
    const r = await this.db.query('insert into tenants (slug, name) values ($1,$2) returning id, slug', [slug, name]);
    return r.rows[0];
  }
  async createApiKey(tenantId: string, label: string) {
    const key = 'kn_' + createHash('sha256').update(crypto.randomUUID()).digest('base64url').slice(0, 40);
    await this.db.query('insert into api_keys (tenant_id, label, key_hash) values ($1,$2,$3)', [tenantId, label, hashKey(key)]);
    return { key };
  }
  async tenantForApiKey(key: string) {
    const r = await this.db.query('select tenant_id from api_keys where key_hash = $1 and revoked_at is null', [hashKey(key)]);
    return r.rows[0]?.tenant_id ?? null;
  }
  async insertTicket(t: NewTicket) {
    return withTenant(this.db, t.tenantId, async c => {
      const r = await c.query(
        `insert into tickets (tenant_id, title, body, source, priority, requester, external_id)
         values ($1,$2,$3,$4,$5,$6,$7) on conflict do nothing returning *`,
        [t.tenantId, t.title, t.body, t.source, t.priority ?? 'p3', t.requester ?? null, t.externalId ?? null]);
      if (!r.rows[0]) return null;
      await c.query(`insert into ticket_transitions (tenant_id, ticket_id, from_status, to_status, actor_kind, actor_id) values ($1,$2,null,'new','human','system')`, [t.tenantId, r.rows[0].id]);
      return rowToTicket(r.rows[0], [], []);
    });
  }
  async getTicket(tenantId: string, id: string) {
    return withTenant(this.db, tenantId, async c => {
      const r = await c.query('select * from tickets where id = $1', [id]);
      if (!r.rows[0]) return null;
      const h = await c.query('select * from ticket_transitions where ticket_id = $1 order by id', [id]);
      const p = await c.query('select * from triage_proposals where ticket_id = $1 order by id', [id]);
      return rowToTicket(r.rows[0], h.rows, p.rows);
    });
  }
  async listTickets(tenantId: string, status?: TicketStatus) {
    return withTenant(this.db, tenantId, async c => {
      const r = status
        ? await c.query('select * from tickets where status = $1 order by created_at', [status])
        : await c.query('select * from tickets order by created_at');
      return r.rows.map(row => rowToTicket(row, [], []));
    });
  }
  async saveTransition(tenantId: string, ticketId: string, from: TicketStatus | null, to: TicketStatus, actor: Actor) {
    await withTenant(this.db, tenantId, async c => {
      await c.query('insert into ticket_transitions (tenant_id, ticket_id, from_status, to_status, actor_kind, actor_id) values ($1,$2,$3,$4,$5,$6)', [tenantId, ticketId, from, to, actor.kind, actor.id]);
      await c.query('update tickets set status = $2, updated_at = now() where id = $1', [ticketId, to]);
    });
  }
  async saveProposal(tenantId: string, ticketId: string, p: TriageProposal) {
    await withTenant(this.db, tenantId, async c => {
      await c.query(
        `insert into triage_proposals (tenant_id, ticket_id, category, priority, runbook_id, confidence, model, prompt_hash, inputs_hash, eval_score, actor_id, at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [tenantId, ticketId, p.category, p.priority, p.runbookId ?? null, p.confidence, p.model, p.promptHash, p.inputsHash, p.evalScore ?? null, p.actor.id, p.at]);
    });
  }
}

function rowToTicket(r: any, h: any[], p: any[]): Ticket {
  return {
    id: r.id, tenantId: r.tenant_id, title: r.title, body: r.body, source: r.source, priority: r.priority,
    status: r.status, createdAt: new Date(r.created_at),
    firstHumanResponseAt: r.first_human_response_at ? new Date(r.first_human_response_at) : undefined,
    history: h.map(x => ({ from: x.from_status, to: x.to_status, actor: { kind: x.actor_kind, id: x.actor_id }, at: new Date(x.at) })),
    proposals: p.map(x => ({ category: x.category, priority: x.priority, runbookId: x.runbook_id ?? undefined, confidence: Number(x.confidence), model: x.model, promptHash: x.prompt_hash, inputsHash: x.inputs_hash, evalScore: x.eval_score == null ? undefined : Number(x.eval_score), at: new Date(x.at), actor: { kind: 'agent', id: x.actor_id } })),
  };
}

// ---------------------------------------------------------------- in-memory (tests, evals)
export class MemRepo implements Repo {
  tenants = new Map<string, { id: string; slug: string }>();
  keys = new Map<string, string>();
  tickets = new Map<string, Ticket>();
  async createTenant(slug: string, name: string) { const t = { id: crypto.randomUUID(), slug }; this.tenants.set(t.id, t); return t; }
  async createApiKey(tenantId: string, _label = "default") { const key = 'kn_' + crypto.randomUUID(); this.keys.set(hashKey(key), tenantId); return { key }; }
  async tenantForApiKey(key: string) { return this.keys.get(hashKey(key)) ?? null; }
  async insertTicket(t: NewTicket) {
    if (t.externalId && [...this.tickets.values()].some(x => x.tenantId === t.tenantId && x.source === t.source && (x as any).externalId === t.externalId)) return null;
    const id = crypto.randomUUID(); const now = new Date();
    const ticket: Ticket & { externalId?: string } = { id, tenantId: t.tenantId, title: t.title, body: t.body, source: t.source, priority: t.priority ?? 'p3', status: 'new', createdAt: now, history: [{ from: null, to: 'new', actor: { kind: 'human', id: 'system' }, at: now }], proposals: [], externalId: t.externalId };
    this.tickets.set(id, ticket); return ticket;
  }
  async getTicket(tenantId: string, id: string) { const t = this.tickets.get(id); return t && t.tenantId === tenantId ? t : null; }
  async listTickets(tenantId: string, status?: TicketStatus) { return [...this.tickets.values()].filter(t => t.tenantId === tenantId && (!status || t.status === status)); }
  async saveTransition(tenantId: string, ticketId: string, from: TicketStatus | null, to: TicketStatus, actor: Actor) {
    const t = await this.getTicket(tenantId, ticketId); if (!t) throw new Error('no ticket');
    this.tickets.set(ticketId, { ...t, status: to, history: [...t.history, { from, to, actor, at: new Date() }] });
  }
  async saveProposal(tenantId: string, ticketId: string, p: TriageProposal) {
    const t = await this.getTicket(tenantId, ticketId); if (!t) throw new Error('no ticket');
    this.tickets.set(ticketId, { ...t, proposals: [...t.proposals, p] });
  }
}
