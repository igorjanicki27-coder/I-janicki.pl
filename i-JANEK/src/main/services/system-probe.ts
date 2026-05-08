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

function normalizeGpuTelemetry(graphics: Awaited<ReturnType<typeof si.graphics>>): DeviceTelemetry['gpu'] {
  const primaryController =
    graphics.controllers.find((controller) => !controller.external && (controller.utilizationGpu || controller.temperatureGpu || controller.model)) ??
    graphics.controllers.find((controller) => controller.utilizationGpu || controller.temperatureGpu || controller.model) ??
    graphics.controllers[0]

  if (!primaryController) return null

  const usagePercent = Number.isFinite(primaryController.utilizationGpu) ? Number(primaryController.utilizationGpu!.toFixed(1)) : null
  const memoryUsedPercent = Number.isFinite(primaryController.utilizationMemory)
    ? Number(primaryController.utilizationMemory!.toFixed(1))
    : Number.isFinite(primaryController.memoryUsed) && Number.isFinite(primaryController.memoryTotal) && primaryController.memoryTotal
      ? Number(((primaryController.memoryUsed! / primaryController.memoryTotal) * 100).toFixed(1))
      : null

  return {
    model: primaryController.model || primaryController.name || null,
    usagePercent,
    memoryUsedPercent,
    temperatureC: Number.isFinite(primaryController.temperatureGpu) ? Number(primaryController.temperatureGpu!.toFixed(1)) : null,
    driverVersion: primaryController.driverVersion ?? null
  }
}

async function resolveWindowsTimeSignals() {
  const bootTime = Date.now() - os.uptime() * 1000

  const script = `
$events = [PSCustomObject]@{
  cleanShutdown = (Get-WinEvent -FilterHashtable @{LogName='System'; Id=6006} -MaxEvents 1 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty TimeCreated | ForEach-Object { $_.ToString('o') })
  startup = (Get-WinEvent -FilterHashtable @{LogName='System'; Id=6005} -MaxEvents 1 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty TimeCreated | ForEach-Object { $_.ToString('o') })
  userRequested = (Get-WinEvent -FilterHashtable @{LogName='System'; Id=1074} -MaxEvents 1 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty TimeCreated | ForEach-Object { $_.ToString('o') })
  unexpected = (Get-WinEvent -FilterHashtable @{LogName='System'; Id=6008} -MaxEvents 1 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty TimeCreated | ForEach-Object { $_.ToString('o') })
  kernelPower = (Get-WinEvent -FilterHashtable @{LogName='System'; Id=41} -MaxEvents 1 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty TimeCreated | ForEach-Object { $_.ToString('o') })
}
$events | ConvertTo-Json -Depth 3
`
  const signals = await runWindowsScript(script)

  let lastShutdownAt: number | null = null
  if (signals.stdout) {
    try {
      const parsed = JSON.parse(signals.stdout) as Record<string, string | null | undefined>
      const candidates = [parsed.cleanShutdown, parsed.userRequested, parsed.unexpected, parsed.kernelPower]
        .map((entry) => (entry ? Date.parse(entry) : NaN))
        .filter((entry) => Number.isFinite(entry)) as number[]
      if (candidates.length) {
        lastShutdownAt = Math.max(...candidates)
      }
    } catch {
      lastShutdownAt = null
    }
  }

  return {
    lastRestartAt: Number.isFinite(bootTime) ? Math.floor(bootTime) : null,
    lastShutdownAt
  }
}

export async function collectTelemetry(): Promise<DeviceTelemetry> {
  const [temp, mem, fsSize, processes, timeSignals, currentLoad, graphics] = await Promise.all([
    si.cpuTemperature(),
    si.mem(),
    si.fsSize(),
    si.processes(),
    resolveWindowsTimeSignals(),
    si.currentLoad(),
    si.graphics()
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
    cpuUsagePercent: Number(currentLoad.currentLoad.toFixed(1)),
    cpuTemperatureC: cpu.current,
    cpuHotZones: cpu.zones,
    gpu: normalizeGpuTelemetry(graphics),
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
