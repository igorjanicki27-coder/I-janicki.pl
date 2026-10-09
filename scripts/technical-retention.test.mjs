import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cleanupTechnicalData, COLLECTIONS, retentionState } from './cleanup-technical-data.mjs';

const now = Date.parse('2026-10-09T12:00:00.000Z');
const day = 86400000;
const iso = age => new Date(now - age * day).toISOString();
const root = 'projects/i-janicki/databases/(default)/documents';
function document(id, age = 100, collection = 'stats_pin_attempts', fields = {}) {
  return { name: `${root}/${collection}/${id}`, createTime: iso(age), updateTime: iso(age), fields };
}
function reply(data, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => data };
}
function fixture(pages, deletions = []) {
  const calls = [];
  return {
    calls,
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      if (options.method === 'DELETE') {
        const response = deletions.shift();
        assert.ok(response, 'Unexpected deletion');
        return response;
      }
      const query = JSON.parse(options.body).structuredQuery;
      const page = pages[query.from[0].collectionId]?.shift() || [];
      return reply(page.map(document => ({ document })));
    },
  };
}

test('retention expires at exactly 90 times 24 hours, including leap days', () => {
  assert.equal(retentionState(document('old', 90), 'stats_pin_attempts', now), 'expired');
  assert.equal(retentionState(document('new', 90), 'stats_pin_attempts', now - 1), 'current');
  assert.equal(retentionState(document('future', -1), 'stats_pin_attempts', now), 'invalid');
  assert.equal(retentionState({ createTime: 'bad' }, 'stats_pin_attempts', now), 'invalid');
  const leap = Date.parse('2024-05-29T12:00:00.000Z');
  assert.equal(retentionState({ createTime: '2024-02-29T12:00:00.000Z' }, 'stats_pin_attempts', leap), 'expired');
  assert.throws(() => retentionState(document('other'), 'contact_leads', now), /outside/);
  assert.throws(() => retentionState(document('stats'), 'analytics_events', now), /outside/);
});

test('a recent login renews retention; an incident hold does not renew the clock', () => {
  const state = document('login', 100, 'stats_pin_attempts', { updatedAt: { timestampValue: iso(1) } });
  assert.equal(retentionState(state, 'stats_pin_attempts', now), 'current');
  state.fields.updatedAt.timestampValue = iso(90);
  state.updateTime = iso(1);
  assert.equal(retentionState(state, 'stats_pin_attempts', now), 'expired');
  delete state.fields.updatedAt;
  assert.equal(retentionState(state, 'stats_pin_attempts', now), 'expired');
  state.fields.updatedAt = { timestampValue: iso(-1) };
  assert.equal(retentionState(state, 'stats_pin_attempts', now), 'invalid');
});

test('incident exceptions need both a reason and a finite deadline', () => {
  const held = document('incident', 100, 'stats_sessions', {
    retentionUntil: { timestampValue: iso(-1) }, retentionReason: { stringValue: 'Security incident' },
  });
  assert.equal(retentionState(held, 'stats_sessions', now), 'held');
  held.fields.retentionUntil.timestampValue = iso(0);
  assert.equal(retentionState(held, 'stats_sessions', now), 'expired');
  held.fields.retentionReason.stringValue = '';
  assert.equal(retentionState(held, 'stats_sessions', now), 'invalid');
  delete held.fields.retentionReason;
  assert.equal(retentionState(held, 'stats_sessions', now), 'invalid');
});

test('dry run is the default and reads only allowlisted collections with a field projection', async () => {
  const mock = fixture({ stats_pin_attempts: [[document('new', 1), document('old')]] });
  const result = await cleanupTechnicalData({ accessToken: 'test-token', now, fetchImpl: mock.fetchImpl });
  assert.equal(result.dryRun, true);
  assert.equal(result.collections.stats_pin_attempts.expired, 1);
  assert.equal(result.collections.stats_pin_attempts.deleted, 0);
  assert.deepEqual(Object.keys(result.collections), COLLECTIONS);
  for (const { url, options } of mock.calls) {
    assert.ok(url.startsWith(`https://firestore.googleapis.com/v1/${root}`));
    assert.equal(options.method, 'POST');
    assert.equal(options.headers.Authorization, 'Bearer test-token');
    const query = JSON.parse(options.body).structuredQuery;
    assert.equal(query.from[0].allDescendants, false);
    assert.deepEqual(query.select.fields.map(field => field.fieldPath), ['updatedAt', 'retentionUntil', 'retentionReason']);
  }
});

