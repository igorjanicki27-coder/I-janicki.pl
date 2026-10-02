import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import crypto from 'node:crypto'
import { app } from 'electron'
import type { RustDeskState } from '@shared/contracts'
import { localStore } from '../store'

const RUSTDESK_COMMAND_TIMEOUT_MS = 20_000
const PASSWORD_ROTATION_INTERVAL_MS = 24 * 60 * 60 * 1000
const PASSWORD_LENGTH = 20
const PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
const RUSTDESK_CONFIG_FILENAME = 'rustdesk-config.local.txt'

function hasAgentManagedConfig() {
  return process.platform === 'win32' && fs.existsSync(
    path.join(process.env.ProgramData || 'C:\\ProgramData', 'i-JANEK', 'rustdesk-policy-applied.txt')
  )
}

function resolveBinaryPath() {
  const configured = process.env.RUSTDESK_BINARY_PATH || localStore.get('rustdeskBinaryPath')
  if (configured && fs.existsSync(configured)) return configured

  const candidates = process.platform === 'darwin'
    ? [
        path.join(process.resourcesPath, 'resources', 'RustDesk.app', 'Contents', 'MacOS', 'RustDesk'),
        path.join(app.getAppPath(), 'resources', 'RustDesk.app', 'Contents', 'MacOS', 'RustDesk'),
        '/Applications/RustDesk.app/Contents/MacOS/RustDesk'
      ]
    : [
        path.join(process.resourcesPath, 'resources', 'rd-core.exe'),
        path.join(app.getAppPath(), 'resources', 'rd-core.exe'),
        path.join(process.env.ProgramFiles || 'C:\\Program Files', 'RustDesk', 'rustdesk.exe'),
        path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'RustDesk', 'rustdesk.exe')
      ]

  return candidates.find((candidate) => fs.existsSync(candidate))

}

function provisionPackagedRustDeskConfig() {
  if (!app.isPackaged) return

  const source = path.join(process.resourcesPath, 'resources', RUSTDESK_CONFIG_FILENAME)
  const destination = path.join(app.getPath('userData'), RUSTDESK_CONFIG_FILENAME)
  if (!fs.existsSync(source) || fs.existsSync(destination)) return

  try {
    fs.mkdirSync(path.dirname(destination), { recursive: true })
    fs.copyFileSync(source, destination, fs.constants.COPYFILE_EXCL)
    fs.chmodSync(destination, 0o600)
  } catch (error) {
    console.error('[i-JANEK] Nie udało się utrwalić konfiguracji RustDesk:', error)
  }
}

function getConfigCandidates() {
  provisionPackagedRustDeskConfig()
  return [
    path.join(app.getPath('userData'), RUSTDESK_CONFIG_FILENAME),
    path.join(process.resourcesPath, 'resources', RUSTDESK_CONFIG_FILENAME),
    path.join(app.getAppPath(), 'resources', RUSTDESK_CONFIG_FILENAME)
  ]
}

function readConfigStringFromFile() {
  for (const candidate of getConfigCandidates()) {
    if (!fs.existsSync(candidate)) continue
    const value = fs.readFileSync(candidate, 'utf8').trim()
    if (value && !value.startsWith('#')) return value
  }

  return ''
}

