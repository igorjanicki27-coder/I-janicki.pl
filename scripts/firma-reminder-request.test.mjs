import assert from 'node:assert/strict';
import test from 'node:test';
import { requestJson } from './firma-reminder-request.mjs';

const firestoreUrl = 'https://firestore.googleapis.com/v1/projects/test/databases/(default)/documents/firmy_settings/state';
const ok = () => Response.json({ loaded: true });
const timeout = () => new TypeError('fetch failed', {
  cause: new AggregateError([Object.assign(new Error('connect timed out'), { code: 'ETIMEDOUT' })]),
});

function fixture(responses) {
  const calls = [];
  const delays = [];
  const warnings = [];
  return {
    calls, delays, warnings,
    runtime: {
      fetch: async (...args) => {
        calls.push(args);
        const response = responses.shift();
        if (response instanceof Error) throw response;
        return response;
      },
      sleep: async (ms) => { delays.push(ms); },
      warn: (message) => { warnings.push(message); },
    },
  };
}

test('Firestore read recovers from the AggregateError ETIMEDOUT seen in Actions', async () => {
  const f = fixture([timeout(), ok()]);
  assert.deepEqual(await requestJson(firestoreUrl, {}, f.runtime), { loaded: true });
  assert.equal(f.calls.length, 2);
  assert.deepEqual(f.delays, [1000]);
  assert.match(f.warnings[0], /GET https:\/\/firestore.googleapis.com\/.*ETIMEDOUT/);
  assert.ok(f.calls.every(([, options]) => options.signal instanceof AbortSignal));
});

test('persistent network failure stops after three attempts and reports the endpoint', async () => {
  const f = fixture([timeout(), timeout(), timeout()]);
  await assert.rejects(requestJson(firestoreUrl, {}, f.runtime), /firestore.googleapis.com.*ETIMEDOUT/);
  assert.equal(f.calls.length, 3);
  assert.deepEqual(f.delays, [1000, 2000]);
});

test('OAuth token acquisition can retry a temporary Google failure', async () => {
  const f = fixture([new Response('Service Unavailable', { status: 503 }), ok()]);
  await requestJson('https://oauth2.googleapis.com/token', { method: 'POST', body: 'assertion=private' }, f.runtime);
  assert.equal(f.calls.length, 2);
});

test('Firestore reads retry temporary HTTP failures, but not missing documents or denied access', async () => {
  for (const status of [408, 429, 500, 502, 503, 504]) {
    const f = fixture([new Response('{}', { status }), ok()]);
    await requestJson(firestoreUrl, {}, f.runtime);
    assert.equal(f.calls.length, 2);
  }
  for (const status of [400, 401, 403, 404]) {
    const f = fixture([new Response('{}', { status })]);
    await assert.rejects(requestJson(firestoreUrl, {}, f.runtime), new RegExp(`HTTP ${status}`));
    assert.equal(f.calls.length, 1);
  }
});

test('state writes, signups and email delivery are never automatically repeated', async () => {
  for (const [url, method] of [
    [firestoreUrl, 'PATCH'],
    ['https://identitytoolkit.googleapis.com/v1/accounts:signUp', 'POST'],
    ['https://api.web3forms.com/submit', 'POST'],
  ]) {
    const f = fixture([timeout(), ok()]);
    await assert.rejects(requestJson(url, { method }, f.runtime));
    assert.equal(f.calls.length, 1);
    assert.deepEqual(f.delays, []);
  }
});

test('diagnostics omit query secrets, request bodies and response contents', async () => {
  const f = fixture([new Response(JSON.stringify({ error: 'private-response' }), { status: 403 })]);
  await assert.rejects(requestJson(`${firestoreUrl}?key=private-key`, {
    headers: { Authorization: 'Bearer private-token' }, body: 'private-body',
  }, f.runtime), (error) => {
    assert.match(error.message, /HTTP 403/);
    assert.doesNotMatch(error.message, /private-/);
    return true;
  });
});

test('caller cancellation prevents retrying a request', async () => {
  const f = fixture([timeout(), ok()]);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(requestJson(firestoreUrl, { signal: controller.signal }, f.runtime));
  assert.equal(f.calls.length, 1);
  assert.deepEqual(f.delays, []);
});
