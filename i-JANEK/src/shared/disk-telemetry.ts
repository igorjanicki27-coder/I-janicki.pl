import type { DiskTelemetry } from './contracts'

export const MAX_LOCAL_DISKS = 5

export function getLocalDisks(disks: readonly DiskTelemetry[] = []): DiskTelemetry[] {
  const seen = new Set<string>()
  return disks.filter((disk) => {
    // Old Windows telemetry has only a drive letter; it cannot distinguish a
    // mapped share from a local disk. Wait for a classified sample in that case.
    const local = disk.isLocal === true || (disk.isLocal === undefined && disk.fs.startsWith('/dev/'))
    if (!local || !Number.isFinite(disk.usedPercent) || disk.usedPercent < 0 || disk.usedPercent > 100 || !Number.isFinite(disk.sizeGb) || disk.sizeGb <= 0) return false
    const mount = (disk.mount || disk.fs).replace(/\\/g, '/').replace(/\/$/, '')
    const key = /^[a-z]:$/i.test(mount) ? mount.toUpperCase() : mount
    if (seen.has(key)) return false
    seen.add(key)
    return true
  }).sort((a, b) => a.mount.localeCompare(b.mount)).slice(0, MAX_LOCAL_DISKS)
}

export function getMaxLocalDiskUsage(disks: readonly DiskTelemetry[] = []): number | null {
  const local = getLocalDisks(disks)
  return local.length ? Math.max(...local.map((disk) => disk.usedPercent)) : null
}
