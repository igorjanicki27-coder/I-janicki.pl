#!/usr/bin/env node

import { createHash, createPrivateKey, createPublicKey, sign, verify } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'

const channel = process.argv[2]
const version = process.argv[3]
const installerPath = resolve(process.argv[4] ?? '')
const outputDir = resolve(process.argv[5] ?? 'dist')
if (!['latest', 'beta', 'test'].includes(channel) || !/^\d+\.\d+\.\d+(?:-(?:alpha|beta)\.\d+)?$/u.test(version ?? '')) {
  throw new Error('Użycie: sign-windows-update.mjs <latest|beta|test> <wersja> <instalator.exe>')
}
if (basename(installerPath) !== `i-JANEK-Setup-${version}.exe`) {
  throw new Error('Nazwa instalatora nie odpowiada wersji wydania.')
}

const privateKey = createPrivateKey(process.env.WINDOWS_UPDATE_SIGNING_KEY_PEM || readFileSync(resolve('resources/update-signing-private.pem')))
const pinnedPublicKey = JSON.parse(readFileSync(resolve('resources/scripts/update-signing-public.json'), 'utf8'))
const actualPublicKey = createPublicKey(privateKey).export({ format: 'jwk' })
if (actualPublicKey.n !== pinnedPublicKey.n || actualPublicKey.e !== pinnedPublicKey.e) {
  throw new Error('Klucz prywatny nie odpowiada kluczowi publicznemu w instalatorze.')
}

const manifest = {
  schema: 1,
  version,
  channel,
  asset: basename(installerPath),
  sha512: createHash('sha512').update(readFileSync(installerPath)).digest('base64')
}
const bytes = Buffer.from(`${JSON.stringify(manifest)}\n`, 'utf8')
const signature = sign('sha256', bytes, privateKey).toString('base64')
if (!verify('sha256', bytes, createPublicKey(privateKey), Buffer.from(signature, 'base64'))) {
  throw new Error('Wewnętrzna weryfikacja podpisu aktualizacji nie powiodła się.')
}
writeFileSync(join(outputDir, 'update-windows.json'), bytes)
writeFileSync(join(outputDir, 'update-windows.sig'), `${signature}\n`)
console.log(`Podpisano manifest aktualizacji Windows ${version} (${channel}).`)
