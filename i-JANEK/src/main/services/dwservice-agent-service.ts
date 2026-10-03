import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { app } from 'electron'
import type { DwServiceAgentState } from '@shared/contracts'

const INSTALLATION_CODE_PATTERN = /^\d{3}-\d{3}-\d{3}$/u
const CONFIGURATION_ID_PATTERN = /^[A-Za-z0-9-]{8,80}$/u
const DEVICE_ID_PATTERN = /^[A-Z0-9_]{3,160}$/u
const FIREBASE_PROJECT_ID_PATTERN = /^[a-z0-9][a-z0-9-]{4,61}[a-z0-9]$/u

interface DwServiceAssignmentProof {
  deviceId: string
  firebaseIdToken: string
  firebaseProjectId: string
}

function statePath() {
  if (process.platform === 'win32') {
    return path.join(process.env.ProgramData || 'C:\\ProgramData', 'i-JANEK', 'dwservice-status.json')
  }
  if (process.platform === 'darwin') {
    return '/Library/Application Support/i-JANEK/dwservice-status.json'
  }
  return path.join(app.getPath('userData'), 'dwservice-status.json')
}

function normalizeState(value: unknown): DwServiceAgentState {
  if (!value || typeof value !== 'object') return { status: 'unconfigured' }
  const record = value as Record<string, unknown>
  const allowed = new Set(['unconfigured', 'pending', 'installing', 'ready', 'error'])
  const status = allowed.has(String(record.status))
    ? String(record.status) as DwServiceAgentState['status']
    : 'unconfigured'
  return {
    status,
    ...(typeof record.appliedCodeHash === 'string' ? { appliedCodeHash: record.appliedCodeHash } : {}),
    ...(typeof record.configurationId === 'string' ? { configurationId: record.configurationId } : {}),
    ...(typeof record.updatedAt === 'number' ? { updatedAt: record.updatedAt } : {}),
    ...(typeof record.error === 'string' ? { error: record.error } : {})
  }
}

export function getDwServiceAgentState(): DwServiceAgentState {
  try {
    return normalizeState(JSON.parse(fs.readFileSync(statePath(), 'utf8')))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.warn('[i-JANEK] Nie udało się odczytać stanu DWService:', error)
    }
    return { status: 'unconfigured' }
  }
}

function validateRequest(installationCode: string, configurationId: string) {
  const code = installationCode.trim()
  const id = configurationId.trim()
  if (!INSTALLATION_CODE_PATTERN.test(code)) throw new Error('Kod DWService musi mieć format 123-456-789.')
  if (!CONFIGURATION_ID_PATTERN.test(id)) throw new Error('Nieprawidłowy identyfikator konfiguracji DWService.')
  return { code, id }
}

function validateProof(proof: DwServiceAssignmentProof) {
  const deviceId = proof?.deviceId?.trim()
  const firebaseIdToken = proof?.firebaseIdToken?.trim()
  const firebaseProjectId = proof?.firebaseProjectId?.trim()
  if (!DEVICE_ID_PATTERN.test(deviceId)) throw new Error('Nieprawidłowy identyfikator urządzenia dla DWService.')
  if (!FIREBASE_PROJECT_ID_PATTERN.test(firebaseProjectId)) throw new Error('Nieprawidłowy identyfikator projektu Firebase.')
  if (!firebaseIdToken || firebaseIdToken.length > 8192 || firebaseIdToken.split('.').length !== 3) {
    throw new Error('Brakuje prawidłowego potwierdzenia sesji Firebase.')
  }
  return { deviceId, firebaseIdToken, firebaseProjectId }
}

function writeWindowsRequest(installationCode: string, configurationId: string, proof: DwServiceAssignmentProof) {
  const root = path.join(process.env.ProgramData || 'C:\\ProgramData', 'i-JANEK')
  const requestDir = path.join(root, 'requests')
  if (!fs.existsSync(path.join(root, 'agent-config.json'))) {
    throw new Error('Brakuje systemowego agenta i-JANEK. Zainstaluj ponownie aplikację dla wszystkich użytkowników.')
  }
  fs.mkdirSync(requestDir, { recursive: true })
  const finalPath = path.join(requestDir, `dwservice-${configurationId}.json`)
  if (fs.existsSync(finalPath)) {
    return { status: 'pending', configurationId, updatedAt: Date.now() } satisfies DwServiceAgentState
  }
  const temporaryPath = `${finalPath}.${process.pid}.tmp`
  fs.writeFileSync(temporaryPath, JSON.stringify({ installationCode, configurationId, ...proof, requestedAt: Date.now() }), {
    encoding: 'utf8',
    flag: 'wx',
    mode: 0o600
  })
  fs.renameSync(temporaryPath, finalPath)
  return { status: 'pending', configurationId, updatedAt: Date.now() } satisfies DwServiceAgentState
}

function shellQuote(value: string) {
  return `'${value.replace(/'/gu, `'"'"'`)}'`
}

function appleScriptQuote(value: string) {
  return value.replace(/\\/gu, '\\\\').replace(/"/gu, '\\"')
}

async function runMacConfiguration(installationCode: string, configurationId: string) {
  const temporaryDir = fs.mkdtempSync(path.join(os.tmpdir(), 'i-janek-dwservice-'))
  const codePath = path.join(temporaryDir, 'installation-code')
  fs.writeFileSync(codePath, installationCode, { encoding: 'utf8', mode: 0o600, flag: 'wx' })
  const scriptPath = path.join(process.resourcesPath, 'resources', 'scripts', 'configure-dwservice-macos.sh')
  if (!fs.existsSync(scriptPath)) {
    fs.rmSync(temporaryDir, { recursive: true, force: true })
    throw new Error('Brakuje skryptu konfiguracji DWService w instalacji i-JANEK.')
  }

  const command = [
    '/bin/sh',
    shellQuote(scriptPath),
    '--code-file',
    shellQuote(codePath),
    '--configuration-id',
    shellQuote(configurationId)
  ].join(' ')

  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn('/usr/bin/osascript', [
        '-e',
        `do shell script "${appleScriptQuote(command)}" with administrator privileges`
      ], { stdio: ['ignore', 'ignore', 'pipe'] })
      let errorOutput = ''
      child.stderr.setEncoding('utf8')
      child.stderr.on('data', (chunk: string) => { errorOutput += chunk })
      child.once('error', reject)
      child.once('close', (code) => {
        if (code === 0) resolve()
        else reject(new Error(errorOutput.trim() || `Konfigurator DWService zakończył się kodem ${code ?? 'nieznanym'}.`))
      })
    })
    return getDwServiceAgentState()
  } finally {
    fs.rmSync(temporaryDir, { recursive: true, force: true })
  }
}

export async function applyDwServiceInstallationCode(
  installationCode: string,
  configurationId: string,
  assignmentProof: DwServiceAssignmentProof
) {
  const { code, id } = validateRequest(installationCode, configurationId)
  const current = getDwServiceAgentState()
  if (current.configurationId === id && (current.status === 'pending' || current.status === 'installing' || current.status === 'ready')) {
    return current
  }
  if (process.platform === 'win32') return writeWindowsRequest(code, id, validateProof(assignmentProof))
  if (process.platform === 'darwin') return runMacConfiguration(code, id)
  throw new Error('Automatyczna konfiguracja DWService jest obsługiwana tylko w Windows i macOS.')
}
