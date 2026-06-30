import { promises as fs } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SITE_URL = (process.env.SITE_URL ?? 'https://i-janicki.pl').replace(/\/+$/, '');

const EXCLUDED_DIRS = new Set([
  '.git',
  'node_modules',
  '.github',
  '.claude',
  'dokumenty',
  'i-JANEK',
  'Szablony',
  'assets',
  'icons',
  'scripts',
  'test-results',
  'functions',
  'firma',
  'firmy',
  'stats',
  'kalkulator',
  'kalkulator/_app',
  'kalkulator/stare'
]);

function isExcluded(relativePath) {
  if (!relativePath || relativePath === '.') return false;
  const segments = relativePath.split('/');
  if (segments.includes('node_modules')) return true;
  return Array.from(EXCLUDED_DIRS).some((excluded) => relativePath === excluded || relativePath.startsWith(`${excluded}/`));
}

async function collectHtmlFiles(currentDir, collected = []) {
  const entries = await fs.readdir(currentDir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(currentDir, entry.name);
    const relativePath = path.relative(ROOT, fullPath).replace(/\\/g, '/');

    if (entry.isDirectory()) {
      if (isExcluded(relativePath)) continue;
      await collectHtmlFiles(fullPath, collected);
      continue;
    }

    if (!entry.isFile()) continue;
    if (!entry.name.endsWith('.html')) continue;
    if (entry.name.startsWith('.')) continue;

    collected.push(fullPath);
  }

  return collected;
}

function filePathToRoute(relativePath) {
  if (relativePath === 'index.html') return '/';
  if (relativePath.endsWith('/index.html')) return `/${relativePath.slice(0, -'index.html'.length)}`;
  return `/${relativePath}`;
}

function xmlEscape(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

async function buildSitemapEntries() {
  const htmlFiles = await collectHtmlFiles(ROOT);
  const entries = [];

  for (const filePath of htmlFiles) {
    const relativePath = path.relative(ROOT, filePath).replace(/\\/g, '/');
    const route = filePathToRoute(relativePath);
    const stat = await fs.stat(filePath);
    const lastmod = stat.mtime.toISOString().slice(0, 10);

    entries.push({
      route,
      loc: `${SITE_URL}${route}`,
      lastmod
    });
  }

  entries.sort((a, b) => a.route.localeCompare(b.route));
  return entries;
}

async function writeSitemap(entries) {
  const xmlLines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
  ];

  for (const entry of entries) {
    xmlLines.push('  <url>');
    xmlLines.push(`    <loc>${xmlEscape(entry.loc)}</loc>`);
    xmlLines.push(`    <lastmod>${entry.lastmod}</lastmod>`);
    xmlLines.push('  </url>');
  }

  xmlLines.push('</urlset>');
  xmlLines.push('');

  await fs.writeFile(path.join(ROOT, 'sitemap.xml'), xmlLines.join('\n'), 'utf8');
}

async function writeRobots() {
  const lines = [
    'User-agent: *',
    'Allow: /',
    'Disallow: /i-JANEK/',
    'Disallow: /Szablony/',
    'Disallow: /dokumenty/',
    'Disallow: /functions/',
    'Disallow: /firma/',
    'Disallow: /firmy/',
    'Disallow: /stats/',
    'Disallow: /kalkulator/',
    'Disallow: /kalkulator/_app/',
    'Disallow: /kalkulator/stare/',
    '',
    `Sitemap: ${SITE_URL}/sitemap.xml`,
    ''
  ];

  await fs.writeFile(path.join(ROOT, 'robots.txt'), lines.join('\n'), 'utf8');
}

async function main() {
  const entries = await buildSitemapEntries();
  await writeSitemap(entries);
  await writeRobots();

  console.log(`Generated sitemap.xml with ${entries.length} URLs and refreshed robots.txt`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
