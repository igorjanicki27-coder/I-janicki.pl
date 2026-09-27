#!/usr/bin/env node

const requiredVariables = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
  'VITE_FIREBASE_DATABASE_URL',
  'VITE_MASTER_EMAIL'
]

const missingVariables = requiredVariables.filter((name) => !process.env[name]?.trim())
if (missingVariables.length > 0) {
  console.error(`[release] Brak wymaganych GitHub Variables: ${missingVariables.join(', ')}`)
  process.exit(1)
}

console.log('[release] Publiczna konfiguracja aplikacji jest kompletna.')
