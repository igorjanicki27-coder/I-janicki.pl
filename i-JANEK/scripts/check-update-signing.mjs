#!/usr/bin/env node

import { createPrivateKey, createPublicKey } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const privateKey = createPrivateKey(process.env.WINDOWS_UPDATE_SIGNING_KEY_PEM || readFileSync(resolve('resources/update-signing-private.pem')))
const pinned = JSON.parse(readFileSync(resolve('resources/scripts/update-signing-public.json'), 'utf8'))
const actual = createPublicKey(privateKey).export({ format: 'jwk' })
if (pinned.kty !== 'RSA' || pinned.n !== actual.n || pinned.e !== actual.e) {
  throw new Error('Klucz prywatny nie odpowiada kluczowi publicznemu w instalatorze.')
}
console.log('Klucz podpisu aktualizacji Windows pasuje do instalatora.')
