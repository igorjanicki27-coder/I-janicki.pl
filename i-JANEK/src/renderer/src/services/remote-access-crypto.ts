import type {
  MasterSecurityConfig,
  RemoteAccessCredential,
  RemoteAccessPublicKey
} from '@shared/contracts'

const PBKDF2_ITERATIONS = 600_000

function bytesToBase64(bytes: ArrayBuffer | Uint8Array) {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  let binary = ''
  for (const byte of view) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function base64ToBytes(value: string) {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes
}

async function deriveWrappingKey(passphrase: string, salt: Uint8Array, iterations: number) {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey']
  )
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

export async function createMasterSecurityConfig(passphrase: string): Promise<{ config: MasterSecurityConfig; privateKey: CryptoKey }> {
  if (passphrase.length < 12) throw new Error('Hasło dostępu musi mieć co najmniej 12 znaków.')

  const pair = await crypto.subtle.generateKey(
    {
      name: 'RSA-OAEP',
      modulusLength: 3072,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256'
    },
    true,
    ['encrypt', 'decrypt']
  )
  const [publicJwk, privateJwk] = await Promise.all([
    crypto.subtle.exportKey('jwk', pair.publicKey),
    crypto.subtle.exportKey('jwk', pair.privateKey)
  ])
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const wrappingKey = await deriveWrappingKey(passphrase, salt, PBKDF2_ITERATIONS)
  const encryptedPrivateKey = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    wrappingKey,
    new TextEncoder().encode(JSON.stringify(privateJwk))
  )
  const publicKey: RemoteAccessPublicKey = {
    keyId: crypto.randomUUID(),
    jwk: publicJwk as Record<string, unknown>,
    createdAt: Date.now()
  }

  return {
    privateKey: pair.privateKey,
    config: {
      publicKey,
      encryptedPrivateKey: bytesToBase64(encryptedPrivateKey),
      salt: bytesToBase64(salt),
      iv: bytesToBase64(iv),
      iterations: PBKDF2_ITERATIONS,
      createdAt: Date.now()
    }
  }
}

export async function unlockMasterPrivateKey(config: MasterSecurityConfig, passphrase: string) {
  const salt = base64ToBytes(config.salt)
  const iv = base64ToBytes(config.iv)
  const wrappingKey = await deriveWrappingKey(passphrase, salt, config.iterations)
  let privateJwk: JsonWebKey
  try {
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      wrappingKey,
      base64ToBytes(config.encryptedPrivateKey)
    )
    privateJwk = JSON.parse(new TextDecoder().decode(decrypted)) as JsonWebKey
  } catch {
    throw new Error('Nieprawidłowe hasło dostępu do zdalnych połączeń.')
  }

  return crypto.subtle.importKey('jwk', privateJwk, { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['decrypt'])
}

export async function encryptRemoteAccessCredential(publicKey: RemoteAccessPublicKey, credential: RemoteAccessCredential) {
  const key = await crypto.subtle.importKey(
    'jwk',
    publicKey.jwk as JsonWebKey,
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    false,
    ['encrypt']
  )
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'RSA-OAEP' },
    key,
    new TextEncoder().encode(JSON.stringify(credential))
  )
  return {
    keyId: publicKey.keyId,
    algorithm: 'RSA-OAEP-256' as const,
    ciphertext: bytesToBase64(ciphertext),
    updatedAt: Date.now()
  }
}

export async function decryptRemoteAccessCredential(privateKey: CryptoKey, ciphertext: string): Promise<RemoteAccessCredential> {
  try {
    const decrypted = await crypto.subtle.decrypt(
      { name: 'RSA-OAEP' },
      privateKey,
      base64ToBytes(ciphertext)
    )
    return JSON.parse(new TextDecoder().decode(decrypted)) as RemoteAccessCredential
  } catch {
    throw new Error('Nie udało się odszyfrować danych dostępu. Sprawdź klucz Mastera.')
  }
}
