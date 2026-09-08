/**
 * Email intake from a maildir-style drop directory: any MTA (or `fetchmail`) that
 * delivers raw RFC 822 files into `<dir>/new` feeds Kennel with zero dependencies.
 * Message-ID is the dedupe key. Processed files move to `<dir>/cur`.
 */
import { readdir, readFile, rename, mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { Repo } from '../db/repo.ts';

export type ParsedMail = { messageId: string; from: string; subject: string; text: string };

export function parseEml(raw: string): ParsedMail {
  const norm = raw.replace(/\r\n/g, '\n');
  const sep = norm.indexOf('\n\n');
  const head = (sep === -1 ? norm : norm.slice(0, sep)).replace(/\n[ \t]+/g, ' ');
  const bodyRaw = sep === -1 ? '' : norm.slice(sep + 2);
  const h = (name: string) => { const m = head.match(new RegExp(`^${name}:\\s*(.*)$`, 'im')); return m ? m[1].trim() : ''; };
  const ct = h('Content-Type');
  let text = bodyRaw;
  let cte = h('Content-Transfer-Encoding');
  const boundary = ct.match(/boundary="?([^";]+)"?/i)?.[1];
  if (boundary) {
    const parts = bodyRaw.split(`--${boundary}`).slice(1).filter(p => p.trim() && p.trim() !== '--');
    const plain = parts.find(p => /content-type:\s*text\/plain/i.test(p)) ?? parts[0] ?? '';
    const i = plain.indexOf('\n\n');
    const partHead = i === -1 ? '' : plain.slice(0, i);
    text = i === -1 ? plain : plain.slice(i + 2);
    cte = partHead.match(/^Content-Transfer-Encoding:\s*(.*)$/im)?.[1]?.trim() ?? cte;
  }
  text = text.replace(/\n--$/, '');
  if (/quoted-printable/i.test(cte)) text = text.replace(/=\n/g, '').replace(/=([0-9A-F]{2})/gi, (_, x) => String.fromCharCode(parseInt(x, 16)));
  if (/base64/i.test(cte)) text = Buffer.from(text.replace(/\s+/g, ''), 'base64').toString('utf8');
  return { messageId: h('Message-ID').replace(/^<|>$/g, ''), from: h('From'), subject: h('Subject'), text: text.trim() };
}

export async function pollMaildir(repo: Repo, dir: string, tenantId: string): Promise<{ filed: number; duplicates: number }> {
  const newDir = path.join(dir, 'new'); const curDir = path.join(dir, 'cur');
  await mkdir(newDir, { recursive: true }); await mkdir(curDir, { recursive: true });
  let filed = 0, duplicates = 0;
  for (const f of await readdir(newDir)) {
    const raw = await readFile(path.join(newDir, f), 'utf8');
    const m = parseEml(raw);
    const t = await repo.insertTicket({ tenantId, title: (m.subject || '(no subject)').slice(0, 200), body: (m.text || raw).slice(0, 20_000), source: 'email', requester: m.from.slice(0, 200), externalId: m.messageId ? `message-id:${m.messageId}` : `file:${f}` });
    t ? filed++ : duplicates++;
    await rename(path.join(newDir, f), path.join(curDir, f));
  }
  return { filed, duplicates };
}
