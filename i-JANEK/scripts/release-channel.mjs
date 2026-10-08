#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { synchronizeReleaseRepository } from './release-git.mjs'

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repositoryRoot = resolve(appRoot, '..')
const packagePath = resolve(appRoot, 'package.json')
const releaseNotesPath = resolve(appRoot, 'resources/release-notes.json')
const args = process.argv.slice(2)
const channel = args.find((argument) => !argument.startsWith('--'))
const dryRun = args.includes('--dry-run')
const resume = args.includes('--resume')
const explicitVersionArgument = args.find((argument) => argument.startsWith('--version='))
const explicitVersion = explicitVersionArgument?.slice('--version='.length)
const releaseNotesArgument = args.find((argument) => argument.startsWith('--notes='))
let releaseNotes = releaseNotesArgument?.slice('--notes='.length).trim() ?? ''
const semverPattern = /^(\d+)\.(\d+)\.(\d+)(?:-(alpha|beta)\.(\d+))?$/u
const releasePathspec = [
  'i-JANEK',
  '.firebaserc',
  'firebase.json',
  'firestore.rules',
  'firestore.indexes.json',
  'database.rules.json',
  '.github/workflows/i-janek-firebase-rules-tests.yml',
  '.github/workflows/i-janek-release.yml',
  '.github/workflows/deploy-firestore-rules.yml',
  'scripts/prepare-firebase-credentials.mjs',
  ':(exclude)i-JANEK/.DS_Store',
  ':(exclude,glob)i-JANEK/**/.DS_Store'
]

function fail(message) {
  console.error(`[release] ${message}`)
  process.exit(1)
}

function run(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, {
    cwd: options.cwd ?? repositoryRoot,
    encoding: 'utf8',
    stdio: options.capture ? 'pipe' : 'inherit'
  })

  if (result.status !== 0) {
    const details = options.capture ? (result.stderr || result.stdout || '').trim() : ''
    fail(`${command} ${commandArgs.join(' ')} nie powiodło się${details ? `: ${details}` : '.'}`)
  }

  return options.capture ? result.stdout.trim() : ''
}

function parseVersion(version) {
  const match = semverPattern.exec(version)
  if (!match) fail(`Nieobsługiwany format wersji: ${version}. Oczekuję x.y.z, x.y.z-alpha.N albo x.y.z-beta.N.`)

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] ?? null,
    sequence: match[5] == null ? null : Number(match[5])
  }
}

function nextVersion(currentVersion) {
  if (explicitVersion) {
    const parsed = parseVersion(explicitVersion)
    if (channel === 'test' && parsed.prerelease !== 'alpha') fail('Wersja test musi kończyć się na -alpha.N.')
    if (channel === 'beta' && parsed.prerelease !== 'beta') fail('Wersja beta musi kończyć się na -beta.N.')
    if (channel === 'stable' && parsed.prerelease != null) fail('Wersja stable nie może zawierać oznaczenia prerelease.')
    return explicitVersion
  }

  const current = parseVersion(currentVersion)
  if (channel === 'test') {
    if (current.prerelease === 'alpha') {
      return `${current.major}.${current.minor}.${current.patch}-alpha.${current.sequence + 1}`
    }
    return `${current.major}.${current.minor}.${current.patch + 1}-alpha.1`
  }

  if (channel === 'beta') {
    if (current.prerelease === 'beta') {
      return `${current.major}.${current.minor}.${current.patch}-beta.${current.sequence + 1}`
    }
    if (current.prerelease === 'alpha') {
      return `${current.major}.${current.minor}.${current.patch}-beta.1`
    }
    return `${current.major}.${current.minor}.${current.patch + 1}-beta.1`
  }

  if (current.prerelease != null) {
    return `${current.major}.${current.minor}.${current.patch}`
  }
  return `${current.major}.${current.minor}.${current.patch + 1}`
}

if (!['test', 'beta', 'stable'].includes(channel)) {
  fail('Użycie: node scripts/release-channel.mjs <test|beta|stable> [--dry-run] [--resume] [--version=x.y.z[-alpha.N|-beta.N]] [--notes="Opis zmian"]')
}

console.log('[release] Sprawdzam poprawność automatu przed rozpoczęciem wydania.')
for (const script of [
  'release.sh',
  'scripts/build-public-update-macos.sh',
  'scripts/build-windows-exe-from-macos.sh',
  'scripts/prepare-icons.sh'
]) {
  run('bash', ['-n', script], { cwd: appRoot })
}
for (const script of [
  'scripts/release-channel.mjs',
  'scripts/release-git.mjs',
  'scripts/release-artifacts.mjs',
  'scripts/publish-release-assets.mjs',
  'scripts/check-macos-signing.mjs',
  'scripts/setup-macos-signing.mjs'
]) {
  run(process.execPath, ['--check', script], { cwd: appRoot })
}

function synchronize(builtTag) {
  console.log('[release] Sprawdzam aktualny main na GitHubie przed dalszymi krokami.')
  try {
    synchronizeReleaseRepository(repositoryRoot, { releasePathspec, builtTag })
  } catch (error) {
    fail(error.message)
  }
}

// Synchronizacja musi poprzedzać odczyt wersji, commit, tag i kosztowny build.
if (!dryRun && !resume) synchronize()

