import si from 'systeminformation'
import { getLocalDisks } from '@shared/disk-telemetry'
import { runWindowsScript } from './windows-shell'
import { normalizeWindowsDisks, normalizeUnixDisks } from './disk-probe-data'

export async function collectLocalDisks() {
  if (process.platform === 'win32') {
    const result = await runWindowsScript(`
$ErrorActionPreference = 'Stop'
$disks = @(Get-CimInstance -ClassName Win32_LogicalDisk -Filter 'DriveType=2 OR DriveType=3 OR DriveType=6' |
  Select-Object DeviceID, DriveType, Size, FreeSpace)
ConvertTo-Json -InputObject $disks -Compress
`, 15_000)
    try {
      return getLocalDisks(normalizeWindowsDisks(JSON.parse(result.stdout)))
    } catch {
      // Do not fall back to fsSize(): it omits DriveType on Windows and could
      // reintroduce network drives into the dashboard and alerts.
      return []
    }
  }
  return getLocalDisks(normalizeUnixDisks(await si.fsSize()))
}
