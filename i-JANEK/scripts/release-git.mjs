import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

export function synchronizeReleaseRepository(repositoryRoot, { releasePathspec, builtTag } = {}) {
  function git(args, allowedStatuses = [0]) {
    const result = spawnSync('git', args, { cwd: repositoryRoot, encoding: 'utf8' })
    if (allowedStatuses && !allowedStatuses.includes(result.status)) {
      throw new Error(`git ${args.join(' ')}: ${(result.stderr || result.stdout || result.error?.message || '').trim()}`)
    }
    return result
  }

  if (git(['branch', '--show-current']).stdout.trim() !== 'main') {
    throw new Error('Wydanie można rozpocząć wyłącznie z gałęzi main.')
  }
  if (git(['ls-files', '--unmerged']).stdout.trim()) {
    throw new Error('Najpierw rozwiąż istniejące konflikty Git.')
  }
  for (const state of ['MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD', 'rebase-merge', 'rebase-apply']) {
    const statePath = git(['rev-parse', '--git-path', state]).stdout.trim()
    if (existsSync(resolve(repositoryRoot, statePath))) throw new Error('Najpierw zakończ rozpoczętą operację Git.')
  }

  git(['fetch', 'origin', 'main:refs/remotes/origin/main', '--tags'])
  const remoteRef = 'refs/remotes/origin/main'
  if (builtTag) {
    if (git(['merge-base', '--is-ancestor', builtTag, 'HEAD'], [0, 1]).status !== 0) {
      throw new Error(`Tag ${builtTag} nie należy do historii bieżącej gałęzi.`)
    }
    // Naprawa narzędzia publikacji nie zmienia już zbudowanej aplikacji.
    const builtPathspec = [...releasePathspec, ...[
      'release-channel.mjs', 'release-git.mjs', 'release-artifacts.mjs', 'publish-release-assets.mjs'
    ].map((file) => `:(exclude)i-JANEK/scripts/${file}`),
    ':(exclude)i-JANEK/README.md', ':(exclude)i-JANEK/docs', ':(exclude)i-JANEK/tests']
    const localChanges = git(['diff', '--name-only', builtTag, 'HEAD', '--', ...builtPathspec]).stdout.trim()
    const base = git(['merge-base', 'HEAD', remoteRef]).stdout.trim()
    const incomingChanges = git(['diff', '--name-only', base, remoteRef, '--', ...builtPathspec]).stdout.trim()
    if (localChanges || incomingChanges) {
      throw new Error(`Od zbudowania paczek zmieniły się pliki wydania. Przygotuj nowe wydanie:\n${localChanges || incomingChanges}`)
    }
  }

  if (git(['merge-base', '--is-ancestor', remoteRef, 'HEAD'], [0, 1]).status === 0) return
  // Merge zachowuje commit i tag już zbudowanej wersji. Nie przepisujemy historii.
  const merge = git(['merge', '--no-edit', remoteRef], null)
  if (merge.status !== 0) {
    // Cofamy tylko rozpoczęty przez nas merge; lokalnych zmian nie chowamy ani nie kasujemy.
    const mergeHead = git(['rev-parse', '--verify', '--quiet', 'MERGE_HEAD'], [0, 1])
    if (mergeHead.status === 0) git(['merge', '--abort'])
    throw new Error(`Nie udało się bezpiecznie połączyć main z origin/main. Lokalne zmiany zachowano. Rozwiąż synchronizację przed wydaniem.\n${(merge.stderr || merge.stdout).trim()}`)
  }
  console.log('[release] Połączono main z origin/main, zachowując lokalne zmiany i tagi.')
}
