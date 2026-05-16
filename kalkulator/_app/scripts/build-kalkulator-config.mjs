import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const cwd = process.cwd();
const envPaths = [resolve(cwd, '.env')];
const outPath = resolve(cwd, 'src', 'generated', 'kalkulatorConfig.ts');

function parseEnv(text) {
  const env = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

function fnv1aHex(input) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

async function main() {
  const env = {};

  for (const envPath of envPaths) {
    try {
      const contents = await readFile(envPath, 'utf8');
      Object.assign(env, parseEnv(contents));
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }

  const pin = process.env.KALKULATOR_PIN || env.KALKULATOR_PIN;
  if (!pin) {
    throw new Error('Missing KALKULATOR_PIN in .env');
  }
  if (!/^\d{4}$/.test(pin)) {
    throw new Error('KALKULATOR_PIN must be exactly 4 digits');
  }

  const salt = process.env.KALKULATOR_PIN_SALT || env.KALKULATOR_PIN_SALT || randomBytes(16).toString('hex');
  const pinHash = fnv1aHex(`${salt}:${pin}`);

  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(
    outPath,
    `export const KALKULATOR_PIN_CONFIG = ${JSON.stringify({
      pinHash,
      pinSalt: salt,
      pinLength: 4,
      lockMinutes: 2,
      unlockHours: 8,
    }, null, 2)} as const;\n`,
    'utf8',
  );

  console.log(`Generated ${outPath}`);
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
