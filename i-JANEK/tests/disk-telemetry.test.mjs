import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'

async function load(file) {
  const source = await fs.readFile(new URL(file, import.meta.url), 'utf8')
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 }
  }).outputText
  return import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`)
}
const { getLocalDisks, getMaxLocalDiskUsage } = await load('../src/shared/disk-telemetry.ts')
const { normalizeWindowsDisks, normalizeUnixDisks } = await load('../src/main/services/disk-probe-data.ts')
const gib = 1024 ** 3
const drive = (DeviceID, DriveType = 3, total = 254, free = 173) => ({ DeviceID, DriveType, Size: total * gib, FreeSpace: free * gib })

test('Parallels C: is 31.9% full; mapped Mac shares and DVD never affect disk health', () => {
  const raw = [drive('C:'), drive('U:', 4, 465, 239), ...['V:', 'W:', 'X:', 'Y:', 'Z:'].map(id => drive(id, 4, 228, 38.1)), drive('D:', 5)]
  const disks = getLocalDisks(normalizeWindowsDisks(raw))
  assert.deepEqual(disks.map(disk => [disk.mount, disk.usedPercent]), [['C:', 31.9]])
  assert.equal(getMaxLocalDiskUsage(disks), 31.9)
})

test('all local volumes including USB are listed, in order, with a maximum of five', () => {
  const raw = ['H:', 'G:', 'F:', 'E:', 'D:', 'C:'].map((id, index) => drive(id, index === 0 ? 2 : 3, 100, 50))
  assert.deepEqual(getLocalDisks(normalizeWindowsDisks(raw)).map(disk => disk.mount), ['C:', 'D:', 'E:', 'F:', 'G:'])
  assert.equal(normalizeWindowsDisks(drive('E:', 2))[0].isLocal, true)
})

test('a local volume with high usage still raises the maximum; a fuller network drive does not', () => {
  const disks = [
    ...normalizeWindowsDisks([drive('C:', 3, 100, 60), drive('E:', 3, 100, 10)]),
    { fs: 'Z:', mount: 'Z:', usedPercent: 99, sizeGb: 100, isLocal: false }
  ]
  assert.equal(getMaxLocalDiskUsage(disks), 90)
})

test('unclassified old Windows telemetry is unavailable until a new sample, regardless of drive letter', () => {
  const disks = ['C:', 'Z:'].map(mount => ({ fs: mount, mount, usedPercent: 83.3, sizeGb: 228 }))
  assert.deepEqual(getLocalDisks(disks), [])
  assert.equal(getMaxLocalDiskUsage(disks), null)
  assert.equal(getMaxLocalDiskUsage(), null)
})

test('invalid or empty volume measurements do not fabricate a percentage', () => {
  for (const change of [{ Size: 0 }, { FreeSpace: null }, { FreeSpace: -1 }, { FreeSpace: 500 * gib }, { Size: NaN }, { DeviceID: '\\\\Mac\\Home' }]) {
    assert.deepEqual(normalizeWindowsDisks({ ...drive('C:'), ...change }), [])
  }
  assert.deepEqual(normalizeWindowsDisks(null), [])
  assert.deepEqual(normalizeWindowsDisks('100%'), [])
})

test('local Mac volumes remain while SMB, NFS and Parallels shared folders are excluded', () => {
  const fsUsage = (fs, mount, type, use = 40) => ({ fs, mount, type, use, size: 100 * gib })
  const disks = normalizeUnixDisks([
    fsUsage('/dev/disk3s1', '/', 'APFS'), fsUsage('/dev/disk4s1', '/Volumes/SSD', 'APFS'),
    fsUsage('//server/share', '/Volumes/share', 'smbfs', 99),
    fsUsage('server:/data', '/mnt/nfs', 'nfs4', 98),
    fsUsage('Mac', '/mnt/mac', 'virtiofs', 97)
  ])
  assert.deepEqual(getLocalDisks(disks).map(disk => disk.mount), ['/', '/Volumes/SSD'])
  assert.equal(getMaxLocalDiskUsage(disks), 40)
})

test('duplicate drive mounts and invalid telemetry do not consume the five available slots', () => {
  const disks = normalizeWindowsDisks([drive('C:'), drive('c:'), drive('E:')])
  disks.push({ fs: 'Z:', mount: 'Z:', usedPercent: NaN, sizeGb: 100, isLocal: true })
  assert.deepEqual(getLocalDisks(disks).map(disk => disk.mount), ['C:', 'E:'])
})
