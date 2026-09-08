/** Create a tenant and one API key. Prints the key once; it is never stored in clear. */
import { getPool, closePool } from './pool.ts';
import { PgRepo } from './repo.ts';

const [slug, name, label = 'default'] = process.argv.slice(2);
if (!slug || !name) { console.error('usage: node src/db/seed.ts <slug> "<name>" [key label]'); process.exit(1); }
const repo = new PgRepo(getPool());
const t = await repo.createTenant(slug, name);
const { key } = await repo.createApiKey(t.id, label);
console.log(JSON.stringify({ tenantId: t.id, slug: t.slug, apiKey: key, note: 'store the key in your secret manager; Kennel keeps only its hash' }, null, 2));
await closePool();