test('pagination survives deletion and updated documents fail the version precondition safely', async () => {
  const a = document('a');
  const b = document('b');
  const c = document('c');
  const mock = fixture({ stats_pin_attempts: [[a, b], [c]] }, [
    reply({}), reply({ error: { status: 'FAILED_PRECONDITION' } }, 400), reply({ error: { status: 'NOT_FOUND' } }, 404),
  ]);
  const result = await cleanupTechnicalData({ accessToken: 'test-token', now, fetchImpl: mock.fetchImpl, dryRun: false, pageSize: 2 });
  assert.deepEqual(result.collections.stats_pin_attempts, { scanned: 3, expired: 3, deleted: 1, changed: 2, held: 0, invalid: 0 });
  const queries = mock.calls.filter(call => call.options.method === 'POST');
  assert.deepEqual(JSON.parse(queries[1].options.body).structuredQuery.startAt, { values: [{ referenceValue: b.name }], before: false });
  const deletes = mock.calls.filter(call => call.options.method === 'DELETE');
  assert.equal(deletes.length, 3);
  assert.equal(new URL(deletes[0].url).searchParams.get('currentDocument.updateTime'), a.updateTime);
});

test('held, current and invalid records survive deletion mode', async () => {
  const mock = fixture({ stats_pin_attempts: [[
    document('current', 1),
    document('held', 100, 'stats_pin_attempts', { retentionUntil: { timestampValue: iso(-1) }, retentionReason: { stringValue: 'Incident' } }),
    { ...document('invalid'), createTime: 'bad' },
  ]] });
  const result = await cleanupTechnicalData({ accessToken: 'test-token', now, fetchImpl: mock.fetchImpl, dryRun: false });
  assert.equal(result.collections.stats_pin_attempts.held, 1);
  assert.equal(result.collections.stats_pin_attempts.invalid, 1);
  assert.ok(mock.calls.every(call => call.options.method === 'POST'));
});

test('query or deletion errors stop cleanup instead of claiming success', async () => {
  await assert.rejects(cleanupTechnicalData({ accessToken: 'test-token', fetchImpl: async () => reply({}, 403) }), /HTTP 403/);
  const mock = fixture({ stats_pin_attempts: [[document('old')]] }, [reply({ error: { status: 'PERMISSION_DENIED' } }, 403)]);
  await assert.rejects(cleanupTechnicalData({ accessToken: 'test-token', now, fetchImpl: mock.fetchImpl, dryRun: false }), /HTTP 403/);
  assert.equal(mock.calls.length, 2);
});

test('unexpected collection paths, missing versions and stuck cursors stop safely', async () => {
  for (const bad of [document('private', 100, 'contact_leads'), { ...document('old'), updateTime: undefined }]) {
    const mock = fixture({ stats_pin_attempts: [[bad]] });
    await assert.rejects(cleanupTechnicalData({ accessToken: 'test-token', now, fetchImpl: mock.fetchImpl, dryRun: false }));
    assert.equal(mock.calls.length, 1);
  }
  const mock = fixture({ stats_pin_attempts: [[document('a')], [document('a')]] });
  await assert.rejects(cleanupTechnicalData({ accessToken: 'test-token', now, fetchImpl: mock.fetchImpl, pageSize: 1 }), /pagination/);
});

test('statistics history is excluded from technical data deletion', () => {
  assert.ok(!COLLECTIONS.includes('analytics_events'));
  assert.throws(() => retentionState(document('event', 100, 'analytics_events'), 'analytics_events', now), /outside/);
});
