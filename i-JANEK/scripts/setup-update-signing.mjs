#!/usr/bin/env node

import { generateKeyPairSync } from 'node:crypto'
import { existsSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const privatePath = resolve('resources/update-signing-private.pem')
const publicPath = resolve('resources/scripts/update-signing-public.json')

if (existsSync(privatePath) || existsSync(publicPath)) {
  throw new Error('Klucz aktualizacji już istnieje. Nie nadpisuję go, bo stare instalacje utraciłyby możliwość aktualizacji.')
}

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 3072 })
const jwk = publicKey.export({ format: 'jwk' })
writeFileSync(privatePath, privateKey.export({ format: 'pem', type: 'pkcs8' }), { mode: 0o600, flag: 'wx' })
writeFileSync(publicPath, `${JSON.stringify({ kty: 'RSA', n: jwk.n, e: jwk.e }, null, 2)}\n`, { flag: 'wx' })
console.log('Utworzono prywatny klucz aktualizacji i publiczny klucz dołączany do instalatora. Prywatny klucz pozostaje poza Git.')
