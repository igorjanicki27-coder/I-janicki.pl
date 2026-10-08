import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'

const source = await fs.readFile(new URL('../src/main/services/windows-update-protocol.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 }
}).outputText
const { canExitForWindowsUpdate, getWindowsRestartRequestId } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`)

test('only the prepared restart for this request and target version can close the app', () => {
  const ready = { state: 'ready', version: '0.1.40', requestId: '123-456', restartProtocol: 2, restartPrepared: true }
  assert.equal(canExitForWindowsUpdate(ready, '123-456', '0.1.40'), true)
  for (const change of [
    { requestId: '123-455' }, { version: '0.1.39' }, { restartPrepared: false },
    { restartProtocol: 1 }, { restartProtocol: undefined }, { state: 'installed' },
    { state: 'verifying' }, { state: 'error' }, { state: 'restarting' }
  ]) assert.equal(canExitForWindowsUpdate({ ...ready, ...change }, '123-456', '0.1.40'), false)
  assert.equal(canExitForWindowsUpdate(ready, null, '0.1.40'), false)
  assert.equal(canExitForWindowsUpdate(ready, '123-456', null), false)
})

test('restart acknowledgement accepts exactly one safe request ID', () => {
  assert.equal(getWindowsRestartRequestId(['app.exe', '--tray', '--update-request=123-456']), '123-456')
  for (const values of [
    [], ['--update-request='], ['--update-request=../../file'],
    ['--update-request=123-456', '--update-request=123-457'], ['--update-request=123-456.json']
  ]) assert.equal(getWindowsRestartRequestId(values), null)
})
