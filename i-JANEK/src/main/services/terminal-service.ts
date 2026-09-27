import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { app } from 'electron'
import type { CommandShell, TerminalCommand } from '@shared/contracts'

const COMMAND_TIMEOUT_MS = 5 * 60 * 1000
const MAX_OUTPUT_BYTES = 1024 * 1024

function appendWithLimit(current: string, chunk: unknown) {
  if (Buffer.byteLength(current, 'utf8') >= MAX_OUTPUT_BYTES) return current
  const next = `${current}${String(chunk)}`
  if (Buffer.byteLength(next, 'utf8') <= MAX_OUTPUT_BYTES) return next
  return `${Buffer.from(next, 'utf8').subarray(0, MAX_OUTPUT_BYTES).toString('utf8')}\n[wynik skrócony przez i-JANEK]`
}

async function persistTerminalAudit(command: TerminalCommand) {
  const safeDeviceId = command.deviceId.replace(/[^A-Za-z0-9_.-]/g, '_') || 'UNKNOWN_DEVICE'
  const directory = path.join(app.getPath('userData'), 'audit', 'terminal', safeDeviceId)
  const day = new Date(command.requestedAt).toISOString().slice(0, 10)
  const entry = `${JSON.stringify(command)}\n`
  await fs.mkdir(directory, { recursive: true })
  await fs.appendFile(path.join(directory, `${day}.jsonl`), entry, 'utf8')
}

export async function executeTerminalCommand(
  shell: CommandShell,
  command: string,
  deviceId = 'UNKNOWN_DEVICE',
  requestedBy = 'master'
): Promise<TerminalCommand> {
  const startedAt = Date.now()
  const terminalCommand: TerminalCommand = {
    id: randomUUID(),
    deviceId,
    shell,
    command,
    requestedBy,
    requestedAt: startedAt,
    status: 'running'
  }

  return new Promise((resolve) => {
    const effectiveShell: CommandShell = process.platform === 'darwin' ? 'shell' : shell
    const executable = effectiveShell === 'shell' ? '/bin/zsh' : effectiveShell === 'cmd' ? 'cmd.exe' : 'powershell.exe'
    const args = effectiveShell === 'shell'
      ? ['-lc', command]
      : effectiveShell === 'cmd'
        ? ['/Q', '/C', command]
        : ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-Command', command]

    const child = spawn(executable, args, {
      windowsHide: true
    })

    let stdout = ''
    let stderr = ''

    let settled = false
    const timeout = setTimeout(() => {
      if (settled) return
      try {
        child.kill('SIGTERM')
      } catch {
        // no-op
      }
    }, COMMAND_TIMEOUT_MS)

    child.stdout.on('data', (chunk) => {
      stdout = appendWithLimit(stdout, chunk)
    })

    child.stderr.on('data', (chunk) => {
      stderr = appendWithLimit(stderr, chunk)
    })

    child.on('error', (error) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      const failed: TerminalCommand = {
        ...terminalCommand,
        shell: effectiveShell,
        status: 'failed',
        error: error.message,
        finishedAt: Date.now()
      }
      void persistTerminalAudit(failed).catch(() => undefined)
      resolve(failed)
    })

    child.on('close', (code) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      const completed: TerminalCommand = {
        ...terminalCommand,
        shell: effectiveShell,
        status: code === 0 ? 'completed' : 'failed',
        output: stdout.trim(),
        error: stderr.trim() || (code === null ? 'Polecenie przekroczyło limit 5 minut.' : undefined),
        finishedAt: Date.now()
      }
      void persistTerminalAudit(completed).catch(() => undefined)
      resolve(completed)
    })
  })
}
