import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import crypto from 'node:crypto'
import os from 'node:os'
import { app } from 'electron'
import nodeMachineId from 'node-machine-id'
import type { RustDeskState } from '@shared/contracts'
import { localStore } from '../store'

const RUSTDESK_COMMAND_TIMEOUT_MS = 20_000
const PASSWORD_ROTATION_INTERVAL_MS = 24 * 60 * 60 * 1000
const PASSWORD_LENGTH = 20
const PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'

const { machineIdSync } = nodeMachineId

function resolveBinaryPath() {
  const configured = process.env.RUSTDESK_BINARY_PATH || localStore.get('rustdeskBinaryPath')
  if (configured && fs.existsSync(configured)) return configured

  const packagedCandidate = path.join(process.resourcesPath, 'resources', 'rd-core.exe')
  if (fs.existsSync(packagedCandidate)) return packagedCandidate

  const devCandidate = path.join(app.getAppPath(), 'resources', 'rd-core.exe')
  if (fs.existsSync(devCandidate)) return devCandidate

  return undefined
}

function resolveRustDeskIdentity() {
  const envIdentity = process.env.RUSTDESK_IDENTITY?.trim().toUpperCase()
  if (envIdentity) {
    localStore.set('rustdeskIdentity', envIdentity)
    return envIdentity
  }

  const persisted = localStore.get('rustdeskIdentity')?.trim().toUpperCase()
  if (persisted) return persisted

  const hostname = os.hostname().replace(/[^A-Za-z0-9]/g, '').toUpperCase()
  const machineId = machineIdSync(true).replace(/[^A-Za-z0-9]/g, '').toUpperCase()
  const generated = `${hostname}_${machineId}`.slice(0, 48) || machineId || hostname || 'I_JANEK_DEVICE'
  localStore.set('rustdeskIdentity', generated)
  return generated
}

function getConfigString() {
  return process.env.RUSTDESK_CONFIG_STRING?.trim() || ''
}

function shouldLockConfig() {
  return process.env.RUSTDESK_LOCK_CONFIG !== '0'
}

function generateSecurePassword(length = PASSWORD_LENGTH) {
  const bytes = crypto.randomBytes(length * 2)
  let result = ''

  for (let index = 0; index < bytes.length && result.length < length; index += 1) {
    result += PASSWORD_ALPHABET[bytes[index] % PASSWORD_ALPHABET.length]
  }

  if (result.length < length) {
    return `${result}${generateSecurePassword(length - result.length)}`
  }

  return result
}

function resolveManagedPassword(forceRotate = false) {
  const now = Date.now()
  const persistedPassword = localStore.get('rustdeskPassword')?.trim() || ''
  const persistedRotatedAt = Number(localStore.get('rustdeskPasswordRotatedAt') ?? 0)
  const rotationDue = !persistedRotatedAt || now - persistedRotatedAt >= PASSWORD_ROTATION_INTERVAL_MS
  const shouldRotate = forceRotate || !persistedPassword || rotationDue

  if (!shouldRotate) {
    return {
      password: persistedPassword,
      rotatedAt: persistedRotatedAt,
      rotatedNow: false
    }
  }

  const nextPassword = generateSecurePassword()
  localStore.set('rustdeskPassword', nextPassword)
  localStore.set('rustdeskPasswordRotatedAt', now)

  return {
    password: nextPassword,
    rotatedAt: now,
    rotatedNow: true
  }
}

function resolveConfigFiles() {
  const roamingBase = process.env.APPDATA || app.getPath('appData')
  const windir = process.env.WINDIR || 'C:\\Windows'

  const configDirs = [
    path.join(roamingBase, 'RustDesk', 'config'),
    path.join(roamingBase, 'RustDesk'),
    path.join(windir, 'ServiceProfiles', 'LocalService', 'AppData', 'Roaming', 'RustDesk', 'config'),
    path.join(windir, 'ServiceProfiles', 'LocalService', 'AppData', 'Roaming', 'RustDesk')
  ]

  const files = configDirs.flatMap((dirPath) => [path.join(dirPath, 'RustDesk.toml'), path.join(dirPath, 'RustDesk2.toml')])
  return [...new Set(files)]
}

function runRustDeskCommand(binaryPath: string, args: string[]) {
  return new Promise<boolean>((resolve) => {
    let finished = false
    const child = spawn(binaryPath, args, {
      detached: false,
      windowsHide: true,
      stdio: 'ignore'
    })

    const timer = setTimeout(() => {
      if (!finished) {
        finished = true
        try {
          child.kill()
        } catch {
          // no-op
        }
        resolve(false)
      }
    }, RUSTDESK_COMMAND_TIMEOUT_MS)

    child.once('error', () => {
      if (finished) return
      finished = true
      clearTimeout(timer)
      resolve(false)
    })

    child.once('close', (code) => {
      if (finished) return
      finished = true
      clearTimeout(timer)
      resolve(code === 0)
    })
  })
}

