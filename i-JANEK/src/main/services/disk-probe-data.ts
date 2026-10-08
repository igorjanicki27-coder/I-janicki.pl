import type { DiskTelemetry } from '@shared/contracts'

export function normalizeWindowsDisks(raw: unknown): DiskTelemetry[] {
  const entries = Array.isArray(raw) ? raw : raw && typeof raw === 'object' ? [raw] : []
  return entries.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return []
    const { DeviceID, DriveType, Size, FreeSpace } = entry
    const size = Number(Size)
    const free = Number(FreeSpace)
    if (![2, 3, 6].includes(DriveType) || typeof DeviceID !== 'string' || !/^[a-z]:$/i.test(DeviceID)
      || Size == null || FreeSpace == null || !Number.isFinite(size) || !Number.isFinite(free)
      || size <= 0 || free < 0 || free > size) return []
    return [{
      fs: DeviceID.toUpperCase(), mount: DeviceID.toUpperCase(),
      usedPercent: Number(((1 - free / size) * 100).toFixed(1)),
      sizeGb: Number((size / 1024 ** 3).toFixed(1)), isLocal: true
    }]
  })
}

interface FileSystemUsage {
  fs: string
  mount: string
  type: string
  use: number
  size: number
}

export function normalizeUnixDisks(entries: readonly FileSystemUsage[]): DiskTelemetry[] {
  return entries.filter((disk) => {
    const type = disk.type.toLowerCase()
    if (/^(nfs\d*|smbfs|cifs|sshfs|fuse\.sshfs|afpfs|davfs2?|9p|virtiofs)$/.test(type)
      || disk.fs.startsWith('//') || disk.fs.startsWith('\\\\') || /^[^/]+:/.test(disk.fs)) return false
    return disk.fs.startsWith('/dev/') || type === 'zfs'
  }).map((disk) => ({
    fs: disk.fs, mount: disk.mount,
    usedPercent: Number(disk.use.toFixed(1)),
    sizeGb: Number((disk.size / 1024 ** 3).toFixed(1)), isLocal: true
  }))
}
