import path from 'node:path'
import { spawn } from 'node:child_process'

export function spawnWindowsUpdateWatcher(powershellArgs: string[]) {
  const systemDir = path.win32.join(process.env.WINDIR || 'C:\\Windows', 'System32')
  const consoleHost = path.win32.join(systemDir, 'conhost.exe')
  const powershell = path.win32.join(systemDir, 'WindowsPowerShell', 'v1.0', 'powershell.exe')
  // DETACHED_PROCESS deprives PowerShell of a console and can make it exit
  // before executing -File. Detach the headless console host instead; it gives
  // PowerShell a console without displaying a window or depending on Electron.
  return spawn(consoleHost, ['--headless', powershell, ...powershellArgs], {
    detached: true,
    windowsHide: true,
    stdio: 'ignore'
  })
}
