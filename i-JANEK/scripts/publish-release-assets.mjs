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
const args = process.argv.slice(2)
const channel = args.find((argument) => !argument.startsWith('--')) ?? 'stable'
const releaseNotesArgument = args.find((argument) => argument.startsWith('--notes='))
const releaseNotes = releaseNotesArgument?.slice('--notes='.length).trim() ?? ''
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

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms))
}

function uploadAssetOnce(uploadUrl, filePath, token) {
  const url = new URL(uploadUrl.replace('{?name,label}', `?name=${encodeURIComponent(basename(filePath))}`))
  const size = statSync(filePath).size
  return new Promise((resolveUpload, rejectUpload) => {
    let settled = false
    const finish = (callback, value) => {
      if (settled) return
      settled = true
      callback(value)
    }
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
          finish(resolveUpload)
          return
        }
        let message = text
        try { message = JSON.parse(text).message ?? text } catch { /* keep raw response */ }
        finish(rejectUpload, new Error(`Nie udało się wysłać ${basename(filePath)}: GitHub API ${response.statusCode}: ${message}`))
      })
    })
    const stream = createReadStream(filePath)
    req.on('error', (error) => {
      stream.destroy()
      finish(rejectUpload, error)
    })
    stream.on('error', (error) => {
      req.destroy()
      finish(rejectUpload, error)
    })
    stream.pipe(req)
  })
}

async function releaseByTag(token) {
  return apiRequest({
    path: `/repos/${owner}/${repo}/releases/tags/${tag}`,
    token
  })
}

async function deleteAsset(asset, token) {
  await apiRequest({
    method: 'DELETE',
    path: `/repos/${owner}/${repo}/releases/assets/${asset.id}`,
    token
  })
}

async function uploadAssetWithRetry(release, filePath, token, attempts = 4) {
  const name = basename(filePath)
  const size = statSync(filePath).size

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const currentRelease = await releaseByTag(token)
    const existing = (currentRelease.assets ?? []).find((asset) => asset.name === name)
    if (existing?.state === 'uploaded' && existing.size === size) {
      console.log(`[release] Już wysłano ${name}.`)
      return
    }
    if (existing) await deleteAsset(existing, token)

    console.log(`[release] Wysyłam ${name} (próba ${attempt}/${attempts})...`)
    try {
      await uploadAssetOnce(release.upload_url, filePath, token)
      return
    } catch (error) {
      const afterFailure = await releaseByTag(token)
      const completed = (afterFailure.assets ?? []).find(
        (asset) => asset.name === name && asset.state === 'uploaded' && asset.size === size
      )
      if (completed) return
      if (attempt === attempts) throw error
      console.warn(`[release] Upload ${name} przerwany: ${error.message}. Ponawiam...`)
      await sleep(attempt * 2000)
    }
  }
}

const artifacts = [
  resolve(appRoot, 'dist', `i-JANEK-Setup-${version}.exe`),
  resolve(appRoot, 'dist', `i-JANEK-Setup-${version}.exe.blockmap`),
  resolve(appRoot, 'dist', `i-JANEK-${version}-arm64.dmg`),
  resolve(appRoot, 'dist', `i-JANEK-${version}-arm64.dmg.blockmap`),
  resolve(appRoot, 'dist', `i-JANEK-${version}-arm64.zip`),
  resolve(appRoot, 'dist', `i-JANEK-${version}-arm64.zip.blockmap`),
  resolve(appRoot, 'dist', `${channelFile}.yml`),
  resolve(appRoot, 'dist', `${channelFile}-mac.yml`),
  resolve(appRoot, 'dist', 'update-windows.json'),
  resolve(appRoot, 'dist', 'update-windows.sig')
]

const missing = artifacts.filter((filePath) => !existsSync(filePath))
if (missing.length) {
  throw new Error(`Brakuje plików wydania:\n${missing.join('\n')}`)
}

const token = gitCredential()
let release
try {
  release = await releaseByTag(token)
} catch (error) {
  if (!String(error).includes('GitHub API 404')) throw error
  release = await apiRequest({
    method: 'POST',
    path: `/repos/${owner}/${repo}/releases`,
    token,
    body: {
      tag_name: tag,
      name: `i-JANEK ${version}`,
      ...(releaseNotes ? { body: releaseNotes } : { generate_release_notes: true }),
      prerelease: channel !== 'stable'
    }
  })
}

if (releaseNotes && release.body !== releaseNotes) {
  release = await apiRequest({
    method: 'PATCH',
    path: `/repos/${owner}/${repo}/releases/${release.id}`,
    token,
    body: { body: releaseNotes }
  })
}

for (const artifact of artifacts) {
  await uploadAssetWithRetry(release, artifact, token)
}

console.log(`[release] Opublikowano: ${release.html_url}`)
