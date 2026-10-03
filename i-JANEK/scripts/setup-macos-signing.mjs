#!/usr/bin/env node

import { X509Certificate, randomBytes } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { homedir, tmpdir, userInfo } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const metadataPath = resolve(appRoot, 'resources/macos-signing-public.json')
const identityName = 'i-JANEK Local Code Signing'
const keychainService = 'i-JANEK macOS signing backup'
const desktop = join(homedir(), 'Desktop')
const backupPath = join(desktop, 'i-JANEK-podpis-macOS.p12')
const publicCertificatePath = join(desktop, 'i-JANEK-podpis-macOS.cer')

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    encoding: options.encoding ?? 'utf8',
    input: options.input,
    stdio: options.stdio ?? ['ignore', 'pipe', 'pipe']
  })
}

if (process.platform !== 'darwin') {
  throw new Error('Certyfikat macOS można przygotować wyłącznie na komputerze Mac.')
}
if (existsSync(metadataPath) || existsSync(backupPath) || existsSync(publicCertificatePath)) {
  throw new Error('Certyfikat lub jego kopia już istnieje. Nie nadpisuję klucza podpisu.')
}

mkdirSync(desktop, { recursive: true })
const temporaryDirectory = mkdtempSync(join(tmpdir(), 'i-janek-macos-signing-'))
const opensslConfigPath = join(temporaryDirectory, 'openssl.cnf')
const privateKeyPath = join(temporaryDirectory, 'private-key.pem')
const certificatePemPath = join(temporaryDirectory, 'certificate.pem')
const certificateDerPath = join(temporaryDirectory, 'certificate.cer')
const identityPath = join(temporaryDirectory, 'identity.p12')
const backupPassword = randomBytes(36).toString('base64url')

try {
  writeFileSync(
    opensslConfigPath,
    `[req]\n` +
      `distinguished_name = distinguished_name\n` +
      `x509_extensions = extensions\n` +
      `prompt = no\n\n` +
      `[distinguished_name]\n` +
      `CN = ${identityName}\n` +
      `O = i-JANICKI\n` +
      `OU = i-JANEK\n\n` +
      `[extensions]\n` +
      `basicConstraints = critical, CA:true\n` +
      `keyUsage = critical, digitalSignature, keyCertSign\n` +
      `extendedKeyUsage = codeSigning\n` +
      `subjectKeyIdentifier = hash\n` +
      `authorityKeyIdentifier = keyid:always\n`,
    { encoding: 'utf8', mode: 0o600 }
  )

  run('openssl', [
    'req', '-x509', '-newkey', 'rsa:3072', '-sha256', '-days', '3650', '-nodes',
    '-config', opensslConfigPath, '-keyout', privateKeyPath, '-out', certificatePemPath
  ])
  run('openssl', ['x509', '-in', certificatePemPath, '-outform', 'der', '-out', certificateDerPath])
  run('openssl', [
    'pkcs12', '-export', '-legacy', '-out', identityPath, '-inkey', privateKeyPath, '-in', certificatePemPath,
    '-name', identityName, '-passout', `pass:${backupPassword}`
  ])

  const defaultKeychain = run('security', ['default-keychain', '-d', 'user']).trim().replace(/^"|"$/g, '')
  try {
    run('security', [
      'import', identityPath, '-k', defaultKeychain, '-P', backupPassword,
      '-T', '/usr/bin/codesign', '-T', '/usr/bin/security'
    ])
  } catch {
    throw new Error('macOS nie zdołał zaimportować tożsamości podpisującej do Pęku kluczy.')
  }
  run('security', ['add-trusted-cert', '-r', 'trustRoot', '-p', 'codeSign', '-k', defaultKeychain, certificatePemPath])
  run('security', [
    'add-generic-password', '-U', '-a', userInfo().username, '-s', keychainService, '-w', backupPassword
  ])

  const certificate = new X509Certificate(readFileSync(certificatePemPath))
  copyFileSync(identityPath, backupPath)
  chmodSync(backupPath, 0o600)
  copyFileSync(certificateDerPath, publicCertificatePath)
  chmodSync(publicCertificatePath, 0o644)
  writeFileSync(
    metadataPath,
    `${JSON.stringify({
      schemaVersion: 1,
      identityName,
      keychainService,
      fingerprintSha1: certificate.fingerprint.replaceAll(':', '').toLowerCase(),
      fingerprintSha256: certificate.fingerprint256.replaceAll(':', '').toLowerCase(),
      validFrom: certificate.validFrom,
      validTo: certificate.validTo
    }, null, 2)}\n`,
    'utf8'
  )

  const identities = run('security', ['find-identity', '-v', '-p', 'codesigning'])
  if (!identities.includes(identityName)) {
    throw new Error('Certyfikat został utworzony, ale macOS nie uznał go za aktywną tożsamość podpisującą.')
  }

  console.log(`Utworzono tożsamość podpisującą: ${identityName}`)
  console.log(`Zaszyfrowana kopia: ${backupPath}`)
  console.log(`Certyfikat publiczny: ${publicCertificatePath}`)
  console.log(`Hasło kopii zapisano w Pęku kluczy jako: ${keychainService}`)
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true })
}
