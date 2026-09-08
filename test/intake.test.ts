import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { mkdtemp, writeFile, mkdir, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { MemRepo } from '../src/db/repo.ts';
import { handleCreateTicket } from '../src/intake/http.ts';
import { handleDiscordInteraction, verifyDiscordSignature } from '../src/intake/discord.ts';
import { parseEml, pollMaildir } from '../src/intake/maildir.ts';

const fakeReq = (auth?: string) => ({ headers: auth ? { authorization: auth } : {} }) as any;

test('http intake: bearer key maps to tenant, validates body, dedupes on externalId', async () => {
  const repo = new MemRepo();
  const t = await repo.createTenant('onyx', 'Onyx');
  const { key } = await repo.createApiKey(t.id, 'ci');
  assert.equal((await handleCreateTicket(repo, fakeReq(), '{}')).status, 401);
  assert.equal((await handleCreateTicket(repo, fakeReq('Bearer kn_bad'), '{}')).status, 401);
  assert.equal((await handleCreateTicket(repo, fakeReq(`Bearer ${key}`), 'nope')).status, 400);
  assert.equal((await handleCreateTicket(repo, fakeReq(`Bearer ${key}`), '{"title":"x"}')).status, 422);
  const ok = await handleCreateTicket(repo, fakeReq(`Bearer ${key}`), JSON.stringify({ title: 'Voice room 502', body: 'all users', priority: 'p1', externalId: 'evt-1' }));
  assert.equal(ok.status, 201);
  const dup = await handleCreateTicket(repo, fakeReq(`Bearer ${key}`), JSON.stringify({ title: 'Voice room 502', body: 'all users', externalId: 'evt-1' }));
  assert.deepEqual(dup.body, { duplicate: true });
  assert.equal((await repo.listTickets(t.id)).length, 1);
});

test('discord intake: rejects bad signatures, answers PING, files /ticket once per interaction', async () => {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const pubHex = publicKey.export({ format: 'der', type: 'spki' }).subarray(-32).toString('hex');
  const repo = new MemRepo();
  const t = await repo.createTenant('onyx', 'Onyx');
  const cfg = { publicKeyHex: pubHex, tenantByGuild: { g1: t.id } };
  const signed = (body: string) => { const ts = '1700000000'; const sig = sign(null, Buffer.from(ts + body), privateKey).toString('hex'); return { 'x-signature-ed25519': sig, 'x-signature-timestamp': ts }; };
  assert.equal(verifyDiscordSignature(pubHex, '00', '1', '{}'), false);
  const ping = JSON.stringify({ type: 1 });
  assert.deepEqual((await handleDiscordInteraction(repo, cfg, signed(ping), ping)).body, { type: 1 });
  assert.equal((await handleDiscordInteraction(repo, cfg, { 'x-signature-ed25519': 'ff', 'x-signature-timestamp': '1' }, ping)).status, 401);
  const cmd = JSON.stringify({ type: 2, id: 'i-1', guild_id: 'g1', member: { user: { id: 'u9' } }, data: { name: 'ticket', options: [{ name: 'title', value: 'Agent loops' }, { name: 'body', value: 'same tool call 40 times' }] } });
  const r1 = await handleDiscordInteraction(repo, cfg, signed(cmd), cmd);
  assert.match((r1.body as any).data.content, /filed/);
  const r2 = await handleDiscordInteraction(repo, cfg, signed(cmd), cmd);
  assert.match((r2.body as any).data.content, /already/);
  const list = await repo.listTickets(t.id);
  assert.equal(list.length, 1); assert.equal(list[0].source, 'discord');
});

test('maildir intake: parses headers, quoted-printable, multipart; dedupes on Message-ID; moves files to cur', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'kennel-mail-'));
  await mkdir(path.join(dir, 'new'), { recursive: true });
  const eml = 'From: Ada <ada@example.com>\r\nSubject: Stripe charged\r\n twice\r\nMessage-ID: <m1@example.com>\r\nContent-Type: multipart/alternative; boundary="b1"\r\n\r\n--b1\r\nContent-Type: text/html\r\n\r\n<b>html</b>\r\n--b1\r\nContent-Type: text/plain\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\nMy card shows two charges =3D refund one=\r\n please\r\n--b1--\r\n';
  const p = parseEml(eml);
  assert.equal(p.messageId, 'm1@example.com'); assert.equal(p.subject, 'Stripe charged twice'); assert.equal(p.text, 'My card shows two charges = refund one please');
  await writeFile(path.join(dir, 'new', 'a.eml'), eml); await writeFile(path.join(dir, 'new', 'b.eml'), eml);
  const repo = new MemRepo(); const t = await repo.createTenant('bh', 'Bloodhound');
  const r = await pollMaildir(repo, dir, t.id);
  assert.deepEqual(r, { filed: 1, duplicates: 1 });
  assert.equal((await readdir(path.join(dir, 'new'))).length, 0);
  assert.equal((await readdir(path.join(dir, 'cur'))).length, 2);
  assert.equal((await repo.listTickets(t.id))[0].source, 'email');
});
