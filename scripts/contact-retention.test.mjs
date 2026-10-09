import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanupContactForms, planContactRetention } from './cleanup-contact-forms.mjs';

const now = Date.parse('2026-10-09T12:00:00.000Z');
const ROOT = 'projects/i-janicki/databases/(default)/documents';
const old = '2025-10-09T12:00:00.000Z';
const fresh = '2026-10-01T12:00:00.000Z';
function lead(id, dates, extra = {}) {
  return { name: `${ROOT}/contact_leads/${id}`, createTime: old, updateTime: fresh,
    fields: { email: { stringValue: 'test@example.invalid' }, message: { stringValue: 'Private content' },
      ...(dates ? { consentAcceptedDates: { arrayValue: { values: dates.map(timestampValue => ({ timestampValue })) } } } : {}) },
    ...extra,
  };
}
function reply(data, status = 200) { return { ok: status >= 200 && status < 300, status, json: async () => data }; }
function fixture(initial, { conflict = false, lostResponse = false } = {}) {
  const docs = new Map(initial.map(doc => [doc.name, structuredClone(doc)]));
  const requests = [];
  let counter = null;
  let version = 0;
  return { docs, requests, get counter() { return counter; }, fetchImpl: async (url, options) => {
    requests.push({ url, options });
    if (options.method === 'POST' && url.endsWith(':runQuery')) {
      const query = JSON.parse(options.body).structuredQuery;
      assert.equal(query.from[0].collectionId, 'contact_leads');
      assert.deepEqual(query.select.fields, [{ fieldPath: 'consentAcceptedDates' }]);
      const cursor = query.startAt?.values[0].referenceValue || '';
      const page = [...docs.values()].filter(doc => doc.name > cursor).sort((a, b) => a.name.localeCompare(b.name)).slice(0, query.limit);
      return reply(page.map(doc => ({ document: { ...doc, fields: doc.fields.consentAcceptedDates
        ? { consentAcceptedDates: doc.fields.consentAcceptedDates } : {} } })));
    }
    if (options.method === 'POST' && url.endsWith(':commit')) {
      const { writes } = JSON.parse(options.body);
      if (writes.length === 2) {
        const name = writes[0].delete || writes[0].update.name;
        if (conflict) { conflict = false; return reply({ error: { status: 'FAILED_PRECONDITION' } }, 400); }
        assert.equal(writes[0].currentDocument.updateTime, docs.get(name)?.updateTime);
        assert.ok(writes[1].update.name.endsWith('/contact_form_stats/total'));
        if (writes[0].delete) docs.delete(name);
        else docs.get(name).fields.consentAcceptedDates = writes[0].update.fields.consentAcceptedDates;
        const increment = Number(writes[1].updateTransforms[0].increment.integerValue);
        counter ||= { fields: {}, updateTime: String(version) };
        counter.fields.archivedCount = { integerValue: String(Number(counter.fields.archivedCount?.integerValue || 0) + increment) };
        counter.updateTime = String(++version);
        if (lostResponse) { lostResponse = false; throw new Error('Lost response after successful commit'); }
      } else {
        assert.equal(writes.length, 1);
        if (counter) assert.equal(writes[0].currentDocument.updateTime, counter.updateTime);
        else assert.equal(writes[0].currentDocument.exists, false);
        counter ||= { fields: {} };
        counter.fields.totalCount = writes[0].update.fields.totalCount;
        counter.updateTime = String(++version);
      }
      return reply({});
    }
    assert.ok(url.endsWith('/contact_form_stats/total'));
    return counter ? reply(counter) : reply({}, 404);
  } };
}

test('expiry is twelve calendar months, including leap day, and repeated contacts are counted separately', () => {
  assert.equal(planContactRetention(lead('a', [old, fresh]), now).expired, 1);
  assert.equal(planContactRetention(lead('a', [old]), now - 1).expired, 0);
  assert.equal(planContactRetention(lead('a', ['2024-02-29T12:00:00Z']), Date.parse('2025-02-28T12:00:00Z')).expired, 1);
  assert.equal(planContactRetention(lead('a', null), now).expired, 1);
  assert.equal(planContactRetention(lead('a', ['bad']), now).invalid, true);
  assert.equal(planContactRetention(lead('a', ['2027-01-01T00:00:00Z']), now).invalid, true);
});

