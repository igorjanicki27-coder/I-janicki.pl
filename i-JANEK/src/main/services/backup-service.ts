import fs from 'node:fs'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import mime from 'mime-types'
import { google } from 'googleapis'
import type { BackupPolicy, BackupRemoteFile, BackupSnapshot } from '@shared/contracts'
import { localStore } from '../store'

async function listFiles(rootPath: string): Promise<string[]> {
  const dirents = await fsp.readdir(rootPath, { withFileTypes: true })
  const nested = await Promise.all(
    dirents.map(async (dirent) => {
      const fullPath = path.join(rootPath, dirent.name)
      if (dirent.isDirectory()) return listFiles(fullPath)
      return [fullPath]
    })
  )
  return nested.flat()
}

function clearDeviceManifest(deviceId: string) {
  const manifest = localStore.get('backupManifest')
  const entry = manifest[deviceId]
  if (!entry) return

  localStore.set('backupManifest', {
    ...manifest,
    [deviceId]: {
      ...entry,
      fileStates: {}
    }
  })
}

function expandWindowsEnv(inputPath: string) {
  return inputPath.replace(/%([^%]+)%/g, (_match, variableName) => process.env[variableName] ?? `%${variableName}%`)
}

async function ensureFolder(drive: ReturnType<typeof google.drive>, name: string, parentId?: string) {
  const existing = await drive.files.list({
    q: [
      "mimeType = 'application/vnd.google-apps.folder'",
      `name = '${name.replace(/'/g, "\\'")}'`,
      parentId ? `'${parentId}' in parents` : undefined,
      'trashed = false'
    ]
      .filter(Boolean)
      .join(' and '),
    fields: 'files(id, name)'
  })

  const found = existing.data.files?.[0]
  if (found?.id) return found.id

  const created = await drive.files.create({
    requestBody: {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: parentId ? [parentId] : undefined
    },
    fields: 'id'
  })

  return created.data.id!
}

function createDriveClient(accessToken: string) {
  const driveAuth = new google.auth.OAuth2()
  driveAuth.setCredentials({ access_token: accessToken })
  return google.drive({ version: 'v3', auth: driveAuth })
}

async function findFolderId(drive: ReturnType<typeof google.drive>, name: string, parentId?: string) {
  const existing = await drive.files.list({
    q: [
      "mimeType = 'application/vnd.google-apps.folder'",
      `name = '${name.replace(/'/g, "\\'")}'`,
      parentId ? `'${parentId}' in parents` : undefined,
      'trashed = false'
    ]
      .filter(Boolean)
      .join(' and '),
    fields: 'files(id, name)',
    pageSize: 1
  })

  return existing.data.files?.[0]?.id
}

async function listDeviceFolderFiles(drive: ReturnType<typeof google.drive>, folderId: string) {
  const files: Array<{ id: string; name: string; size: string | null; modifiedTime: string | null }> = []
  let pageToken: string | undefined

  do {
    const response = await drive.files.list({
      q: [`'${folderId}' in parents`, "mimeType != 'application/vnd.google-apps.folder'", 'trashed = false'].join(' and '),
      fields: 'nextPageToken, files(id, name, size, modifiedTime)',
      pageSize: 1000,
      pageToken
    })

    files.push(...(response.data.files ?? []).map((entry) => ({
      id: entry.id!,
      name: entry.name ?? '',
      size: entry.size ?? null,
      modifiedTime: entry.modifiedTime ?? null
    })))
    pageToken = response.data.nextPageToken ?? undefined
  } while (pageToken)

  return files
}

function dedupeLatestFiles(files: Array<{ id: string; name: string; size: string | null; modifiedTime: string | null }>) {
  const latestByPath = new Map<string, { id: string; name: string; size: string | null; modifiedTime: string | null }>()

  for (const file of files.sort((left, right) => {
    const leftTime = left.modifiedTime ? Date.parse(left.modifiedTime) : 0
    const rightTime = right.modifiedTime ? Date.parse(right.modifiedTime) : 0
    return rightTime - leftTime
  })) {
    if (!file.name || latestByPath.has(file.name)) continue
    latestByPath.set(file.name, file)
  }

  return [...latestByPath.values()].sort((left, right) => left.name.localeCompare(right.name, 'pl'))
}

async function resolveDeviceFolderId(policy: BackupPolicy, drive: ReturnType<typeof google.drive>, hostname: string) {
  const rootFolderId = await findFolderId(drive, policy.driveFolderName)
  if (!rootFolderId) return null
  const deviceFolderId = await findFolderId(drive, hostname, rootFolderId)
  return deviceFolderId ?? null
}

