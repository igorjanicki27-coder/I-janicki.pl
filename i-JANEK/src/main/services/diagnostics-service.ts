import fs from 'node:fs/promises'
import path from 'node:path'
import { gzip } from 'node:zlib'
import { promisify } from 'node:util'
import { app, BrowserWindow, dialog } from 'electron'
import type { DiagnosticBundleSummary, DiagnosticLogLevel } from '@shared/contracts'

const gzipAsync = promisify(gzip)
const MAX_LOG_BYTES = 2 * 1024 * 1024
const MAX_LOG_FILES = 4
const MAX_BUNDLE_LOG_LINES = 600
const SENSITIVE_KEY = /token|password|secret|authorization|cookie|credential|cipher|private.?key|access.?code/i
const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi

function sanitizeString(value: string) {
  return value
    .replace(EMAIL, '[REDACTED_EMAIL]')
    .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi, 'Bearer [REDACTED]')
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[REDACTED_JWT]')
    .replace(/\bAIza[A-Za-z0-9_-]{20,}\b/g, '[REDACTED_API_KEY]')
    .replace(/\bGOCSPX-[A-Za-z0-9_-]+\b/g, '[REDACTED_OAUTH_SECRET]')
    .replace(/([?&](?:access_token|id_token|code|key)=)[^&\s]+/gi, '$1[REDACTED]')
    .replace(/\/Users\/[^/\s]+/g, '/Users/[REDACTED_USER]')
    .replace(/C:\\Users\\[^\\\s]+/gi, 'C:\\Users\\[REDACTED_USER]')
    .slice(0, 2000)
}

function logDirectory() {
  return path.join(app.getPath('userData'), 'logs')
}

function logPath(index = 0) {
  return path.join(logDirectory(), index ? `i-janek.${index}.jsonl` : 'i-janek.jsonl')
}

function sanitize(value: unknown, key = '', depth = 0): unknown {
  if (SENSITIVE_KEY.test(key)) return '[REDACTED]'
  if (depth > 7) return '[TRUNCATED]'
  if (typeof value === 'string') return sanitizeString(value)
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) return value
  if (value instanceof Error) {
    return { name: value.name, message: sanitize(value.message, 'message', depth + 1) }
  }
  if (Array.isArray(value)) return value.slice(0, 100).map((entry) => sanitize(entry, '', depth + 1))
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([entryKey, entryValue]) => [
        entryKey,
        sanitize(entryValue, entryKey, depth + 1)
      ])
    )
  }
  return String(value ?? '')
}

async function rotateIfNeeded() {
  try {
    const stats = await fs.stat(logPath())
    if (stats.size < MAX_LOG_BYTES) return
  } catch {
    return
  }

  for (let index = MAX_LOG_FILES - 1; index >= 1; index -= 1) {
    try {
      await fs.rename(logPath(index - 1), logPath(index))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
  }
}

export async function writeDiagnosticLog(
  level: DiagnosticLogLevel,
  event: string,
  details: Record<string, unknown> = {}
) {
  try {
    await fs.mkdir(logDirectory(), { recursive: true, mode: 0o700 })
    await rotateIfNeeded()
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      event: event.replace(/[^a-zA-Z0-9_.:-]/g, '_').slice(0, 120),
      details: sanitize(details)
    }
    await fs.appendFile(logPath(), `${JSON.stringify(entry)}\n`, { encoding: 'utf8', mode: 0o600 })
  } catch (error) {
    console.warn('[i-JANEK] Nie udało się zapisać lokalnego logu diagnostycznego:', error)
  }
}

async function readRecentLogs() {
  const entries: unknown[] = []
  for (let index = MAX_LOG_FILES - 1; index >= 0; index -= 1) {
    try {
      const content = await fs.readFile(logPath(index), 'utf8')
      for (const line of content.split('\n').filter(Boolean)) {
        try {
          entries.push(JSON.parse(line))
        } catch {
          entries.push({ timestamp: null, level: 'warning', event: 'invalid_log_line' })
        }
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
  }
  return entries.slice(-MAX_BUNDLE_LOG_LINES)
}

export async function createDiagnosticBundle(
  summary: DiagnosticBundleSummary,
  parentWindow?: BrowserWindow | null
) {
  const now = new Date()
  const suggestedName = `i-janek-diagnostyka-${now.toISOString().slice(0, 10)}.json.gz`
  const selection = await dialog.showSaveDialog(parentWindow ?? undefined, {
    title: 'Zapisz bezpieczną paczkę diagnostyczną',
    defaultPath: path.join(app.getPath('downloads'), suggestedName),
    filters: [{ name: 'Skompresowana diagnostyka JSON', extensions: ['gz'] }]
  })
  if (selection.canceled || !selection.filePath) return { saved: false }

  const payload = sanitize({
    schemaVersion: 1,
    generatedAt: now.toISOString(),
    application: {
      name: app.getName(),
      version: app.getVersion(),
      packaged: app.isPackaged
    },
    runtime: {
      platform: process.platform,
      arch: process.arch,
      electron: process.versions.electron,
      node: process.versions.node
    },
    summary,
    logs: await readRecentLogs()
  })
  const compressed = await gzipAsync(Buffer.from(JSON.stringify(payload, null, 2), 'utf8'))
  await fs.writeFile(selection.filePath, compressed, { mode: 0o600 })
  await writeDiagnosticLog('info', 'diagnostic_bundle_saved', { fileName: path.basename(selection.filePath) })
  return { saved: true, path: selection.filePath }
}