function escapePowerShell(value: string) {
  return value.replace(/'/g, "''")
}

function runPowerShell(script: string) {
  return new Promise<boolean>((resolve) => {
    let finished = false
    const child = spawn(
      'powershell.exe',
      ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
      {
        detached: false,
        windowsHide: true,
        stdio: 'ignore'
      }
    )

    const timer = setTimeout(() => {
      if (!finished) {
        finished = true
        try {
          child.kill()
        } catch {
          // no-op
        }
        resolve(false)
      }
    }, RUSTDESK_COMMAND_TIMEOUT_MS)

    child.once('error', () => {
      if (finished) return
      finished = true
      clearTimeout(timer)
      resolve(false)
    })

    child.once('close', (code) => {
      if (finished) return
      finished = true
      clearTimeout(timer)
      resolve(code === 0)
    })
  })
}

async function lockRustDeskConfigFiles() {
  if (process.platform !== 'win32') return undefined
  if (!shouldLockConfig()) return undefined

  const existingFiles = resolveConfigFiles().filter((filePath) => fs.existsSync(filePath))
  if (!existingFiles.length) return undefined

  const fileList = existingFiles.map((filePath) => `'${escapePowerShell(filePath)}'`).join(', ')
  const lockScript = `
$targets = @(${fileList})
foreach ($target in $targets) {
  if (Test-Path -LiteralPath $target) {
    attrib +R $target | Out-Null
    icacls $target /inheritance:r | Out-Null
    icacls $target /grant:r *S-1-5-18:(F) *S-1-5-32-544:(F) *S-1-5-32-545:(R) | Out-Null
  }
}
`

  return runPowerShell(lockScript)
}

async function applyManagedConfig(binaryPath: string, password: string) {
  const configString = getConfigString()
  let configApplied = false
  let passwordApplied = false

  if (configString) {
    configApplied = await runRustDeskCommand(binaryPath, ['--config', configString])
  }

  if (password) {
    passwordApplied = await runRustDeskCommand(binaryPath, ['--password', password])
  }

  const lockApplied = await lockRustDeskConfigFiles()
  return {
    configApplied,
    passwordApplied,
    lockApplied,
    hasConfigString: Boolean(configString)
  }
}

interface EnforceOptions {
  forceRotate?: boolean
  rotationReason?: 'manual' | 'daily' | 'post_connection'
}

export function getRustDeskState(_deviceId?: string): RustDeskState {
  const rustdeskIdentity = resolveRustDeskIdentity()
  const binaryPath = resolveBinaryPath()
  const managedPassword = resolveManagedPassword(false)
  const hasConfigString = Boolean(getConfigString())
  return {
    binaryPath,
    installed: Boolean(binaryPath),
    accessCode: managedPassword.password,
    accessIdentity: rustdeskIdentity,
    passwordLastRotatedAt: managedPassword.rotatedAt,
    publicKeyConfigured: Boolean(process.env.RUSTDESK_PUBLIC_KEY),
    policyReady: hasConfigString
  }
}

export async function enforceRustDeskPolicy(_deviceId?: string, options: EnforceOptions = {}): Promise<RustDeskState> {
  const managedPassword = resolveManagedPassword(Boolean(options.forceRotate))
  const state = getRustDeskState()
  if (!state.binaryPath) {
    return {
      ...state,
      sessionHint: 'RustDesk nie znaleziony.'
    }
  }

  const policy = await applyManagedConfig(state.binaryPath, managedPassword.password)
  const policyMessages: string[] = []

  if (policy.hasConfigString) {
    policyMessages.push(policy.configApplied ? 'Konfiguracja serwera wymuszona.' : 'Nie udało się wymusić konfiguracji serwera.')
  } else {
    policyMessages.push('Brak RUSTDESK_CONFIG_STRING.')
  }

  if (managedPassword.password) {
    policyMessages.push(policy.passwordApplied ? 'Hasło stałe ustawione.' : 'Nie udało się ustawić hasła stałego.')
  }

  if (managedPassword.rotatedNow) {
    const rotationLabel =
      options.rotationReason === 'manual'
        ? 'Hasło zostało obrócone ręcznie.'
        : options.rotationReason === 'post_connection'
          ? 'Hasło zostało obrócone po sesji.'
          : 'Hasło zostało automatycznie obrócone (24h).'
    policyMessages.push(rotationLabel)
  }

  if (typeof policy.lockApplied === 'boolean') {
    policyMessages.push(policy.lockApplied ? 'Ręczna edycja konfiguracji zablokowana (ACL).' : 'Nie udało się zablokować edycji konfiguracji (ACL).')
  }

  return {
    ...state,
    accessCode: managedPassword.password,
    passwordLastRotatedAt: managedPassword.rotatedAt,
    configEnforced: policy.configApplied,
    configLocked: policy.lockApplied,
    sessionHint: policyMessages.join(' ')
  }
}

export async function rotateRustDeskPassword(reason: EnforceOptions['rotationReason'] = 'manual') {
  return enforceRustDeskPolicy(undefined, {
    forceRotate: true,
    rotationReason: reason
  })
}

export async function launchRustDesk(_deviceId?: string): Promise<RustDeskState> {
  const state = await enforceRustDeskPolicy(undefined, {
    forceRotate: false,
    rotationReason: 'daily'
  })
  if (!state.binaryPath) return state

  spawn(state.binaryPath, [], {
    detached: true,
    windowsHide: false,
    stdio: 'ignore'
  }).unref()

  return {
    ...state,
    lastLaunchAt: Date.now(),
    sessionHint: `RustDesk uruchomiony. ${state.sessionHint ?? ''}`.trim()
  }
}
