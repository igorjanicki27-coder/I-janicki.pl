import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import type { CommandShell, TerminalCommand } from '@shared/contracts'

function formatLocalDate(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatLocalTimestamp(date: Date) {
  const datePart = formatLocalDate(date)
  const hour = String(date.getHours()).padStart(2, '0')
  const minute = String(date.getMinutes()).padStart(2, '0')
  const second = String(date.getSeconds()).padStart(2, '0')
  return `${datePart} ${hour}:${minute}:${second}`
}

async function persistTerminalHistory(command: TerminalCommand) {
  const basePath = path.join(os.homedir(), 'i-JANEK', 'terminal', command.deviceId || 'UNKNOWN_DEVICE')
  const now = new Date()
  const day = formatLocalDate(now)
  const filePath = path.join(basePath, `${day}.txt`)
  const timestamp = formatLocalTimestamp(now)
  const output = (command.output || '').trim()
  const error = (command.error || '').trim()
  const logBlock = [
    `[${timestamp}]`,
    `Shell: ${command.shell}`,
    `RequestedBy: ${command.requestedBy}`,
    `Status: ${command.status}`,
    `Command: ${command.command}`,
    output ? `Output:\n${output}` : 'Output: <empty>',
    error ? `Error:\n${error}` : 'Error: <none>',
    ''.padStart(80, '-'),
    ''
  ].join('\n')

  await fs.mkdir(basePath, { recursive: true })
  await fs.appendFile(filePath, logBlock, 'utf8')
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
    const executable = shell === 'cmd' ? 'cmd.exe' : 'powershell.exe'
    const args =
      shell === 'cmd'
        ? ['/Q', '/C', command]
        : ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-Command', command]

    const child = spawn(executable, args, {
      windowsHide: true
    })

    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString()
    })

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })

    child.on('error', (error) => {
      const failed: TerminalCommand = {
        ...terminalCommand,
        status: 'failed',
        error: error.message,
        finishedAt: Date.now()
      }
      void persistTerminalHistory(failed).catch(() => undefined)
      resolve(failed)
    })

    child.on('close', (code) => {
      const completed: TerminalCommand = {
        ...terminalCommand,
        status: code === 0 ? 'completed' : 'failed',
        output: stdout.trim(),
        error: stderr.trim() || undefined,
        finishedAt: Date.now()
      }
      void persistTerminalHistory(completed).catch(() => undefined)
      resolve(completed)
    })
  })
}
