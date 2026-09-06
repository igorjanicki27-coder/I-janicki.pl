import { promises as fs } from 'node:fs';

const pages = [
  ['Strony WWW', 'oferta/strony-www/index.html'],
  ['Wrocław', 'oferta/wroclaw/index.html'],
  ['Środa Śląska', 'oferta/sroda-slaska/index.html'],
  ['Miękinia i Lutynia', 'oferta/miekinia-lutynia/index.html']
];

function normalizeText(html) {
  const main = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1] || '';
  return main
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z0-9#]+;/gi, ' ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function shingles(text, size = 5) {
  const words = text.split(/\s+/).filter(Boolean);
  const result = new Set();
  for (let index = 0; index <= words.length - size; index += 1) {
    result.add(words.slice(index, index + size).join(' '));
  }
  return result;
}

function similarity(left, right) {
  let intersection = 0;
  for (const value of left) if (right.has(value)) intersection += 1;
  return intersection / Math.max(1, new Set([...left, ...right]).size);
}

const loaded = [];
for (const [label, file] of pages) {
  const html = await fs.readFile(file, 'utf8');
  const title = html.match(/<title>(.*?)<\/title>/i)?.[1] || '';
  const h1 = html.match(/<h1\b[^>]*>(.*?)<\/h1>/i)?.[1]?.replace(/<[^>]+>/g, '') || '';
  const canonical = html.match(/<link\s+rel="canonical"\s+href="([^"]+)"/i)?.[1] || '';
  loaded.push({ label, file, title, h1, canonical, shingles: shingles(normalizeText(html)) });
}

let failed = false;
for (let left = 0; left < loaded.length; left += 1) {
  for (let right = left + 1; right < loaded.length; right += 1) {
    const score = similarity(loaded[left].shingles, loaded[right].shingles);
    const level = score >= 0.35 ? 'FAIL' : score >= 0.2 ? 'WARN' : 'OK';
    if (level === 'FAIL') failed = true;
    console.log(`${level} ${loaded[left].label} ↔ ${loaded[right].label}: ${(score * 100).toFixed(1)}% wspólnych 5-wyrazowych fragmentów`);
  }
}

for (const page of loaded) {
  if (!page.title || !page.h1 || !page.canonical) {
    failed = true;
    console.error(`FAIL ${page.label}: brak title, H1 lub canonical (${page.file})`);
  }
}

if (failed) process.exitCode = 1;
