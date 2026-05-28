import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ttfPath = resolve(__dirname, '../src/assets/fonts/DejaVuSans.ttf');
const outPath = resolve(__dirname, '../src/assets/fonts/DejaVuSans.base64.ts');

if (!existsSync(ttfPath)) {
  console.error(`Font file not found: ${ttfPath}`);
  process.exit(1);
}

const ttf = readFileSync(ttfPath);
const b64 = ttf.toString('base64');
writeFileSync(outPath, `export default "${b64}";\n`);
console.log(`✅ Font base64 written (${b64.length} chars) -> ${outPath}`);
