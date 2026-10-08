import { spawn } from 'node:child_process'

export interface ScriptResult {
  stdout: string
  stderr: string
}

export async function runWindowsScript(script: string, timeoutMs?: number): Promise<ScriptResult> {
  if (process.platform !== 'win32') {
    return { stdout: '', stderr: 'Windows-only command skipped on non-Windows platform.' }
  }

  return new Promise((resolve) => {
    const child = spawn(
      'powershell.exe',
      ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-Command', script],
      {
        windowsHide: true
      }
    )

    let stdout = ''
    let stderr = ''
    const timeout = timeoutMs === undefined ? undefined : setTimeout(() => {
      child.kill()
      resolve({ stdout: '', stderr: 'Windows command timed out.' })
    }, timeoutMs)

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString()
    })

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })

    child.on('close', () => {
      clearTimeout(timeout)
      resolve({ stdout: stdout.trim(), stderr: stderr.trim() })
    })
    child.on('error', (error) => {
      clearTimeout(timeout)
      resolve({ stdout: '', stderr: error.message })
    })
  })
}
