import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import test from 'node:test'
import ts from 'typescript'

test('Windows watcher executes with a console and survives its parent exiting', {
  skip: process.platform !== 'win32', timeout: 60_000
}, async () => {
  const source = await fs.readFile(new URL('../src/main/services/windows-update-watcher.ts', import.meta.url), 'utf8')
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 }
  }).outputText
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'i-JANEK restart Łódź '))
  const script = path.join(dir, 'observer probe.ps1')
  const ready = path.join(dir, 'ready.txt')
  const done = path.join(dir, 'done.txt')
  // No installer or application is run. The probe exercises the console and
  // process lifetime that the real restart observer needs.
  await fs.writeFile(script, '\uFEFF' + `param([string]$Ready, [string]$Done, [int]$ParentProcessId, [switch]$StartHidden)
$ErrorActionPreference = 'Stop'
[IO.File]::WriteAllText($Ready, 'ready')
$deadline = [DateTime]::UtcNow.AddSeconds(30)
while (Get-Process -Id $ParentProcessId -ErrorAction SilentlyContinue) {
  if ([DateTime]::UtcNow -ge $deadline) { exit 1 }
  Start-Sleep -Milliseconds 100
}
[IO.File]::WriteAllText($Done, "survived:$StartHidden")
`)
  const parentSource = `
    import fs from 'node:fs';
    import { spawnWindowsUpdateWatcher } from ${JSON.stringify(moduleUrl)};
    const child = spawnWindowsUpdateWatcher([
      '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', ${JSON.stringify(script)},
      '-Ready', ${JSON.stringify(ready)}, '-Done', ${JSON.stringify(done)},
      '-ParentProcessId', String(process.pid), '-StartHidden'
    ]);
    child.once('error', () => process.exit(1));
    child.once('exit', () => { if (!fs.existsSync(${JSON.stringify(ready)})) process.exit(2); });
    child.unref();
    setInterval(() => { if (fs.existsSync(${JSON.stringify(ready)})) process.exit(0); }, 100);
    setTimeout(() => process.exit(3), 25_000);
  `
  const parent = spawn(process.execPath, ['--input-type=module', '-e', parentSource], { windowsHide: true })
  let stderr = ''
  parent.stderr.on('data', chunk => { stderr += chunk.toString() })
  try {
    const [code] = await once(parent, 'exit')
    assert.equal(code, 0, `Observer did not acknowledge startup: ${stderr}`)
    const deadline = Date.now() + 10_000
    while (true) {
      try {
        assert.equal(await fs.readFile(done, 'utf8'), 'survived:True')
        break
      } catch (error) {
        if (error.code !== 'ENOENT' || Date.now() >= deadline) throw error
        await delay(100)
      }
    }
  } finally {
    if (parent.exitCode === null) parent.kill()
    await fs.rm(dir, { recursive: true, force: true })
  }
})
