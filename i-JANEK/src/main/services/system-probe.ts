import os from 'node:os'
import si from 'systeminformation'
import type { DeviceTelemetry, DeviceHealthState, InventoryReport, ProcessUsage } from '@shared/contracts'
import { DEFAULT_ALERT_CPU_TEMP, DEFAULT_ALERT_DISK_USAGE } from '@shared/constants'
import { runWindowsScript } from './windows-shell'

function normalizeCpuTemp(raw: Awaited<ReturnType<typeof si.cpuTemperature>>): { current: number | null; zones: Array<{ label: string; temperatureC: number | null }> } {
  const zones = raw.cores.map((temperature, index) => ({
    label: `Core ${index + 1}`,
    temperatureC: Number.isFinite(temperature) ? temperature : null
  }))

  return {
    current: Number.isFinite(raw.main) ? raw.main : zones.find((zone) => zone.temperatureC !== null)?.temperatureC ?? null,
    zones
  }
}

function resolveHealthState(cpuTemperatureC: number | null, diskUsage: number): DeviceHealthState {
  if ((cpuTemperatureC ?? 0) >= DEFAULT_ALERT_CPU_TEMP || diskUsage >= DEFAULT_ALERT_DISK_USAGE) {
    return 'alert'
  }
  if ((cpuTemperatureC ?? 0) >= DEFAULT_ALERT_CPU_TEMP - 10 || diskUsage >= DEFAULT_ALERT_DISK_USAGE - 10) {
    return 'warning'
  }
  return 'healthy'
}

async function resolveWindowsTimeSignals() {
  const bootTime = Date.now() - os.uptime() * 1000

  const shutdown = await runWindowsScript(
    "(Get-WinEvent -FilterHashtable @{LogName='System'; Id=1074} -MaxEvents 1 | Select-Object -ExpandProperty TimeCreated).ToString('o')"
  )

  return {
    lastRestartAt: Number.isFinite(bootTime) ? Math.floor(bootTime) : null,
    lastShutdownAt: shutdown.stdout ? Date.parse(shutdown.stdout) || null : null
  }
}

export async function collectTelemetry(): Promise<DeviceTelemetry> {
  const [temp, mem, fsSize, processes, timeSignals] = await Promise.all([
    si.cpuTemperature(),
    si.mem(),
    si.fsSize(),
    si.processes(),
    resolveWindowsTimeSignals()
  ])

  const cpu = normalizeCpuTemp(temp)
  const disks = fsSize.map((disk) => ({
    fs: disk.fs,
    mount: disk.mount,
    usedPercent: Number(disk.use?.toFixed(1) ?? 0),
    sizeGb: Number((disk.size / 1024 / 1024 / 1024).toFixed(1))
  }))

  const topProcesses: ProcessUsage[] = processes.list
    .sort((a, b) => (b.cpu + b.memRss) - (a.cpu + a.memRss))
    .slice(0, 10)
    .map((processEntry) => ({
      pid: processEntry.pid,
      name: processEntry.name,
      cpuPercent: Number(processEntry.cpu.toFixed(1)),
      memoryPercent: Number(((processEntry.memRss / mem.total) * 100).toFixed(1)),
      path: processEntry.path
    }))

  const maxDiskUsage = Math.max(...disks.map((disk) => disk.usedPercent), 0)

  return {
    capturedAt: Date.now(),
    cpuTemperatureC: cpu.current,
    cpuHotZones: cpu.zones,
    memoryUsedPercent: Number((((mem.total - mem.available) / mem.total) * 100).toFixed(1)),
    disks,
    uptimeSeconds: os.uptime(),
    lastRestartAt: timeSignals.lastRestartAt,
    lastShutdownAt: timeSignals.lastShutdownAt,
    topProcesses,
    state: resolveHealthState(cpu.current, maxDiskUsage)
  }
}

async function getInstalledApps() {
  const script = `
$paths = @(
  "HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*",
  "HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*",
  "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*"
)
$apps = foreach ($path in $paths) {
  Get-ItemProperty $path -ErrorAction SilentlyContinue |
    Where-Object { $_.DisplayName } |
    Select-Object DisplayName, DisplayVersion, Publisher
}
$apps | Sort-Object DisplayName -Unique | ConvertTo-Json -Depth 4
`

  const result = await runWindowsScript(script)
  if (!result.stdout) return []

  try {
    const parsed = JSON.parse(result.stdout)
    return (Array.isArray(parsed) ? parsed : [parsed]).map((app) => ({
      name: String(app.DisplayName),
      version: app.DisplayVersion ? String(app.DisplayVersion) : undefined,
      publisher: app.Publisher ? String(app.Publisher) : undefined
    }))
  } catch {
    return []
  }
}

async function getWindowsUpdates() {
  const result = await runWindowsScript('Get-HotFix | Select-Object HotFixID, InstalledOn, Description | ConvertTo-Json -Depth 4')
  if (!result.stdout) return []

  try {
    const parsed = JSON.parse(result.stdout)
    return (Array.isArray(parsed) ? parsed : [parsed]).map((update) => ({
      id: String(update.HotFixID),
      installedOn: update.InstalledOn ? String(update.InstalledOn) : undefined,
      description: update.Description ? String(update.Description) : undefined
    }))
  } catch {
    return []
  }
}

async function getDefenderStatus() {
  const result = await runWindowsScript('Get-MpComputerStatus | ConvertTo-Json -Depth 4')
  if (!result.stdout) return {}

  try {
    return JSON.parse(result.stdout) as Record<string, string | number | boolean | null>
  } catch {
    return {}
  }
}

export async function collectInventory(): Promise<InventoryReport> {
  const [system, baseboard, bios, memLayout, diskLayout, installedApps, windowsUpdates, defender] = await Promise.all([
    si.system(),
    si.baseboard(),
    si.bios(),
    si.memLayout(),
    si.diskLayout(),
    getInstalledApps(),
    getWindowsUpdates(),
    getDefenderStatus()
  ])

  return {
    capturedAt: Date.now(),
    hardware: {
      manufacturer: system.manufacturer,
      model: system.model,
      serial: system.serial,
      baseboard: [baseboard.manufacturer, baseboard.model].filter(Boolean).join(' '),
      biosVersion: bios.version,
      ramSlots: memLayout.map((slot) => ({
        bank: slot.bank,
        sizeGb: Number((slot.size / 1024 / 1024 / 1024).toFixed(1)),
        type: slot.type,
        serial: slot.serialNum
      })),
      disks: diskLayout.map((disk) => ({
        name: disk.name,
        serial: disk.serialNum,
        sizeGb: Number((disk.size / 1024 / 1024 / 1024).toFixed(1)),
        type: disk.type
      }))
    },
    installedApps,
    windowsUpdates,
    defender
  }
}