function getConfigString() {
  return process.env.RUSTDESK_CONFIG_STRING?.trim() || readConfigStringFromFile()
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
  const hasPrivilegedAgent = process.platform === 'win32' && fs.existsSync(
    path.join(process.env.ProgramData || 'C:\\ProgramData', 'i-JANEK', 'agent-config.json')
  )

  const configDirs = [
    path.join(roamingBase, 'RustDesk', 'config'),
    path.join(roamingBase, 'RustDesk'),
    ...(!hasPrivilegedAgent ? [
      path.join(windir, 'ServiceProfiles', 'LocalService', 'AppData', 'Roaming', 'RustDesk', 'config'),
      path.join(windir, 'ServiceProfiles', 'LocalService', 'AppData', 'Roaming', 'RustDesk')
    ] : [])
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

function runRustDeskCommandWithOutput(binaryPath: string, args: string[]) {
  return new Promise<string>((resolve) => {
    let finished = false
    let stdout = ''
    const child = spawn(binaryPath, args, {
      detached: false,
      windowsHide: true
    })

    child.stdout?.on('data', (chunk) => {
      stdout += chunk.toString()
    })

    const finish = (value: string) => {
      if (finished) return
      finished = true
      clearTimeout(timer)
      resolve(value.trim())
    }

    const timer = setTimeout(() => {
      try {
        child.kill()
      } catch {
        // no-op
      }
      finish('')
    }, RUSTDESK_COMMAND_TIMEOUT_MS)

    child.once('error', () => finish(''))
    child.once('close', (code) => finish(code === 0 ? stdout : ''))
  })
}

async function resolveRustDeskIdentity(binaryPath?: string) {
  if (binaryPath) {
    const output = await runRustDeskCommandWithOutput(binaryPath, ['--get-id'])
    const actualId = output.split(/\r?\n/u).map((entry) => entry.trim()).find(Boolean)
    if (actualId) {
      localStore.set('rustdeskIdentity', actualId)
      return actualId
    }
  }

  return localStore.get('rustdeskIdentity')?.trim() || undefined
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
  let configApplied = hasAgentManagedConfig()
  let passwordApplied = false

  if (configString) {
    configApplied = (await runRustDeskCommand(binaryPath, ['--config', configString])) || configApplied
  }

  if (password) {
    passwordApplied = await runRustDeskCommand(binaryPath, ['--password', password])
  }

  const lockApplied = await lockRustDeskConfigFiles()
  return {
    configApplied,
    passwordApplied,
    lockApplied,
    hasConfigString: Boolean(configString) || hasAgentManagedConfig()
  }
}

interface EnforceOptions {
  forceRotate?: boolean
  rotationReason?: 'manual' | 'daily' | 'post_connection'
}

export async function getRustDeskState(_deviceId?: string): Promise<RustDeskState> {
  const binaryPath = resolveBinaryPath()
  const rustdeskIdentity = await resolveRustDeskIdentity(binaryPath)
  const managedPassword = resolveManagedPassword(false)
  const hasConfigString = Boolean(getConfigString()) || hasAgentManagedConfig()
  const policyReady = Boolean(localStore.get('rustdeskPolicyReady'))
  const requiresPermissions = process.platform === 'darwin'
  return {
    binaryPath,
    installed: Boolean(binaryPath),
    platform: process.platform,
    accessCode: managedPassword.password,
    accessIdentity: rustdeskIdentity,
    passwordLastRotatedAt: managedPassword.rotatedAt,
    publicKeyConfigured: Boolean(process.env.RUSTDESK_PUBLIC_KEY),
    policyReady,
    unattendedReady: Boolean(binaryPath && rustdeskIdentity && managedPassword.password && hasConfigString && policyReady),
    requiresPermissions,
    permissionHint: requiresPermissions
      ? 'Na macOS użytkownik musi jednorazowo nadać modułowi zdalnego dostępu uprawnienia Dostępność i Nagrywanie ekranu.'
      : undefined
  }
}

export async function enforceRustDeskPolicy(_deviceId?: string, options: EnforceOptions = {}): Promise<RustDeskState> {
  const managedPassword = resolveManagedPassword(Boolean(options.forceRotate))
  const state = await getRustDeskState()
  if (!state.binaryPath) {
    localStore.set('rustdeskPolicyReady', false)
    return {
      ...state,
      sessionHint: 'RustDesk nie znaleziony.'
    }
  }

  const policy = await applyManagedConfig(state.binaryPath, managedPassword.password)
  const policyReady = Boolean(policy.configApplied && policy.passwordApplied)
  localStore.set('rustdeskPolicyReady', policyReady)
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
    policyReady,
    unattendedReady: Boolean(state.accessIdentity && policyReady),
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

  // The host must run in the background; starting without arguments opens the
  // RustDesk desktop window on the customer's computer.
  const host = spawn(state.binaryPath, ['--server'], {
    detached: true,
    windowsHide: true,
    stdio: 'ignore'
  })
  host.on('error', (error) => {
    console.error('[i-JANEK] Nie udało się uruchomić hosta zdalnego pulpitu:', error)
  })
  host.unref()

  return {
    ...state,
    lastLaunchAt: Date.now(),
    sessionHint: `Host zdalnego pulpitu uruchomiony w tle. ${state.sessionHint ?? ''}`.trim()
  }
}
