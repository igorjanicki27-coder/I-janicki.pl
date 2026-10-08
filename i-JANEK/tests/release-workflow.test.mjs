import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash, generateKeyPairSync, sign } from 'node:crypto'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { synchronizeReleaseRepository } from '../scripts/release-git.mjs'
import { validateReleaseArtifacts } from '../scripts/release-artifacts.mjs'

const pathspec = ['i-JANEK']
const tag = 'i-janek-v0.1.37'
const appRoot = dirname(dirname(fileURLToPath(import.meta.url)))

function git(cwd, ...args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', env: {
    ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_TERMINAL_PROMPT: '0'
  } })
  assert.equal(result.status, 0, result.stderr || result.stdout)
  return result.stdout.trim()
}

function repositories(t) {
  const root = mkdtempSync(join(tmpdir(), 'i-janek-release-test-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const remote = join(root, 'remote.git')
  const local = join(root, 'local')
  const other = join(root, 'other')
  git(root, 'init', '--bare', '--initial-branch=main', remote)
  git(root, 'clone', remote, local)
  for (const repo of [local]) {
    git(repo, 'config', 'user.name', 'Release Test')
    git(repo, 'config', 'user.email', 'release-test@example.invalid')
  }
  mkdirSync(join(local, 'i-JANEK'))
  writeFileSync(join(local, 'i-JANEK/package.json'), '{"version":"0.1.36"}\n')
  writeFileSync(join(local, 'sitemap.xml'), 'original\n')
  writeFileSync(join(local, 'document.html'), 'original\n')
  git(local, 'add', '.')
  git(local, 'commit', '-m', 'initial')
  git(local, 'push', 'origin', 'main')
  git(root, 'clone', remote, other)
  git(other, 'config', 'user.name', 'Remote Test')
  git(other, 'config', 'user.email', 'remote-test@example.invalid')
  writeFileSync(join(local, 'i-JANEK/package.json'), '{"version":"0.1.37"}\n')
  git(local, 'commit', '-am', 'release 0.1.37')
  git(local, 'tag', '-a', tag, '-m', 'i-JANEK 0.1.37')
  return { local, other }
}

function remoteCommit(other, path, content) {
  writeFileSync(join(other, path), content)
  git(other, 'commit', '-am', 'remote change')
  git(other, 'push', 'origin', 'main')
}

test('wznowienie łączy commit SEO, zachowuje tag i niezapisane dokumenty; push atomic działa', (t) => {
  const { local, other } = repositories(t)
  const originalTag = git(local, 'rev-parse', tag)
  const releaseCommit = git(local, 'rev-parse', 'HEAD')
  writeFileSync(join(local, 'document.html'), 'unsaved document\n')
  remoteCommit(other, 'sitemap.xml', 'scheduled SEO\n')
  synchronizeReleaseRepository(local, { releasePathspec: pathspec, builtTag: tag })
  assert.equal(readFileSync(join(local, 'sitemap.xml'), 'utf8'), 'scheduled SEO\n')
  assert.equal(readFileSync(join(local, 'document.html'), 'utf8'), 'unsaved document\n')
  assert.equal(git(local, 'rev-parse', tag), originalTag)
  git(local, 'merge-base', '--is-ancestor', releaseCommit, 'HEAD')
  git(local, 'merge-base', '--is-ancestor', 'origin/main', 'HEAD')
  assert.equal(git(local, 'status', '--short'), 'M document.html')
  git(local, 'push', '--atomic', 'origin', 'main', `refs/tags/${tag}`)
})

test('wznowienie zatrzymuje się przed połączeniem zdalnych zmian aplikacji', (t) => {
  const { local, other } = repositories(t)
  const originalHead = git(local, 'rev-parse', 'HEAD')
  remoteCommit(other, 'i-JANEK/package.json', '{"version":"0.1.38"}\n')
  assert.throws(() => synchronizeReleaseRepository(local, { releasePathspec: pathspec, builtTag: tag }), /zmieniły się pliki wydania/u)
  assert.equal(git(local, 'rev-parse', 'HEAD'), originalHead)
})

test('kontrola przed budowaniem może połączyć zdalne zmiany aplikacji', (t) => {
  const { local, other } = repositories(t)
  writeFileSync(join(other, 'i-JANEK/feature.txt'), 'new feature\n')
  git(other, 'add', '.')
  git(other, 'commit', '-m', 'feature')
  git(other, 'push', 'origin', 'main')
  synchronizeReleaseRepository(local, { releasePathspec: pathspec })
  assert.equal(readFileSync(join(local, 'i-JANEK/feature.txt'), 'utf8'), 'new feature\n')
})

test('konflikt cofa tylko merge automatu i zachowuje lokalne zmiany oraz tag', (t) => {
  const { local, other } = repositories(t)
  writeFileSync(join(local, 'sitemap.xml'), 'local sitemap\n')
  git(local, 'commit', '-am', 'local sitemap')
  const originalHead = git(local, 'rev-parse', 'HEAD')
  const originalTag = git(local, 'rev-parse', tag)
  writeFileSync(join(local, 'document.html'), 'unsaved document\n')
  remoteCommit(other, 'sitemap.xml', 'remote sitemap\n')
  assert.throws(() => synchronizeReleaseRepository(local, { releasePathspec: pathspec, builtTag: tag }), /Nie udało się bezpiecznie połączyć/u)
  assert.equal(git(local, 'rev-parse', 'HEAD'), originalHead)
  assert.equal(git(local, 'rev-parse', tag), originalTag)
  assert.equal(git(local, 'ls-files', '--unmerged'), '')
  assert.equal(readFileSync(join(local, 'document.html'), 'utf8'), 'unsaved document\n')
})

test('zmiana tego samego pliku w katalogu roboczym zatrzymuje merge bez utraty pliku', (t) => {
  const { local, other } = repositories(t)
  const originalHead = git(local, 'rev-parse', 'HEAD')
  writeFileSync(join(local, 'sitemap.xml'), 'unsaved sitemap\n')
  remoteCommit(other, 'sitemap.xml', 'scheduled SEO\n')
  assert.throws(() => synchronizeReleaseRepository(local, { releasePathspec: pathspec, builtTag: tag }), /Lokalne zmiany zachowano/u)
  assert.equal(git(local, 'rev-parse', 'HEAD'), originalHead)
  assert.equal(readFileSync(join(local, 'sitemap.xml'), 'utf8'), 'unsaved sitemap\n')
})

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })

