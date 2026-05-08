import crypto from 'node:crypto'

function getKey(secret: string) {
  return crypto.createHash('sha256').update(secret).digest()
}

function getVaultSecret() {
  const secret = (process.env.I_JANEK_AES_VAULT_KEY || process.env.VITE_AES_VAULT_KEY || '').trim()
  if (!secret) {
    throw new Error('Brak klucza AES sejfu. Ustaw I_JANEK_AES_VAULT_KEY w środowisku.')
  }
  return secret
}

export function encryptVaultSecret(plainText: string, secret = getVaultSecret()) {
  const normalizedSecret = secret.trim()
  if (!normalizedSecret) {
    throw new Error('Brak klucza AES do szyfrowania sejfu.')
  }
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv('aes-256-cbc', getKey(normalizedSecret), iv)
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()])
  return `v1:${iv.toString('hex')}:${encrypted.toString('hex')}`
}

export function decryptVaultSecret(cipherText: string, secrets: string | string[] = getVaultSecret()) {
  const candidates = (Array.isArray(secrets) ? secrets : [secrets]).map((entry) => entry.trim()).filter(Boolean)
  if (!candidates.length) {
    throw new Error('Brak klucza AES do odszyfrowania sejfu.')
  }

  const normalizedCipherText = cipherText.trim()
  const parts = normalizedCipherText.split(':')
  const legacyFormat = parts.length === 2
  const versionedFormat = parts.length === 3 && parts[0] === 'v1'

  if (!legacyFormat && !versionedFormat) {
    throw new Error('Nieprawidłowy format zaszyfrowanego wpisu sejfu.')
  }

  const [ivHex, payloadHex] = legacyFormat ? parts : parts.slice(1)
  const iv = Buffer.from(ivHex, 'hex')
  const payload = Buffer.from(payloadHex, 'hex')

  for (const secret of candidates) {
    try {
      const decipher = crypto.createDecipheriv('aes-256-cbc', getKey(secret), iv)
      const decrypted = Buffer.concat([decipher.update(payload), decipher.final()])
      return decrypted.toString('utf8')
    } catch {
      // Try the next key candidate.
    }
  }

  throw new Error('Nie udało się odszyfrować wpisu sejfu żadnym z dostępnych kluczy.')
}
