import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'

const source = await fs.readFile(new URL('../src/main/services/cpu-usage.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 }
}).outputText
const { collectCpuUsage } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`)

function sources(overrides = {}) {
  const calls = []
  let loadCalls = 0
  return {
    calls,
    inputs: {
      platform: 'win32',
      windowsSample: async () => { calls.push('windows'); return '12.34' },
      currentLoad: async () => {
        calls.push('load')
        // Reproduce an old/stuck baseline followed by a fresh sample.
        return { currentLoad: ++loadCalls === 1 ? 100 : 7.26 }
      },
      wait: async (ms) => { calls.push(`wait:${ms}`) },
      ...overrides
    }
  }
}

test('Windows uses the native total instead of a misleading library reading', async () => {
  const { calls, inputs } = sources()
  assert.equal(await collectCpuUsage(inputs), 12.3)
  assert.deepEqual(calls, ['windows'])
})

test('valid idle and fully loaded CPU values are preserved', async () => {
  for (const value of [0, 100]) {
    const { inputs } = sources({ windowsSample: async () => JSON.stringify(value) })
    assert.equal(await collectCpuUsage(inputs), value)
  }
})

test('invalid Windows samples use two library reads separated by a fresh interval', async () => {
  for (const value of ['', 'null', '"100"', '{}', '-1', '101', '1e999', 'error']) {
    const { calls, inputs } = sources({ windowsSample: async () => value })
    assert.equal(await collectCpuUsage(inputs), 7.3)
    assert.deepEqual(calls, ['load', 'wait:1000', 'load'])
  }
})

test('Windows counter failure falls back instead of interrupting telemetry', async () => {
  const { calls, inputs } = sources({ windowsSample: async () => { throw new Error('WMI unavailable') } })
  assert.equal(await collectCpuUsage(inputs), 7.3)
  assert.deepEqual(calls, ['load', 'wait:1000', 'load'])
})

test('other systems also measure a fresh interval without Windows commands', async () => {
  for (const platform of ['darwin', 'linux']) {
    const { calls, inputs } = sources({ platform })
    assert.equal(await collectCpuUsage(inputs), 7.3)
    assert.deepEqual(calls, ['load', 'wait:1000', 'load'])
  }
})

test('every collection establishes its own baseline after a long gap', async () => {
  const loads = [100, 4, 89, 23]
  const { inputs } = sources({
    platform: 'darwin',
    currentLoad: async () => ({ currentLoad: loads.shift() })
  })
  assert.equal(await collectCpuUsage(inputs), 4)
  assert.equal(await collectCpuUsage(inputs), 23)
})

test('invalid fallback readings fail instead of publishing a fabricated percentage', async () => {
  for (const value of [NaN, Infinity, -1, 120]) {
    const { inputs } = sources({ platform: 'darwin', currentLoad: async () => ({ currentLoad: value }) })
    await assert.rejects(collectCpuUsage(inputs), /odczytać użycia procesora/)
  }
})
