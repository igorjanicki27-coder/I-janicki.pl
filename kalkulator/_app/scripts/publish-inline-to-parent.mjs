import { cpSync, readdirSync, readFileSync, rmSync, writeFileSync, copyFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const appRoot = resolve(__dirname, '..');
const distRoot = resolve(appRoot, 'dist');
const targetRoot = resolve(appRoot, '..');

const distHtmlPath = join(distRoot, 'index.html');
const distHtml = readFileSync(distHtmlPath, 'utf8');

const scriptMatch = distHtml.match(/<script type="module"[^>]*src="([^"]+)"[^>]*><\/script>/);
const cssMatch = distHtml.match(/<link rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/);

if (!scriptMatch || !cssMatch) {
  throw new Error('Nie znaleziono tagów script/link w dist/index.html');
}

const scriptRel = scriptMatch[1].replace(/^\.\//, '');
const cssRel = cssMatch[1].replace(/^\.\//, '');
const scriptCode = readFileSync(join(distRoot, scriptRel), 'utf8');
const cssCode = readFileSync(join(distRoot, cssRel), 'utf8');

// Prevent accidental HTML termination when inline code contains literal closing tags.
const safeInlineScript = scriptCode.replace(/<\/script>/gi, '<\\/script>');
const safeInlineCss = cssCode.replace(/<\/style>/gi, '<\\/style>');

// Use function replacers so "$&" and similar tokens from minified bundles
// are treated as plain text instead of special replacement patterns.
let outHtml = distHtml.replace(scriptMatch[0], () => `<script type="module">\n${safeInlineScript}\n</script>`);
outHtml = outHtml.replace(cssMatch[0], () => `<style>\n${safeInlineCss}\n</style>`);

const srcAssets = join(distRoot, 'assets');
const dstAssets = join(targetRoot, 'assets');
rmSync(dstAssets, { recursive: true, force: true });
cpSync(srcAssets, dstAssets, { recursive: true });

const assetFiles = readdirSync(srcAssets);
const logoFile = assetFiles.find((file) => /^logo-.*\.png$/.test(file));
if (logoFile) {
  copyFileSync(join(srcAssets, logoFile), join(targetRoot, logoFile));
}

writeFileSync(join(targetRoot, 'index.html'), outHtml, 'utf8');
console.log(`Published inline build to ${targetRoot}`);
