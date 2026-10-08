import { spawnSync } from 'node:child_process'

export function synchronizeReleaseRepository(repositoryRoot, { releasePathspec, builtTag } = {}) {
  function git(args, allowedStatuses = [0]) {
    const result = spawnSync('git', args, { cwd: repositoryRoot, encoding: 'utf8' })
    if (!allowedStatuses.includes(result.status)) {
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

  git(['fetch', 'origin', 'main', '--tags'])
  const remoteRef = 'refs/remotes/origin/main'
  if (builtTag) {
    if (git(['merge-base', '--is-ancestor', builtTag, 'HEAD'], [0, 1]).status !== 0) {
      throw new Error(`Tag ${builtTag} nie należy do historii bieżącej gałęzi.`)
    }
    const localChanges = git(['diff', '--name-only', builtTag, 'HEAD', '--', ...releasePathspec]).stdout.trim()
    const base = git(['merge-base', 'HEAD', remoteRef]).stdout.trim()
    const incomingChanges = git(['diff', '--name-only', base, remoteRef, '--', ...releasePathspec]).stdout.trim()
    if (localChanges || incomingChanges) {
      throw new Error(`Od zbudowania paczek zmieniły się pliki wydania. Przygotuj nowe wydanie:\n${localChanges || incomingChanges}`)
    }
  }

  if (git(['merge-base', '--is-ancestor', remoteRef, 'HEAD'], [0, 1]).status === 0) return
  // Merge zachowuje commit i tag już zbudowanej wersji. Nie przepisujemy historii.
  const merge = git(['merge', '--no-edit', remoteRef], [0, 1, 128])
  if (merge.status !== 0) {
    // Cofamy tylko rozpoczęty przez nas merge; lokalnych zmian nie chowamy ani nie kasujemy.
    const mergeHead = git(['rev-parse', '--verify', '--quiet', 'MERGE_HEAD'], [0, 1])
    if (mergeHead.status === 0) git(['merge', '--abort'])
    throw new Error(`Nie udało się bezpiecznie połączyć main z origin/main. Lokalne zmiany zachowano. Rozwiąż synchronizację przed wydaniem.\n${(merge.stderr || merge.stdout).trim()}`)
  }
  console.log('[release] Połączono main z origin/main, zachowując lokalne zmiany i tagi.')
}