export async function syncBackup(
  policy: BackupPolicy,
  accessToken: string,
  deviceId: string,
  hostname: string,
  onProgress?: (payload: { deviceId: string; totalFiles: number; processedFiles: number; uploadedFiles: number }) => void
): Promise<BackupSnapshot> {
  const manifest = localStore.get('backupManifest')
  const deviceManifest = manifest[deviceId]?.fileStates ?? {}
  const skippedReasons: BackupSnapshot['skippedReasons'] = []
  const drive = createDriveClient(accessToken)

  const rootFolderId = await ensureFolder(drive, policy.driveFolderName)
  const deviceFolderId = await ensureFolder(drive, hostname, rootFolderId)
  const remoteFiles = await listDeviceFolderFiles(drive, deviceFolderId)

  await drive.permissions.create({
    fileId: rootFolderId,
    requestBody: {
      role: 'writer',
      type: 'user',
      emailAddress: policy.sharedWith
    },
    sendNotificationEmail: false
  }).catch(() => undefined)

  let totalBytes = 0
  let totalFiles = 0
  let uploadedFiles = 0
  let currentRemoteUsageBytes = remoteFiles.reduce((sum, file) => sum + Number(file.size ?? 0), 0)
  const nextManifest: Record<string, number> = {}
  const maxQuotaBytes = policy.maxQuotaGb * 1024 * 1024 * 1024
  const maxFileSizeBytes = policy.maxFileSizeMb * 1024 * 1024
  const syncThreshold = policy.syncUnderMb * 1024 * 1024
  const fileQueue: Array<{ filePath: string; resolvedWatchedPath: string }> = []

  for (const watchedPath of policy.watchedPaths) {
    const resolvedWatchedPath = expandWindowsEnv(watchedPath)
    if (!fs.existsSync(resolvedWatchedPath)) continue

    const files = await listFiles(resolvedWatchedPath)
    for (const filePath of files) {
      fileQueue.push({ filePath, resolvedWatchedPath })
    }
  }
  const totalFilesToProcess = fileQueue.length
  let processedFiles = 0
  onProgress?.({ deviceId, totalFiles: totalFilesToProcess, processedFiles, uploadedFiles })

  for (const entry of fileQueue) {
    const stats = await fsp.stat(entry.filePath)
    if (!stats.isFile()) {
      processedFiles += 1
      onProgress?.({ deviceId, totalFiles: totalFilesToProcess, processedFiles, uploadedFiles })
      continue
    }

    totalFiles += 1
    totalBytes += stats.size
    nextManifest[entry.filePath] = stats.mtimeMs

    if (stats.size > maxFileSizeBytes) {
      skippedReasons.push({ path: entry.filePath, reason: 'File exceeds maxFileSizeMb policy.' })
      processedFiles += 1
      onProgress?.({ deviceId, totalFiles: totalFilesToProcess, processedFiles, uploadedFiles })
      continue
    }

    if (stats.size > syncThreshold) {
      skippedReasons.push({ path: entry.filePath, reason: 'File exceeds continuous sync threshold.' })
      processedFiles += 1
      onProgress?.({ deviceId, totalFiles: totalFilesToProcess, processedFiles, uploadedFiles })
      continue
    }

    if (currentRemoteUsageBytes + stats.size > maxQuotaBytes) {
      skippedReasons.push({ path: entry.filePath, reason: 'Device quota exceeded.' })
      processedFiles += 1
      onProgress?.({ deviceId, totalFiles: totalFilesToProcess, processedFiles, uploadedFiles })
      continue
    }

    if (deviceManifest[entry.filePath] && deviceManifest[entry.filePath] >= stats.mtimeMs) {
      processedFiles += 1
      onProgress?.({ deviceId, totalFiles: totalFilesToProcess, processedFiles, uploadedFiles })
      continue
    }

    const relativeName = path.relative(entry.resolvedWatchedPath, entry.filePath).replace(/\\/g, '/')
    await drive.files.create({
      requestBody: {
        name: relativeName,
        parents: [deviceFolderId]
      },
      media: {
        mimeType: mime.lookup(entry.filePath) || 'application/octet-stream',
        body: fs.createReadStream(entry.filePath)
      }
    })

    uploadedFiles += 1
    currentRemoteUsageBytes += stats.size
    processedFiles += 1
    onProgress?.({ deviceId, totalFiles: totalFilesToProcess, processedFiles, uploadedFiles })
  }

  if (!fileQueue.length) {
    onProgress?.({ deviceId, totalFiles: 0, processedFiles: 0, uploadedFiles: 0 })
  }

  const snapshot: BackupSnapshot = {
    scannedAt: Date.now(),
    totalFiles,
    totalBytes,
    uploadedFiles,
    skippedFiles: skippedReasons.length,
    skippedReasons
  }

  localStore.set('backupManifest', {
    ...manifest,
    [deviceId]: {
      ...snapshot,
      fileStates: nextManifest
    }
  })

  return snapshot
}