const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'))
const version = resume ? packageJson.version : nextVersion(packageJson.version)
if (resume) {
  if (explicitVersion && explicitVersion !== version) fail('Wznowienie wymaga bieżącej wersji z package.json.')
  const parsed = parseVersion(version)
  if ((channel === 'test' && parsed.prerelease !== 'alpha') ||
      (channel === 'beta' && parsed.prerelease !== 'beta') ||
      (channel === 'stable' && parsed.prerelease != null)) fail('Bieżąca wersja nie odpowiada kanałowi wznowienia.')
}
const tag = `i-janek-v${version}`
if (!dryRun && !resume && !process.env.WINDOWS_UPDATE_SIGNING_KEY_PEM && !existsSync(resolve(appRoot, 'resources/update-signing-private.pem'))) {
  fail('Brakuje prywatnego klucza podpisu aktualizacji Windows. Wydanie wymaga tego klucza przed zmianą wersji i utworzeniem tagu.')
}

console.log(`[release] Kanał: ${channel}`)
console.log(`[release] Wersja: ${packageJson.version} -> ${version}`)
console.log(`[release] Tag: ${tag}`)
if (resume) console.log('[release] Wznawiam gotowe wydanie bez zmiany wersji i ponownego budowania.')
if (releaseNotes) console.log(`[release] Opis: ${releaseNotes}`)

if (dryRun) {
  console.log('[release] Podgląd zakończony. Nie zmieniono plików i niczego nie wysłano.')
  process.exit(0)
}

if (resume) {
  const tagPackage = run('git', ['show', `${tag}:i-JANEK/package.json`], { capture: true })
  if (JSON.parse(tagPackage).version !== version) fail('Wersja zapisana w tagu nie odpowiada bieżącej wersji.')
  if (!releaseNotesArgument) {
    releaseNotes = run('git', ['for-each-ref', '--format=%(contents:body)', `refs/tags/${tag}`], { capture: true })
  }
  if (existsSync(releaseNotesPath)) {
    const bundledNotes = JSON.parse(readFileSync(releaseNotesPath, 'utf8'))
    if (bundledNotes.version === version && bundledNotes.notes !== releaseNotes) {
      fail('Opis zmian różni się od opisu w gotowych paczkach. Wznów z oryginalnym opisem albo zbuduj nowe wydanie.')
    }
  }
  run(process.execPath, ['scripts/publish-release-assets.mjs', channel, '--check-only'], { cwd: appRoot })
  synchronize(tag)
} else {
  run(process.execPath, ['scripts/check-update-signing.mjs'], { cwd: appRoot })
  run(process.execPath, ['scripts/check-macos-signing.mjs'], { cwd: appRoot })

  const branch = run('git', ['branch', '--show-current'], { capture: true })
  if (branch !== 'main') fail(`Wydanie można rozpocząć wyłącznie z gałęzi main (obecnie: ${branch || 'brak'}).`)

  const pendingAppChanges = run(
    'git',
    ['status', '--short', '--untracked-files=all', '--', ...releasePathspec],
    { capture: true }
  )
  if (pendingAppChanges) {
    console.log('[release] Zmiany aplikacji, które automat doda do commita:')
    console.log(pendingAppChanges)
  }

  const existingTag = spawnSync('git', ['rev-parse', '--verify', '--quiet', `refs/tags/${tag}`], {
    cwd: repositoryRoot,
    stdio: 'ignore'
  })
  if (existingTag.status === 0) fail(`Tag ${tag} już istnieje. Aby wznowić gotowe paczki tej wersji: npm run release:${channel} -- --resume --version=${version}`)

  run('npm', ['run', 'typecheck'], { cwd: appRoot })
  run('npm', ['version', version, '--no-git-tag-version'], { cwd: appRoot })
  writeFileSync(releaseNotesPath, `${JSON.stringify({ version, notes: releaseNotes }, null, 2)}\n`)
  run('git', ['add', '-A', '--', ...releasePathspec])
  const stagedAppChanges = run(
    'git',
    ['diff', '--cached', '--name-only', '--', ...releasePathspec],
    { capture: true }
  )
  if (!stagedAppChanges) fail('Nie znaleziono zmian aplikacji do zapisania w commicie wydania.')
  run('git', ['commit', '--only', '-m', `chore(i-janek): release ${version}`, '--', ...releasePathspec])
  run('git', ['tag', '-a', tag, '-m', releaseNotes ? `i-JANEK ${version}\n\n${releaseNotes}` : `i-JANEK ${version}`])

  const updaterChannel = channel === 'stable' ? 'latest' : channel
  console.log('[release] Buduję lokalnie podpisaną paczkę macOS i paczkę Windows.')
  run('bash', ['scripts/build-public-update-macos.sh', updaterChannel], { cwd: appRoot })

  // Automat SEO może dopisać commit również w trakcie budowania paczek.
  synchronize(tag)
}

console.log('[release] Wysyłam commit i tag do GitHuba.')
const push = spawnSync('git', ['push', '--atomic', 'origin', 'main', `refs/tags/${tag}`], {
  cwd: repositoryRoot, stdio: 'inherit'
})
if (push.status !== 0) fail(`Publikację zatrzymano. Gotowe paczki i tag zachowano. Wznów: npm run release:${channel} -- --resume --version=${version}`)
const publishArgs = ['scripts/publish-release-assets.mjs', channel]
if (releaseNotes) publishArgs.push(`--notes=${releaseNotes}`)
run(process.execPath, publishArgs, { cwd: appRoot })
console.log(`[release] Gotowe: https://github.com/igorjanicki27-coder/I-janicki.pl/releases/tag/${tag}`)
