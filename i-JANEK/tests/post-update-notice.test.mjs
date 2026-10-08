import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'

const source = await fs.readFile(new URL('../src/main/services/post-update-notice.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 }
}).outputText
const { advanceUpdateNoticeState, readPostUpdateNotice } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`)

test('fresh installation has no notice; changed version requires acknowledgement', () => {
  const first = advanceUpdateNoticeState('0.1.43', {}, false, false)
  assert.deepEqual(first, { lastVersion: '0.1.43' })
  const updated = advanceUpdateNoticeState('0.1.44', first, false, false)
  assert.equal(updated.pendingVersion, '0.1.44')
  assert.equal(advanceUpdateNoticeState('0.1.44', updated, false, false).pendingVersion, '0.1.44')
})

test('first upgrade from a legacy app is detected by restart or existing registration', () => {
  assert.equal(advanceUpdateNoticeState('0.1.43', {}, true, false).pendingVersion, '0.1.43')
  assert.equal(advanceUpdateNoticeState('0.1.43', {}, false, true).pendingVersion, '0.1.43')
})

test('OK suppresses repeated notice even with the updater restart flag', () => {
  const state = { lastVersion: '0.1.43', acknowledgedVersion: '0.1.43' }
  assert.equal(advanceUpdateNoticeState('0.1.43', state, true, true).pendingVersion, undefined)
  assert.equal(advanceUpdateNoticeState('0.1.44', state, false, true).pendingVersion, '0.1.44')
})

test('another update replaces an unacknowledged older notice', () => {
  const state = { lastVersion: '0.1.43', pendingVersion: '0.1.43' }
  assert.equal(advanceUpdateNoticeState('0.1.44', state, false, true).pendingVersion, '0.1.44')
})

test('only the installed version notes are used; multiline text remains literal', () => {
  const notes = '- Poprawa aktualizacji\n- Komunikator: <tekst> & "opis"'
  assert.deepEqual(readPostUpdateNotice('0.1.43', { version: '0.1.43', notes }), { version: '0.1.43', notes })
  for (const metadata of [null, {}, { version: '0.1.42', notes }, { version: '0.1.43', notes: 1 }, { version: '0.1.43', notes: '  ' }]) {
    assert.match(readPostUpdateNotice('0.1.43', metadata).notes, /nie zawiera dodatkowego opisu/)
  }
})
