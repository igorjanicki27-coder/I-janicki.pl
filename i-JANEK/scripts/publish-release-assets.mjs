#!/usr/bin/env node

import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs'
import { request } from 'node:https'
import { basename, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repositoryRoot = resolve(appRoot, '..')
const packageJson = JSON.parse(readFileSync(resolve(appRoot, 'package.json'), 'utf8'))
const version = packageJson.version
const channel = process.argv[2] ?? 'stable'
const channelFile = channel === 'stable' ? 'latest' : channel
const tag = `i-janek-v${version}`
const owner = 'igorjanicki27-coder'
const repo = 'I-janicki.pl'

if (!['test', 'beta', 'stable'].includes(channel)) {
  throw new Error('Kanał musi mieć wartość: test, beta albo stable.')
}

function gitCredential() {
  const result = spawnSync('git', ['credential', 'fill'], {
    cwd: repositoryRoot,
    input: 'protocol=https\nhost=github.com\n\n',
    encoding: 'utf8'
  })
  if (result.status !== 0) throw new Error('Nie udało się pobrać danych GitHub z systemowego magazynu poświadczeń.')
  const values = Object.fromEntries(
    result.stdout.trim().split('\n').map((line) => {
      const separator = line.indexOf('=')
      return [line.slice(0, separator), line.slice(separator + 1)]
    })
  )
  if (!values.password) throw new Error('Brak tokenu GitHub. Zaloguj Git w systemowym magazynie poświadczeń.')
  return values.password
}

function apiRequest({ hostname = 'api.github.com', method = 'GET', path, token, body, headers = {} }) {
  return new Promise((resolveRequest, rejectRequest) => {
    const serializedBody = body == null ? null : Buffer.from(JSON.stringify(body))
    const req = request({
      hostname,
      method,
      path,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'User-Agent': 'i-JANEK-release-tool',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(serializedBody ? { 'Content-Type': 'application/json', 'Content-Length': serializedBody.length } : {}),
        ...headers
      }
    }, (response) => {
      const chunks = []
      response.on('data', (chunk) => chunks.push(chunk))
      response.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8')
        let data = null
        try { data = text ? JSON.parse(text) : null } catch { data = text }
        if ((response.statusCode ?? 500) >= 200 && (response.statusCode ?? 500) < 300) {
          resolveRequest(data)
          return
        }
        rejectRequest(new Error(`GitHub API ${response.statusCode}: ${data?.message ?? text}`))
      })
    })
    req.on('error', rejectRequest)
    if (serializedBody) req.end(serializedBody)
    else req.end()
  })
}

function uploadAsset(uploadUrl, filePath, token) {
  const url = new URL(uploadUrl.replace('{?name,label}', `?name=${encodeURIComponent(basename(filePath))}`))
  const size = statSync(filePath).size
  return new Promise((resolveUpload, rejectUpload) => {
    const req = request({
      hostname: url.hostname,
      method: 'POST',
      path: `${url.pathname}${url.search}`,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'User-Agent': 'i-JANEK-release-tool',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/octet-stream',
        'Content-Length': size
      }
    }, (response) => {
      const chunks = []
      response.on('data', (chunk) => chunks.push(chunk))
      response.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8')
        if ((response.statusCode ?? 500) >= 200 && (response.statusCode ?? 500) < 300) {
          resolveUpload()
          return
        }
        let message = text
        try { message = JSON.parse(text).message ?? text } catch { /* keep raw response */ }
        rejectUpload(new Error(`Nie udało się wysłać ${basename(filePath)}: GitHub API ${response.statusCode}: ${message}`))
      })
    })
    req.on('error', rejectUpload)
    createReadStream(filePath).pipe(req)
  })
}

const artifacts = [
  resolve(appRoot, 'dist', `i-JANEK-Setup-${version}.exe`),
  resolve(appRoot, 'dist', `i-JANEK-Setup-${version}.exe.blockmap`),
  resolve(appRoot, 'dist', `i-JANEK-${version}-arm64.dmg`),
  resolve(appRoot, 'dist', `i-JANEK-${version}-arm64.dmg.blockmap`),
  resolve(appRoot, 'dist', `i-JANEK-${version}-arm64.zip`),
  resolve(appRoot, 'dist', `i-JANEK-${version}-arm64.zip.blockmap`),
  resolve(appRoot, 'dist', `${channelFile}.yml`),
  resolve(appRoot, 'dist', `${channelFile}-mac.yml`)
]

const missing = artifacts.filter((filePath) => !existsSync(filePath))
if (missing.length) {
  throw new Error(`Brakuje plików wydania:\n${missing.join('\n')}`)
}

const token = gitCredential()
let release
try {
  release = await apiRequest({
    path: `/repos/${owner}/${repo}/releases/tags/${tag}`,
    token
  })
} catch (error) {
  if (!String(error).includes('GitHub API 404')) throw error
  release = await apiRequest({
    method: 'POST',
    path: `/repos/${owner}/${repo}/releases`,
    token,
    body: {
      tag_name: tag,
      name: `i-JANEK ${version}`,
      generate_release_notes: true,
      prerelease: channel !== 'stable'
    }
  })
}

const existingAssets = new Map((release.assets ?? []).map((asset) => [asset.name, asset]))
for (const artifact of artifacts) {
  const existing = existingAssets.get(basename(artifact))
  if (existing) {
    await apiRequest({ method: 'DELETE', path: `/repos/${owner}/${repo}/releases/assets/${existing.id}`, token })
  }
  console.log(`[release] Wysyłam ${basename(artifact)}...`)
  await uploadAsset(release.upload_url, artifact, token)
}

console.log(`[release] Opublikowano: ${release.html_url}`)
