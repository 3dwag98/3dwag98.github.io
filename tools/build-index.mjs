#!/usr/bin/env node
/* ============================================================================
   build-index.mjs — regenerate blog/posts.json, feed.xml and sitemap.xml
   from the files in blog/posts/.

     node tools/build-index.mjs

   Optional: the site itself needs no build step. This just saves you from
   hand-editing the manifest. Metadata comes from a post's own front matter
   (Markdown) or a leading <!--meta ... --> block (HTML); anything already in
   posts.json is kept as a fallback, so manual edits are not clobbered.
   ========================================================================= */

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, extname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const POSTS_DIR = join(ROOT, 'blog', 'posts');
const MANIFEST = join(ROOT, 'blog', 'posts.json');

const SITE = {
  url: 'https://3dwag98.github.io',
  title: 'Notes — Chintamani Gawade',
  description: 'Working notes on building software at scale.',
  author: 'Chintamani Gawade'
};

/* ---------- metadata ------------------------------------------------------ */

const unquote = (v) => String(v).replace(/^['"]|['"]$/g, '').trim();

function parseMeta(block) {
  const data = {};
  let key = null;

  for (const line of block.split(/\r?\n/)) {
    const item = /^\s*-\s+(.*)$/.exec(line);
    if (item && key) {
      if (!Array.isArray(data[key])) data[key] = [];
      data[key].push(unquote(item[1]));
      continue;
    }

    const pair = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(line);
    if (!pair) continue;

    key = pair[1];
    const value = pair[2].trim();

    if (value === '') data[key] = '';
    else if (/^\[.*\]$/.test(value)) data[key] = value.slice(1, -1).split(',').map((v) => unquote(v)).filter(Boolean);
    else if (value === 'true' || value === 'false') data[key] = value === 'true';
    else data[key] = unquote(value);
  }

  return data;
}

function extract(raw, format) {
  if (format === 'md') {
    const m = /^﻿?---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(raw);
    return m ? { meta: parseMeta(m[1]), body: raw.slice(m[0].length) } : { meta: {}, body: raw };
  }

  const m = /<!--\s*meta\s*\r?\n([\s\S]*?)-->/i.exec(raw);
  return { meta: m ? parseMeta(m[1]) : {}, body: raw.replace(/<!--[\s\S]*?-->/g, '') };
}

const plain = (body, format) =>
  (format === 'md'
    ? body.replace(/```[\s\S]*?```/g, ' ').replace(/[#>*_`\-|]/g, ' ')
    : body.replace(/<[^>]+>/g, ' ')
  ).replace(/\s+/g, ' ').trim();

function fallbackTitle(body, format) {
  const md = /^#\s+(.+)$/m.exec(body);
  if (format === 'md' && md) return md[1].trim();
  const html = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(body);
  if (html) return html[1].replace(/<[^>]+>/g, '').trim();
  return '';
}

function fallbackSummary(text) {
  const first = text.split(/(?<=\.)\s+/).slice(0, 2).join(' ');
  return first.length > 220 ? first.slice(0, 217).trimEnd() + '…' : first;
}

const titleFromSlug = (slug) =>
  slug.replace(/[-_]+/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

/* ---------- build --------------------------------------------------------- */

const existing = new Map(
  (existsSync(MANIFEST) ? (JSON.parse(readFileSync(MANIFEST, 'utf8')).posts ?? []) : [])
    .map((p) => [p.slug, p])
);

if (!existsSync(POSTS_DIR)) {
  console.error(`No posts directory at ${POSTS_DIR}`);
  process.exit(1);
}

const posts = readdirSync(POSTS_DIR)
  .filter((f) => /\.(md|markdown|html?)$/i.test(f))
  .map((file) => {
    const ext = extname(file).toLowerCase();
    const slug = basename(file, ext);
    const format = /^\.html?$/.test(ext) ? 'html' : 'md';
    const raw = readFileSync(join(POSTS_DIR, file), 'utf8');
    const { meta, body } = extract(raw, format);
    const prev = existing.get(slug) ?? {};
    const text = plain(body, format);
    const words = text.split(/\s+/).filter(Boolean).length;

    const post = {
      slug,
      title: meta.title || prev.title || fallbackTitle(body, format) || titleFromSlug(slug),
      date: meta.date || prev.date || statSync(join(POSTS_DIR, file)).mtime.toISOString().slice(0, 10),
      summary: meta.summary || prev.summary || fallbackSummary(text),
      tags: (meta.tags?.length ? meta.tags : prev.tags) ?? [],
      format,
      readingTime: `${Math.max(1, Math.round(words / 220))} min read`
    };

    if (file !== `${slug}.${format === 'html' ? 'html' : 'md'}`) post.file = `posts/${file}`;
    if (meta.draft ?? prev.draft) post.draft = true;

    return post;
  })
  .sort((a, b) => String(b.date).localeCompare(String(a.date)));

writeFileSync(
  MANIFEST,
  JSON.stringify({ $comment: 'Index of every entry. Regenerate with: node tools/build-index.mjs', posts }, null, 2) + '\n'
);

/* ---------- feed + sitemap ------------------------------------------------ */

const xml = (s) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const live = posts.filter((p) => !p.draft);
const postUrl = (p) => `${SITE.url}/blog/post.html?p=${encodeURIComponent(p.slug)}`;
const rfc822 = (d) => new Date(`${d}T09:00:00Z`).toUTCString();

writeFileSync(join(ROOT, 'feed.xml'),
`<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${xml(SITE.title)}</title>
    <link>${SITE.url}/blog/</link>
    <description>${xml(SITE.description)}</description>
    <language>en</language>
    <atom:link href="${SITE.url}/feed.xml" rel="self" type="application/rss+xml"/>
${live.map((p) => `    <item>
      <title>${xml(p.title)}</title>
      <link>${xml(postUrl(p))}</link>
      <guid isPermaLink="true">${xml(postUrl(p))}</guid>
      <pubDate>${rfc822(p.date)}</pubDate>
      <description>${xml(p.summary)}</description>
${(p.tags ?? []).map((t) => `      <category>${xml(t)}</category>`).join('\n')}
    </item>`).join('\n')}
  </channel>
</rss>
`);

writeFileSync(join(ROOT, 'sitemap.xml'),
`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${SITE.url}/</loc><priority>1.0</priority></url>
  <url><loc>${SITE.url}/blog/</loc><priority>0.8</priority></url>
${live.map((p) => `  <url><loc>${xml(postUrl(p))}</loc><lastmod>${p.date}</lastmod><priority>0.6</priority></url>`).join('\n')}
</urlset>
`);

console.log(`posts.json  ${posts.length} entries (${posts.length - live.length} draft)`);
for (const p of posts) console.log(`  ${p.draft ? '·' : '✓'} ${p.date}  ${p.slug}  (${p.format}, ${p.readingTime})`);
console.log('feed.xml, sitemap.xml written');