export async function removeBackupPathFromCloud(
  policy: BackupPolicy,
  accessToken: string,
  deviceId: string,
  hostname: string,
  watchedPath: string
): Promise<{ deletedFiles: number }> {
  const drive = createDriveClient(accessToken)
  const deviceFolderId = await resolveDeviceFolderId(policy, drive, hostname)
  if (!deviceFolderId) return { deletedFiles: 0 }

  const resolvedWatchedPath = expandWindowsEnv(watchedPath)
  const relativeNames = new Set<string>()

  if (fs.existsSync(resolvedWatchedPath)) {
    const files = await listFiles(resolvedWatchedPath)
    for (const filePath of files) {
      const relativeName = path.relative(resolvedWatchedPath, filePath).replace(/\\/g, '/')
      if (relativeName && relativeName !== '.') {
        relativeNames.add(relativeName)
      }
    }
  }

  const manifest = localStore.get('backupManifest')
  const manifestFiles = manifest[deviceId]?.fileStates ?? {}
  const normalizedPrefix = `${path.resolve(resolvedWatchedPath)}${path.sep}`
  for (const filePath of Object.keys(manifestFiles)) {
    const normalizedFilePath = path.resolve(filePath)
    if (!normalizedFilePath.startsWith(normalizedPrefix)) continue
    const relativeName = path.relative(path.resolve(resolvedWatchedPath), normalizedFilePath).replace(/\\/g, '/')
    if (relativeName && relativeName !== '.') {
      relativeNames.add(relativeName)
    }
  }

  if (!relativeNames.size) {
    return { deletedFiles: 0 }
  }

  const remoteFiles = await listDeviceFolderFiles(drive, deviceFolderId)
  let deletedFiles = 0
  for (const file of remoteFiles) {
    if (!file.id || !relativeNames.has(file.name)) continue
    await drive.files.delete({ fileId: file.id }).catch(() => undefined)
    deletedFiles += 1
  }

  clearDeviceManifest(deviceId)
  return { deletedFiles }
}

export async function listBackupFiles(policy: BackupPolicy, accessToken: string, hostname: string): Promise<BackupRemoteFile[]> {
  const drive = createDriveClient(accessToken)
  const deviceFolderId = await resolveDeviceFolderId(policy, drive, hostname)
  if (!deviceFolderId) return []

  const files = dedupeLatestFiles(await listDeviceFolderFiles(drive, deviceFolderId))
  return files.map((file) => ({
    path: file.name,
    sizeBytes: Number(file.size ?? 0),
    modifiedAt: file.modifiedTime ? Date.parse(file.modifiedTime) || null : null
  }))
}

export async function restoreBackup(policy: BackupPolicy, accessToken: string, hostname: string) {
  const drive = createDriveClient(accessToken)
  const deviceFolderId = await resolveDeviceFolderId(policy, drive, hostname)
  if (!deviceFolderId) {
    return {
      restoredFiles: 0,
      restoredBytes: 0,
      destinationPath: path.join(os.homedir(), 'Desktop', 'i-JANEK_backup_data')
    }
  }

  const destinationPath = path.join(os.homedir(), 'Desktop', 'i-JANEK_backup_data')
  await fsp.mkdir(destinationPath, { recursive: true })

  const files = dedupeLatestFiles(await listDeviceFolderFiles(drive, deviceFolderId))
  let restoredFiles = 0
  let restoredBytes = 0

  for (const file of files) {
    const targetPath = path.join(destinationPath, ...file.name.split('/'))
    await fsp.mkdir(path.dirname(targetPath), { recursive: true })
    const response = await drive.files.get({ fileId: file.id, alt: 'media' }, { responseType: 'stream' })
    await pipeline(response.data as NodeJS.ReadableStream, fs.createWriteStream(targetPath))
    restoredFiles += 1
    restoredBytes += Number(file.size ?? 0)
  }

  return {
    restoredFiles,
    restoredBytes,
    destinationPath
  }
}
