/**
 * Minimal HTTP surface: health, readiness, metrics. Node stdlib only.
 * Invariant 5: no silent failures. Every handler either answers or throws; the
 * top-level handler converts throws into a 500 and a counted error.
 */
import http from 'node:http';

export type ServerDeps = { ready: () => boolean };

export function createServer(deps: ServerDeps): http.Server {
  const counters = new Map<string, number>();
  const bump = (key: string) => counters.set(key, (counters.get(key) ?? 0) + 1);

  return http.createServer((req, res) => {
    const path = new URL(req.url ?? '/', 'http://kennel').pathname;
    try {
      if (path === '/healthz') { bump('healthz'); return json(res, 200, { ok: true }); }
      if (path === '/readyz') { bump('readyz'); return deps.ready() ? json(res, 200, { ready: true }) : json(res, 503, { ready: false }); }
      if (path === '/metrics') {
        bump('metrics');
        const lines = ['# TYPE kennel_http_requests_total counter'];
        for (const [route, n] of counters) lines.push(`kennel_http_requests_total{route="${route}"} ${n}`);
        res.writeHead(200, { 'content-type': 'text/plain; version=0.0.4' });
        return res.end(lines.join('\n') + '\n');
      }
      bump('404');
      return json(res, 404, { error: 'not found' });
    } catch (err) {
      bump('500');
      console.error('[kennel] unhandled', err);
      return json(res, 500, { error: 'internal' });
    }
  });
}

function json(res: http.ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

if (import.meta.main) {
  const port = Number(process.env.PORT ?? 8080);
  createServer({ ready: () => true }).listen(port, () => console.log(`[kennel] api listening on :${port}`));
}