test('dry run never changes contact data or counter', async () => {
  const db = fixture([lead('a', [old])]);
  const result = await cleanupContactForms({ accessToken: 'test', now, fetchImpl: db.fetchImpl });
  assert.equal(result.expired, 1);
  assert.equal(result.deleted, 0);
  assert.equal(db.docs.size, 1);
  assert.equal(db.counter, null);
  assert.ok(db.requests.every(request => request.url.endsWith(':runQuery')));
});

test('expired content and sender identifier disappear while a numeric counter survives reruns', async () => {
  const db = fixture([lead('a', [old, old]), lead('b', [fresh])]);
  const result = await cleanupContactForms({ accessToken: 'test', now, fetchImpl: db.fetchImpl, dryRun: false, pageSize: 1 });
  assert.equal(result.deleted, 1);
  assert.equal(db.docs.has(`${ROOT}/contact_leads/a`), false);
  assert.equal(db.counter.fields.archivedCount.integerValue, '2');
  assert.equal(db.counter.fields.totalCount.integerValue, '3');
  await cleanupContactForms({ accessToken: 'test', now, fetchImpl: db.fetchImpl, dryRun: false });
  assert.equal(db.counter.fields.archivedCount.integerValue, '2');
  assert.equal(db.counter.fields.totalCount.integerValue, '3');
  assert.deepEqual(Object.keys(db.counter.fields).sort(), ['archivedCount', 'totalCount']);
});

test('old consent dates are removed even when the same sender has a recent submission', async () => {
  const db = fixture([lead('a', [old, fresh])]);
  const result = await cleanupContactForms({ accessToken: 'test', now, fetchImpl: db.fetchImpl, dryRun: false });
  assert.equal(result.trimmed, 1);
  assert.equal(db.docs.get(`${ROOT}/contact_leads/a`).fields.consentAcceptedDates.arrayValue.values.length, 1);
  assert.equal(db.counter.fields.archivedCount.integerValue, '1');
  assert.equal(db.counter.fields.totalCount.integerValue, '2');
});

test('failed source precondition leaves both source and archived count unchanged', async () => {
  const db = fixture([lead('a', [old])], { conflict: true });
  const result = await cleanupContactForms({ accessToken: 'test', now, fetchImpl: db.fetchImpl, dryRun: false });
  assert.equal(result.changed, 1);
  assert.equal(db.docs.size, 1);
  assert.equal(db.counter.fields.archivedCount, undefined);
  assert.equal(db.counter.fields.totalCount.integerValue, '1');
});

test('lost response after atomic deletion cannot double-count on retry', async () => {
  const db = fixture([lead('a', [old])], { lostResponse: true });
  await assert.rejects(cleanupContactForms({ accessToken: 'test', now, fetchImpl: db.fetchImpl, dryRun: false }), /Lost response/);
  assert.equal(db.docs.size, 0);
  await cleanupContactForms({ accessToken: 'test', now, fetchImpl: db.fetchImpl, dryRun: false });
  assert.equal(db.counter.fields.archivedCount.integerValue, '1');
  assert.equal(db.counter.fields.totalCount.integerValue, '1');
});

test('invalid dates, wrong collection paths and access errors cannot trigger deletion', async () => {
  const db = fixture([lead('a', ['bad'])]);
  const summary = await cleanupContactForms({ accessToken: 'test', now, fetchImpl: db.fetchImpl });
  assert.equal(summary.invalid, 1);
  assert.equal(db.docs.size, 1);
  await assert.rejects(cleanupContactForms({ accessToken: 'test', now, fetchImpl: async () => reply({}, 403) }), /HTTP 403/);
  await assert.rejects(cleanupContactForms({ accessToken: 'test', now, fetchImpl: async () => reply([
    { document: { ...lead('a', [old]), name: `${ROOT}/calculator_orders/a` } },
  ]) }), /Unexpected/);
});