function artifacts(t, existingApp) {
  const app = existingApp ?? mkdtempSync(join(tmpdir(), 'i-janek-artifacts-test-'))
  if (!existingApp) t.after(() => rmSync(app, { recursive: true, force: true }))
  const dist = join(app, 'dist')
  mkdirSync(dist)
  mkdirSync(join(app, 'resources/scripts'), { recursive: true })
  writeFileSync(join(app, 'resources/scripts/update-signing-public.json'), JSON.stringify(publicKey.export({ format: 'jwk' })))
  const names = ['i-JANEK-Setup-0.1.37.exe', 'i-JANEK-0.1.37-arm64.zip', 'i-JANEK-0.1.37-arm64.dmg']
  const entries = names.map((name) => {
    const bytes = Buffer.from(`test payload ${name}`)
    writeFileSync(join(dist, name), bytes)
    writeFileSync(join(dist, `${name}.blockmap`), 'blockmap')
    return { name, size: bytes.length, hash: createHash('sha512').update(bytes).digest('base64') }
  })
  for (const [file, group] of [['latest.yml', entries.slice(0, 1)], ['latest-mac.yml', entries.slice(1)]]) {
    writeFileSync(join(dist, file), `version: 0.1.37\nfiles:\n${group.map((entry) => `  - url: ${entry.name}\n    sha512: ${entry.hash}\n    size: ${entry.size}`).join('\n')}\npath: ${group[0].name}\nsha512: ${group[0].hash}\n`)
  }
  const manifest = Buffer.from(`${JSON.stringify({ schema: 1, version: '0.1.37', channel: 'latest', asset: names[0], sha512: entries[0].hash })}\n`)
  writeFileSync(join(dist, 'update-windows.json'), manifest)
  writeFileSync(join(dist, 'update-windows.sig'), sign('sha256', manifest, privateKey).toString('base64'))
  return { app, dist, names }
}

