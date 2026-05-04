import crypto from 'node:crypto'
import { DEFAULT_VAULT_KEY } from '@shared/constants'

function getKey(secret: string) {
  return crypto.createHash('sha256').update(secret).digest()
}

export function encryptVaultSecret(plainText: string, secret = process.env.VITE_AES_VAULT_KEY || DEFAULT_VAULT_KEY) {
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv('aes-256-cbc', getKey(secret), iv)
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()])
  return `${iv.toString('hex')}:${encrypted.toString('hex')}`
}
