// Publishes any post marked `devto: true` in its frontmatter to dev.to with a
// canonical URL pointing back at saram.thebotss.com. Already-published posts are skipped.
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const KEY = process.env.DEVTO_API_KEY;
const SITE = 'https://saram.thebotss.com';
const DIR = 'src/content/blog';
if (!KEY) { console.log('No DEVTO_API_KEY set, skipping cross-post.'); process.exit(0); }

const api = (path, init = {}) =>
  fetch(`https://dev.to/api${path}`, {
    ...init,
    headers: { 'api-key': KEY, 'content-type': 'application/json', ...(init.headers || {}) },
  });

const parseFm = (raw) => {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) return null;
  const fm = {};
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^(\w+):\s*(.*)$/);
    if (!kv) continue;
    let v = kv[2].trim().replace(/^["']|["']$/g, '');
    if (v.startsWith('[')) v = JSON.parse(v.replace(/'/g, '"'));
    fm[kv[1]] = v;
  }
  return { fm, body: m[2] };
};

const existing = await api('/articles/me/all?per_page=1000').then((r) => r.json()).catch(() => []);
const published = new Set((Array.isArray(existing) ? existing : []).map((a) => a.canonical_url));

for (const file of await readdir(DIR)) {
  if (!file.endsWith('.md')) continue;
  const parsed = parseFm(await readFile(join(DIR, file), 'utf8'));
  if (!parsed) continue;
  const { fm, body } = parsed;
  if (fm.draft === 'true') continue;

  const slug = file.replace(/\.md$/, '');
  const canonical = `${SITE}/${slug}`;
  if (published.has(canonical)) { console.log(`skip (already on dev.to): ${slug}`); continue; }

  const markdown = body.replace(/\]\(\/images\//g, `](${SITE}/images/`);
  const res = await api('/articles', {
    method: 'POST',
    body: JSON.stringify({
      article: {
        title: fm.title,
        published: true,
        body_markdown: markdown,
        canonical_url: canonical,
        description: fm.description,
        tags: (Array.isArray(fm.tags) ? fm.tags : []).slice(0, 4).map((t) => String(t).replace(/-/g, '')),
        main_image: fm.cover ? `${SITE}${fm.cover}` : undefined,
      },
    }),
  });
  const out = await res.json();
  console.log(res.ok ? `published to dev.to: ${out.url}` : `FAILED ${slug}: ${JSON.stringify(out).slice(0, 300)}`);
}