test('gotowe paczki przechodzą kontrolę metadanych, sum i podpisu', async (t) => {
  const { app } = artifacts(t)
  assert.equal((await validateReleaseArtifacts(app, '0.1.37', 'stable')).length, 10)
})

test('zmodyfikowana paczka macOS zatrzymuje publikację', async (t) => {
  const { app, dist, names } = artifacts(t)
  writeFileSync(join(dist, names[1]), 'corrupted zip')
  await assert.rejects(validateReleaseArtifacts(app, '0.1.37', 'stable'), /suma kontrolna lub rozmiar/u)
})

test('metadane poprzedniej wersji zatrzymują publikację', async (t) => {
  const { app, dist } = artifacts(t)
  const path = join(dist, 'latest.yml')
  writeFileSync(path, readFileSync(path, 'utf8').replace('version: 0.1.37', 'version: 0.1.36'))
  await assert.rejects(validateReleaseArtifacts(app, '0.1.37', 'stable'), /wersja metadanych/u)
})

test('nieprawidłowy podpis Windows zatrzymuje publikację', async (t) => {
  const { app, dist } = artifacts(t)
  writeFileSync(join(dist, 'update-windows.sig'), Buffer.from('invalid signature').toString('base64'))
  await assert.rejects(validateReleaseArtifacts(app, '0.1.37', 'stable'), /Nieprawidłowy podpis/u)
})

