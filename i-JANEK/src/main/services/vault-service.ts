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
  return `${iv.toString('hex')}:${encrypted.toString('hex')}`
}
