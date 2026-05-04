import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import mime from 'mime-types'
import { google } from 'googleapis'
import type { BackupPolicy, BackupSnapshot } from '@shared/contracts'
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

export async function syncBackup(policy: BackupPolicy, accessToken: string, deviceId: string): Promise<BackupSnapshot> {
  const manifest = localStore.get('backupManifest')
  const deviceManifest = manifest[deviceId]?.fileStates ?? {}
  const skippedReasons: BackupSnapshot['skippedReasons'] = []
  const driveAuth = new google.auth.OAuth2()
  driveAuth.setCredentials({ access_token: accessToken })
  const drive = google.drive({ version: 'v3', auth: driveAuth })

  const rootFolderId = await ensureFolder(drive, policy.driveFolderName)
  const deviceFolderId = await ensureFolder(drive, deviceId, rootFolderId)

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
  const nextManifest: Record<string, number> = {}
  const maxQuotaBytes = policy.maxQuotaGb * 1024 * 1024 * 1024
  const maxFileSizeBytes = policy.maxFileSizeMb * 1024 * 1024
  const syncThreshold = policy.syncUnderMb * 1024 * 1024

  for (const watchedPath of policy.watchedPaths) {
    if (!fs.existsSync(watchedPath)) continue

    const files = await listFiles(watchedPath)
    for (const filePath of files) {
      const stats = await fsp.stat(filePath)
      if (!stats.isFile()) continue

      totalFiles += 1
      totalBytes += stats.size
      nextManifest[filePath] = stats.mtimeMs

      if (stats.size > maxFileSizeBytes) {
        skippedReasons.push({ path: filePath, reason: 'File exceeds maxFileSizeMb policy.' })
        continue
      }

      if (stats.size > syncThreshold) {
        skippedReasons.push({ path: filePath, reason: 'File exceeds continuous sync threshold.' })
        continue
      }

      if (totalBytes > maxQuotaBytes) {
        skippedReasons.push({ path: filePath, reason: 'Device quota exceeded.' })
        continue
      }

      if (deviceManifest[filePath] && deviceManifest[filePath] >= stats.mtimeMs) {
        continue
      }

      const relativeName = path.relative(watchedPath, filePath).replace(/\\/g, '/')
      await drive.files.create({
        requestBody: {
          name: relativeName,
          parents: [deviceFolderId]
        },
        media: {
          mimeType: mime.lookup(filePath) || 'application/octet-stream',
          body: fs.createReadStream(filePath)
        }
      })

      uploadedFiles += 1
    }
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
