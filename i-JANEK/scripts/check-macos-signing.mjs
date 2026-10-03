#!/usr/bin/env node

import { X509Certificate } from 'node:crypto'
import { execFileSync, spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const metadata = JSON.parse(readFileSync(resolve(appRoot, 'resources/macos-signing-public.json'), 'utf8'))
const appArgument = process.argv.find((argument) => argument.startsWith('--app='))
const appPath = appArgument?.slice('--app='.length)

if (process.platform !== 'darwin') {
  throw new Error('Kontrola certyfikatu macOS wymaga komputera Mac.')
}

const identities = execFileSync('security', ['find-identity', '-v', '-p', 'codesigning'], { encoding: 'utf8' })
if (!identities.includes(`"${metadata.identityName}"`)) {
  throw new Error(`Brakuje aktywnej tożsamości podpisującej: ${metadata.identityName}.`)
}

const certificatePem = execFileSync('security', ['find-certificate', '-c', metadata.identityName, '-p'])
const certificate = new X509Certificate(certificatePem)
const fingerprint = certificate.fingerprint256.replaceAll(':', '').toLowerCase()
if (fingerprint !== metadata.fingerprintSha256) {
  throw new Error('Odcisk certyfikatu macOS nie zgadza się z certyfikatem wydania i-JANEK.')
}
if (Date.now() < Date.parse(certificate.validFrom) || Date.now() >= Date.parse(certificate.validTo)) {
  throw new Error('Certyfikat podpisu macOS nie jest obecnie ważny.')
}

if (appPath) {
  const defaultKeychain = execFileSync('security', ['default-keychain', '-d', 'user'], { encoding: 'utf8' })
    .trim()
    .replace(/^"|"$/g, '')
  execFileSync('codesign', [
    '--verify', '--deep', '--strict', '--verbose=2', '--keychain', defaultKeychain, resolve(appPath)
  ], { stdio: 'inherit' })
  const requirementResult = spawnSync('codesign', ['-d', '-r-', resolve(appPath)], { encoding: 'utf8' })
  if (requirementResult.status !== 0) {
    throw new Error('Nie udało się odczytać wymagań podpisu z gotowej aplikacji macOS.')
  }
  const requirement = `${requirementResult.stdout}\n${requirementResult.stderr}`.toLowerCase()
  if (!requirement.includes(metadata.fingerprintSha1)) {
    throw new Error('Gotowa aplikacja macOS została podpisana innym certyfikatem niż certyfikat wydania i-JANEK.')
  }
}

console.log(`Certyfikat macOS jest gotowy: ${metadata.identityName} (${metadata.fingerprintSha256.slice(0, 16)}…).`)
