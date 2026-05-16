import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { randomBytes } from 'node:crypto'

const cwd = process.cwd()
const envPaths = [
  resolve(cwd, '.env'),
  resolve(cwd, 'i-JANEK', '.env'),
]
const outPath = resolve(cwd, 'kalkulator', 'config.js')

function parseEnv(text) {
  const env = {}
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    const key = line.slice(0, eq).trim()
    let value = line.slice(eq + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    env[key] = value
  }
  return env
}

function fnv1aHex(input) {
  let hash = 0x811c9dc5
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

async function main() {
  const env = {}
  for (const envPath of envPaths) {
    try {
      const contents = await readFile(envPath, 'utf8')
      Object.assign(env, parseEnv(contents))
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
    }
  }

  const pin = process.env.KALKULATOR_PIN || env.KALKULATOR_PIN
  if (!pin) {
    throw new Error('Missing KALKULATOR_PIN in .env')
  }
  if (!/^\d{4}$/.test(pin)) {
    throw new Error('KALKULATOR_PIN must be exactly 4 digits')
  }

  const salt = process.env.KALKULATOR_PIN_SALT || env.KALKULATOR_PIN_SALT || randomBytes(16).toString('hex')
  const hash = fnv1aHex(`${salt}:${pin}`)

  await mkdir(dirname(outPath), { recursive: true })
  await writeFile(
    outPath,
    `window.KALKULATOR_CONFIG = ${JSON.stringify({
      pinHash: hash,
      pinSalt: salt,
      pinLength: 4,
      lockMinutes: 2,
      unlockHours: 8,
      firestoreProjectId: 'i-janicki',
      firestoreCollection: 'calculator_orders',
      firestoreApiKey: env.VITE_FIREBASE_API_KEY || process.env.VITE_FIREBASE_API_KEY || '',
      firebaseApiKey: env.VITE_FIREBASE_API_KEY || process.env.VITE_FIREBASE_API_KEY || '',
      firebaseAuthDomain: env.VITE_FIREBASE_AUTH_DOMAIN || process.env.VITE_FIREBASE_AUTH_DOMAIN || '',
      firebaseProjectId: env.VITE_FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID || 'i-janicki',
      firebaseStorageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || process.env.VITE_FIREBASE_STORAGE_BUCKET || '',
      firebaseMessagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
      firebaseAppId: env.VITE_FIREBASE_APP_ID || process.env.VITE_FIREBASE_APP_ID || '',
      currency: 'PLN'
    }, null, 2)};\n`,
    'utf8'
  )

  console.log(`Generated ${outPath}`)
}

main().catch((error) => {
  console.error(error?.message || error)
  process.exit(1)
})
