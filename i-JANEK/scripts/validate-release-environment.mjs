#!/usr/bin/env node

import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadEnv } from 'electron-vite'

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const releaseEnvironment = {
  ...loadEnv('production', appRoot, 'VITE_'),
  ...process.env
}

const requiredVariables = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
  'VITE_FIREBASE_DATABASE_URL',
  'VITE_MASTER_EMAIL'
]

const missingVariables = requiredVariables.filter((name) => !releaseEnvironment[name]?.trim())
if (missingVariables.length > 0) {
  console.error(`[release] Brak wymaganej konfiguracji wydania: ${missingVariables.join(', ')}`)
  console.error('[release] Uzupełnij lokalny plik .env albo zmienne środowiskowe przed rozpoczęciem builda.')
  process.exit(1)
}

console.log('[release] Publiczna konfiguracja aplikacji jest kompletna.')
