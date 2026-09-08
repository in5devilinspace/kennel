/**
 * HTTP surface, Node stdlib only.
 *   GET  /healthz /readyz /metrics
 *   POST /v1/tickets              (Bearer api key)      → intake/http
 *   POST /discord/interactions    (Ed25519-signed)      → intake/discord
 *   GET  /v1/tickets?status=      (Bearer api key)
 * Invariant 5: every handler answers or throws; throws become a counted 500.
 */
import http from 'node:http';
import type { Repo } from '../db/repo.ts';
import { handleCreateTicket } from '../intake/http.ts';
import { handleDiscordInteraction, type DiscordConfig } from '../intake/discord.ts';

export type ServerDeps = { ready: () => boolean; repo?: Repo; discord?: DiscordConfig };

const MAX_BODY = 64 * 1024;

export function createServer(deps: ServerDeps): http.Server {
  const counters = new Map<string, number>();
  const bump = (key: string) => counters.set(key, (counters.get(key) ?? 0) + 1);

  return http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://kennel');
    const path = url.pathname;
    try {
      if (req.method === 'GET' && path === '/healthz') { bump('healthz'); return json(res, 200, { ok: true }); }
      if (req.method === 'GET' && path === '/readyz') { bump('readyz'); return deps.ready() ? json(res, 200, { ready: true }) : json(res, 503, { ready: false }); }
      if (req.method === 'GET' && path === '/metrics') {
        bump('metrics');
        const lines = ['# TYPE kennel_http_requests_total counter'];
        for (const [route, n] of counters) lines.push(`kennel_http_requests_total{route="${route}"} ${n}`);
        res.writeHead(200, { 'content-type': 'text/plain; version=0.0.4' });
        return res.end(lines.join('\n') + '\n');
      }
      if (req.method === 'POST' && path === '/v1/tickets' && deps.repo) {
        bump('tickets_create');
        const body = await readBody(req);
        const r = await handleCreateTicket(deps.repo, req, body);
        return json(res, r.status, r.body);
      }
      if (req.method === 'GET' && path === '/v1/tickets' && deps.repo) {
        bump('tickets_list');
        const key = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '').trim();
        const tenantId = key ? await deps.repo.tenantForApiKey(key) : null;
        if (!tenantId) return json(res, 401, { error: 'unknown api key' });
        const status = url.searchParams.get('status') as any;
        const list = await deps.repo.listTickets(tenantId, status || undefined);
        return json(res, 200, { tickets: list.map(t => ({ id: t.id, title: t.title, status: t.status, priority: t.priority, source: t.source, createdAt: t.createdAt })) });
      }
      if (req.method === 'POST' && path === '/discord/interactions' && deps.repo && deps.discord) {
        bump('discord');
        const body = await readBody(req);
        const r = await handleDiscordInteraction(deps.repo, deps.discord, req.headers, body);
        return json(res, r.status, r.body);
      }
      bump('404');
      return json(res, 404, { error: 'not found' });
    } catch (err) {
      bump('500');
      console.error('[kennel] unhandled', path, err);
      return json(res, 500, { error: 'internal' });
    }
  });
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => { size += c.length; if (size > MAX_BODY) { reject(new Error('body too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function json(res: http.ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

if (import.meta.main) {
  const { loadConfig } = await import('../config.ts');
  const cfg = loadConfig();
  let repo;
  if (cfg.databaseUrl) {
    const { getPool } = await import('../db/pool.ts');
    const { PgRepo } = await import('../db/repo.ts');
    repo = new PgRepo(getPool(cfg.databaseUrl));
  }
  createServer({ ready: () => true, repo, discord: cfg.discord }).listen(cfg.port, () => console.log(`[kennel] api listening on :${cfg.port} db=${cfg.databaseUrl ? 'on' : 'off'} discord=${cfg.discord ? 'on' : 'off'}`));
}