test('pełne wznowienie CLI zachowuje wersję i tag oraz opis, bez uruchamiania budowania', (t) => {
  const { local, other } = repositories(t)
  const app = join(local, 'i-JANEK')
  artifacts(t, app)
  mkdirSync(join(app, 'scripts'))
  for (const script of ['release-channel.mjs', 'release-git.mjs', 'release-artifacts.mjs']) {
    copyFileSync(join(appRoot, 'scripts', script), join(app, 'scripts', script))
  }
  for (const script of ['check-macos-signing.mjs', 'setup-macos-signing.mjs']) {
    writeFileSync(join(app, 'scripts', script), 'throw new Error("Signing must not run during resume")\n')
  }
  for (const script of ['release.sh', 'scripts/build-public-update-macos.sh', 'scripts/build-windows-exe-from-macos.sh', 'scripts/prepare-icons.sh']) {
    writeFileSync(join(app, script), '#!/bin/bash\nexit 99\n')
  }
  // Zastępujemy wyłącznie zewnętrzny upload; weryfikacja paczek i Git są rzeczywiste.
  writeFileSync(join(app, 'scripts/publish-release-assets.mjs'), `
    import { writeFileSync } from 'node:fs'
    import { validateReleaseArtifacts } from './release-artifacts.mjs'
    await validateReleaseArtifacts(process.cwd(), '0.1.37', 'stable')
    if (!process.argv.includes('--check-only')) writeFileSync('publication.json', JSON.stringify(process.argv.slice(2)))
  `)
  git(local, 'tag', '-f', '-a', tag, '-m', 'i-JANEK 0.1.37\n\nOpis istniejącego wydania')
  writeFileSync(join(app, 'resources/release-notes.json'), JSON.stringify({ version: '0.1.37', notes: 'Opis istniejącego wydania' }))
  git(local, 'add', 'i-JANEK/resources/release-notes.json')
  git(local, 'commit', '-m', 'bundle release notes')
  git(local, 'tag', '-f', '-a', tag, '-m', 'i-JANEK 0.1.37\n\nOpis istniejącego wydania')
  const originalTag = git(local, 'rev-parse', tag)
  git(local, 'add', 'i-JANEK/scripts/release-channel.mjs', 'i-JANEK/scripts/release-git.mjs', 'i-JANEK/scripts/release-artifacts.mjs', 'i-JANEK/scripts/publish-release-assets.mjs')
  writeFileSync(join(app, 'README.md'), 'Updated release instructions\n')
  git(local, 'add', 'i-JANEK/README.md')
  git(local, 'commit', '-m', 'repair release tooling')
  remoteCommit(other, 'sitemap.xml', 'scheduled SEO\n')
  const result = spawnSync(process.execPath, ['scripts/release-channel.mjs', 'stable', '--resume', '--version=0.1.37'], { cwd: app, encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr || result.stdout)
  assert.equal(JSON.parse(readFileSync(join(app, 'package.json'), 'utf8')).version, '0.1.37')
  assert.equal(git(local, 'rev-parse', tag), originalTag)
  assert.deepEqual(JSON.parse(readFileSync(join(app, 'publication.json'), 'utf8')), ['stable', '--notes=Opis istniejącego wydania'])
  assert.equal(readFileSync(join(local, 'sitemap.xml'), 'utf8'), 'scheduled SEO\n')
  const changedNotes = spawnSync(process.execPath, ['scripts/release-channel.mjs', 'stable', '--resume', '--notes=Inny opis'], { cwd: app, encoding: 'utf8' })
  assert.equal(changedNotes.status, 1)
  assert.match(changedNotes.stderr, /Opis zmian różni się od opisu w gotowych paczkach/u)
})

test('nowe wydanie dołącza dokładny wielowierszowy opis przed tagiem i budowaniem', (t) => {
  const { local } = repositories(t)
  for (const file of ['.firebaserc', 'firebase.json', 'firestore.rules', 'firestore.indexes.json', 'database.rules.json', '.github/workflows/i-janek-firebase-rules-tests.yml', '.github/workflows/i-janek-release.yml', '.github/workflows/deploy-firestore-rules.yml', 'scripts/prepare-firebase-credentials.mjs']) {
    mkdirSync(dirname(join(local, file)), { recursive: true })
    writeFileSync(join(local, file), 'release fixture\n')
  }
  const app = join(local, 'i-JANEK')
  mkdirSync(join(app, 'scripts'))
  mkdirSync(join(app, 'resources'))
  writeFileSync(join(app, 'resources/update-signing-private.pem'), 'fixture only')
  writeFileSync(join(app, 'package.json'), JSON.stringify({ version: '0.1.37', scripts: { typecheck: 'node -e "process.exit(0)"' } }))
  for (const script of ['release-channel.mjs', 'release-git.mjs']) {
    copyFileSync(join(appRoot, 'scripts', script), join(app, 'scripts', script))
  }
  for (const script of ['check-update-signing.mjs', 'check-macos-signing.mjs', 'setup-macos-signing.mjs', 'release-artifacts.mjs']) {
    writeFileSync(join(app, 'scripts', script), '// External signing/build stub for release-flow test\n')
  }
  for (const script of ['release.sh', 'scripts/build-windows-exe-from-macos.sh', 'scripts/prepare-icons.sh']) {
    writeFileSync(join(app, script), '#!/bin/bash\nexit 0\n')
  }
  writeFileSync(join(app, 'scripts/build-public-update-macos.sh'), '#!/bin/bash\ncp resources/release-notes.json build-notes.json\n')
  writeFileSync(join(app, 'scripts/publish-release-assets.mjs'), `
    import { writeFileSync } from 'node:fs'
    writeFileSync('publication.json', JSON.stringify(process.argv.slice(2)))
  `)
  const notes = 'Poprawione aktualizacje.\n- Wiadomości: <opis> & "tekst"\n- Diagnostyka'
  const result = spawnSync(process.execPath, ['scripts/release-channel.mjs', 'stable', '--version=0.1.38', `--notes=${notes}`], { cwd: app, encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr || result.stdout)
  const expected = { version: '0.1.38', notes }
  assert.deepEqual(JSON.parse(readFileSync(join(app, 'build-notes.json'), 'utf8')), expected)
  assert.deepEqual(JSON.parse(git(local, 'show', 'i-janek-v0.1.38:i-JANEK/resources/release-notes.json')), expected)
  assert.deepEqual(JSON.parse(readFileSync(join(app, 'publication.json'), 'utf8')), ['stable', `--notes=${notes}`])
})
