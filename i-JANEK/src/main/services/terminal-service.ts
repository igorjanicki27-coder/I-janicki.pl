import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import type { CommandShell, TerminalCommand } from '@shared/contracts'

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
      resolve(completed)
    })
  })
}
