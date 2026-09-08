/**
 * Discord intake via the Interactions endpoint (HTTPS, no gateway connection).
 * Discord signs every request with Ed25519; we verify with node:crypto and answer
 * PING with PONG. The `/ticket` slash command creates a ticket; the interaction id is
 * the dedupe key. Stdlib only.
 */
import { createPublicKey, verify } from 'node:crypto';
import type { Repo } from '../db/repo.ts';

export type DiscordConfig = { publicKeyHex: string; tenantByGuild: Record<string, string> };

export function verifyDiscordSignature(publicKeyHex: string, signatureHex: string, timestamp: string, rawBody: string): boolean {
  try {
    const key = createPublicKey({ key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), Buffer.from(publicKeyHex, 'hex')]), format: 'der', type: 'spki' });
    return verify(null, Buffer.from(timestamp + rawBody), key, Buffer.from(signatureHex, 'hex'));
  } catch { return false; }
}

export type DiscordResult = { status: number; body: unknown };

export async function handleDiscordInteraction(repo: Repo, cfg: DiscordConfig, headers: Record<string, string | string[] | undefined>, rawBody: string): Promise<DiscordResult> {
  const sig = String(headers['x-signature-ed25519'] ?? '');
  const ts = String(headers['x-signature-timestamp'] ?? '');
  if (!sig || !ts || !verifyDiscordSignature(cfg.publicKeyHex, sig, ts, rawBody)) return { status: 401, body: { error: 'bad signature' } };
  const i = JSON.parse(rawBody);
  if (i.type === 1) return { status: 200, body: { type: 1 } };                       // PING → PONG
  if (i.type !== 2 || i.data?.name !== 'ticket') return { status: 200, body: { type: 4, data: { content: 'Unknown command.', flags: 64 } } };
  const tenantId = cfg.tenantByGuild[i.guild_id];
  if (!tenantId) return { status: 200, body: { type: 4, data: { content: 'This server is not linked to a Kennel tenant.', flags: 64 } } };
  const opts = Object.fromEntries((i.data.options ?? []).map((o: any) => [o.name, o.value]));
  const title = String(opts.title ?? '').trim().slice(0, 200);
  const body = String(opts.body ?? opts.details ?? title).trim().slice(0, 20_000);
  if (!title) return { status: 200, body: { type: 4, data: { content: 'Give the ticket a title.', flags: 64 } } };
  const user = i.member?.user?.id ?? i.user?.id;
  const t = await repo.insertTicket({ tenantId, title, body, source: 'discord', requester: user ? `discord:${user}` : undefined, externalId: `interaction:${i.id}` });
  const msg = t ? `Ticket **${t.id.slice(0, 8)}** filed (${t.priority}). A human will confirm the triage.` : 'That interaction was already filed.';
  return { status: 200, body: { type: 4, data: { content: msg } } };
}
