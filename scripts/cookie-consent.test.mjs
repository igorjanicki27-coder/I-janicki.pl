import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { cleanupCookieConsents, evidenceExpiresAt, isExpired, minimizeStatsData } from './cleanup-cookie-consents.mjs';

const require = createRequire(import.meta.url);
const { expiresAfter12Months } = require('../cookie-consent.js');
const source = name => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
const prefix = 'ijanek_cookie_';
const currentTime = Date.parse('2026-10-09T12:00:00.000Z');

function storage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
    key: index => [...values.keys()][index] ?? null,
    get length() { return values.size; },
  };
}

function browser(initial = {}) {
  let clock = currentTime;
  const listeners = new Map();
  const domListeners = new Map();
  const timers = [];
  const writes = [];
  const cookies = [];
  const nodes = new Map();
  let uuid = 0;
  const localStorage = storage(initial);
  const sessionStorage = storage();
  class FakeDate extends Date {
    constructor(...args) { super(...(args.length ? args : [clock])); }
    static now() { return clock; }
  }
  const document = {
    addEventListener: (name, listener) => domListeners.set(name, listener),
    querySelector: () => null,
    querySelectorAll: () => [],
    getElementById: id => nodes.get(id) || null,
    createElement: () => ({}),
    head: { appendChild() {} },
    get cookie() { return '_ga=old; _gcl_au=old; site_preference=keep'; },
    set cookie(value) { cookies.push(value); },
  };
  const window = {
    localStorage, sessionStorage, document,
    location: { hostname: 'i-janicki.pl', pathname: '/dokumenty/', origin: 'https://i-janicki.pl' },
    Event: class { constructor(type) { this.type = type; } },
    addEventListener(name, listener) {
      listeners.set(name, [...(listeners.get(name) || []), listener]);
    },
    dispatchEvent: event => (listeners.get(event.type) || []).forEach(listener => listener(event)),
    setTimeout: callback => { timers.push(callback); return timers.length; },
    clearTimeout() {},
    crypto: { randomUUID: () => 'test-uuid-' + (++uuid) },
  };
  const context = vm.createContext({ window, document, localStorage, sessionStorage, Date: FakeDate,
    URL, console, setTimeout: window.setTimeout, requestAnimationFrame: callback => callback(),
    fetch: async (url, options) => { writes.push({ url, record: JSON.parse(options.body) }); return { ok: true }; },
  });
  vm.runInContext(source('cookie-consent.js'), context);
  return { context, window, localStorage, sessionStorage, timers, writes, cookies, nodes,
    advanceTo: value => { clock = Date.parse(value); },
  };
}

function savedChoice(date, decision = 'all') {
  return {
    [prefix + 'decision']: decision,
    [prefix + 'analytics']: 'true',
    [prefix + 'marketing']: 'true',
    [prefix + 'external']: 'true',
    [prefix + 'consent_updated_at']: date,
    [prefix + 'consent_id']: 'old-id',
    ijanek_anonymous_user_id: 'old-user',
    ijanek_theme: 'dark',
  };
}

test('twelve calendar months, including leap day and invalid dates', () => {
  assert.equal(expiresAfter12Months('2024-02-29T10:15:00.000Z'), '2025-02-28T10:15:00.000Z');
  assert.equal(expiresAfter12Months('2025-10-09T12:00:00.000Z'), '2026-10-09T12:00:00.000Z');
  assert.equal(expiresAfter12Months('bad'), null);
  assert.equal(expiresAfter12Months(null), null);
});

test('legacy choice keeps its original deadline; visits do not renew it', () => {
  const page = browser(savedChoice('2026-01-15T10:00:00.000Z', 'essential'));
  assert.equal(page.window.IJanickiCookieConsent.ensureCurrent(), true);
  assert.equal(page.localStorage.getItem(prefix + 'consent_expires_at'), '2027-01-15T10:00:00.000Z');
  assert.equal(page.localStorage.getItem(prefix + 'consent_updated_at'), '2026-01-15T10:00:00.000Z');
});

test('expiry clears consent metadata, optional cookies and session metrics before analytics', () => {
  const page = browser(savedChoice('2025-10-09T12:00:00.000Z'));
  assert.equal(page.localStorage.getItem(prefix + 'decision'), null);
  assert.equal(page.localStorage.getItem(prefix + 'consent_id'), null);
  assert.equal(page.localStorage.getItem('ijanek_anonymous_user_id'), null);
  assert.equal(page.localStorage.getItem('ijanek_theme'), null);
  assert.ok(page.cookies.some(value => value.startsWith('_ga=;')));
  assert.ok(page.cookies.every(value => !value.startsWith('site_preference=')));
  vm.runInContext(source('analytics.js'), page.context);
  assert.equal(page.window.hasAnalyticsConsent(), false);
  assert.equal(page.window._gaLoaded, undefined);
});

test('undated and future-dated legacy decisions cannot authorize analytics', () => {
  for (const date of ['', 'invalid', '2027-01-01T00:00:00.000Z']) {
    const page = browser(savedChoice(date));
    assert.equal(page.window.IJanickiCookieConsent.ensureCurrent(), false);
    assert.equal(page.localStorage.getItem(prefix + 'decision'), null);
  }
});

test('expiry on an open page revokes Google consent and requests a fresh choice', () => {
  const page = browser(savedChoice('2025-10-09T12:00:01.000Z', 'essential'));
  page.localStorage.setItem(prefix + 'analytics', 'false');
  vm.runInContext(source('analytics.js'), page.context);
  let prompted = false;
  page.window.addEventListener('ijanicki:consent-expired', () => { prompted = true; });
  page.sessionStorage.setItem('ijanek_metric_page_visit_logged:/', 'true');
  page.advanceTo('2026-10-09T12:00:01.000Z');
  page.timers.at(-1)();
  assert.equal(prompted, true);
  assert.equal(page.sessionStorage.length, 0);
  assert.equal(page.window.dataLayer.at(-1)[2].analytics_storage, 'denied');
});

test('homepage accept, reject and custom choices persist a matching twelve-month expiry', () => {
  const page = browser();
  vm.runInContext(source('analytics.js'), page.context);
  vm.runInContext(source('script.js'), page.context);
  vm.runInContext('cookieDecideAll(true)', page.context);
  assert.equal(page.window.hasAnalyticsConsent(), true);
  const gaConfig = page.window.dataLayer.find(entry => entry[0] === 'config');
  assert.equal(gaConfig[2].cookie_expires, 31536000);
  assert.equal(gaConfig[2].cookie_update, false);
  assert.equal(page.writes[0].record.expires_at, '2027-10-09T12:00:00.000Z');
  vm.runInContext('cookieDecideAll(false)', page.context);
  assert.equal(page.window.hasAnalyticsConsent(), false);
  assert.equal(page.writes[1].record.action, 'reject_all');
  page.nodes.set('analytics', { checked: true });
  vm.runInContext('saveCookieSettings()', page.context);
  assert.equal(page.writes[2].record.action, 'save_preferences');
  assert.equal(page.writes[2].record.marketing, false);
  assert.equal(page.localStorage.getItem(prefix + 'consent_expires_at'), page.writes[2].record.expires_at);
  assert.equal(new Set(page.writes.map(write => write.url)).size, 3);
  assert.equal(new Set(page.writes.map(write => write.record.anonymous_user_id)).size, 1);
  assert.ok(page.writes.every(write => write.record.policy_version === '1.4'));
});

test('subpage choices keep separate evidence while updating the current browser choice', () => {
  const page = browser(savedChoice('2026-01-15T10:00:00.000Z', 'essential'));
  vm.runInContext(source('analytics.js'), page.context);
  let click;
  page.nodes.set('cookieOverlay', {
    addEventListener(name, listener) { if (name === 'click') click = listener; },
    setAttribute() {}, querySelector: () => null,
  });
  vm.runInContext(source('oferta.js'), page.context);
  click({ target: { closest: () => ({ dataset: { cookieAction: 'all' } }) } });
  assert.equal(page.window.hasAnalyticsConsent(), true);
  assert.notEqual(page.writes[0].record.consent_id, 'old-id');
  assert.equal(page.writes[0].record.anonymous_user_id, 'old-user');
  assert.equal(page.writes[0].record.expires_at, '2027-10-09T12:00:00.000Z');
  click({ target: { closest: () => ({ dataset: { cookieAction: 'reject' } }) } });
  assert.notEqual(page.writes[0].url, page.writes[1].url);
  assert.equal(page.localStorage.getItem(prefix + 'consent_id'), page.writes[1].record.consent_id);
});

test('cleanup deletes evidence three years after expiry and protects concurrent changes', async () => {
  const expired = { updated_at: '2022-10-09T12:00:00.000Z' };
  const recent = { updated_at: '2026-10-01T12:00:00.000Z' };
  const requests = [];
  const responses = [
    { data: { anon: { old: expired, current: recent, renewed: expired, race: expired, invalid: {} } } },
    { data: expired, etag: 'old-etag' }, { data: null },
    { data: recent, etag: 'new-etag' },
    { data: expired, etag: 'race-etag' }, { status: 412 },
  ];
  const fetchImpl = async (url, options) => {
    requests.push({ url, options });
    const { data, etag, status = 200 } = responses.shift();
    return { ok: status === 200, status, json: async () => data, headers: { get: () => etag } };
  };
  const result = await cleanupCookieConsents({ accessToken: 'test-token', now: currentTime, fetchImpl });
  assert.deepEqual(result, { expired: 3, minimized: 0, deleted: 1, changed: 2, invalid: 1, dryRun: false });
  const deletes = requests.filter(request => request.options.method === 'DELETE');
  assert.equal(deletes.length, 2);
  assert.equal(deletes[0].options.headers['if-match'], 'old-etag');
  assert.ok(requests.every(request => request.url.includes('/cookie_consents')));
  assert.equal(isExpired({ created_at: expired.updated_at }, currentTime), true);
});

test('proof retention is three calendar years after the twelve-month expiry', () => {
  assert.equal(evidenceExpiresAt({ updated_at: '2026-10-09T12:00:00.000Z' }), '2030-10-09T12:00:00.000Z');
  assert.equal(evidenceExpiresAt({ created_at: '2024-02-29T10:15:00.000Z' }), '2028-02-28T10:15:00.000Z');
  assert.equal(evidenceExpiresAt({ updated_at: 'invalid' }), null);
});

test('expired choice leaves only limited evidence and is not deleted before its proof deadline', async () => {
  const expired = {
    consent_id: 'decision', anonymous_user_id: 'anon',
    created_at: '2025-10-09T12:00:00.000Z', updated_at: '2025-10-09T12:00:00.000Z',
    expires_at: '2026-10-09T12:00:00.000Z', policy_version: '1.3', essential: true,
    analytics: true, marketing: false, external_media: false, action: 'save_preferences',
    analytics_storage: 'granted', ad_storage: 'denied', ip: 'legacy-ip', email: 'legacy@example.com',
  };
  const calls = [];
  const responses = [
    new Response(JSON.stringify({ anon: { decision: expired, minimal: { updated_at: expired.updated_at } } })),
    new Response(JSON.stringify(expired), { headers: { etag: 'version-1' } }),
    new Response('null'),
  ];
  const result = await cleanupCookieConsents({ accessToken: 'test-token', now: currentTime,
    fetchImpl: async (url, options) => { calls.push({ url, options }); return responses.shift(); },
  });
  assert.equal(result.minimized, 1);
  assert.equal(result.deleted, 0);
  assert.equal(calls.length, 3);
  const write = calls.find(call => call.options.method === 'PUT');
  assert.equal(write.options.headers['if-match'], 'version-1');
  const retained = JSON.parse(write.options.body);
  assert.equal(retained.analytics, true);
  assert.equal(retained.policy_version, '1.3');
  for (const field of ['ip', 'email', 'analytics_storage', 'ad_storage']) assert.equal(retained[field], undefined);

  // The existing evidence survives until exactly three years after choice expiry.
  const deadline = Date.parse(evidenceExpiresAt(expired));
  const methods = [];
  const fetchImpl = async (_, options) => {
    methods.push(options.method || 'GET');
    return new Response(JSON.stringify({ anon: { decision: retained } }));
  };
  await cleanupCookieConsents({ accessToken: 'test-token', now: deadline - 1, fetchImpl });
  assert.deepEqual(methods, ['GET']);
});

test('concurrent changes and missing ETags cannot destroy evidence during minimization', async () => {
  const record = { updated_at: '2025-10-09T12:00:00.000Z', analytics_storage: 'granted' };
  let step = 0;
  const result = await cleanupCookieConsents({ accessToken: 'test-token', now: currentTime,
    fetchImpl: async (_, options) => {
      step++;
      if (step === 1) return new Response(JSON.stringify({ anon: { choice: record } }));
      if (step === 2) return new Response(JSON.stringify(record), { headers: { etag: 'old' } });
      assert.equal(options.method, 'PUT');
      return new Response('null', { status: 412 });
    },
  });
  assert.equal(result.changed, 1);
  assert.equal(result.minimized, 0);
  step = 0;
  await assert.rejects(cleanupCookieConsents({ accessToken: 'test-token', now: currentTime,
    fetchImpl: async (_, options) => {
      assert.equal(options.method, undefined);
      return new Response(JSON.stringify(++step === 1 ? { anon: { choice: record } } : record));
    },
  }), /ETag/);
});

test('dry run never mutates Firebase and errors stop cleanup', async () => {
  const result = await cleanupCookieConsents({ accessToken: 'test-token', now: currentTime, dryRun: true,
    fetchImpl: async (_, options) => {
      assert.equal(options.method, undefined);
      return { ok: true, json: async () => ({ anon: { old: { updated_at: '2020-01-01' } } }) };
    },
  });
  assert.equal(result.expired, 1);
  assert.equal(result.deleted, 0);
  await assert.rejects(cleanupCookieConsents({ accessToken: 'test-token', fetchImpl: async () => ({ ok: false, status: 403 }) }), /HTTP 403/);
});

test('stats minimization preserves metrics and legacy page fallback, removing surplus fields', async () => {
  const statsFields = { type: { stringValue: 'page_visit' }, timestamp: { timestampValue: '2025-01-01T00:00:00Z' } };
  const name = 'projects/i-janicki/databases/(default)/documents/analytics_events/example';
  const requests = [];
  const result = await minimizeStatsData({ accessToken: 'test-token', fetchImpl: async (url, options) => {
    requests.push({ url, options });
    if (options.method === 'PATCH') return { ok: true };
    return { ok: true, json: async () => ({ documents: [
      { name, updateTime: '2026-10-01T12:00:00Z', fields: { ...statsFields, page: { stringValue: 'home' }, source: { stringValue: 'page_entry' } } },
      { name: name + '2', fields: { ...statsFields, path: { stringValue: '/' } } },
    ] }) };
  } });
  assert.deepEqual(result, { minimized: 1, changed: 0, candidates: 1 });
  const update = requests.find(request => request.options.method === 'PATCH');
  const fields = JSON.parse(update.options.body).fields;
  assert.equal(fields.path.stringValue, '/');
  assert.deepEqual(fields.type, statsFields.type);
  assert.deepEqual(fields.timestamp, statsFields.timestamp);
  assert.equal(fields.source, undefined);
  assert.equal(fields.page, undefined);
  const url = new URL(update.url);
  assert.equal(url.searchParams.get('currentDocument.updateTime'), '2026-10-01T12:00:00Z');
  assert.deepEqual(url.searchParams.getAll('updateMask.fieldPaths'), ['path', '`page`', '`source`']);
});

test('stats dry run and pagination leave the stored data unchanged', async () => {
  let calls = 0;
  const result = await minimizeStatsData({ accessToken: 'test-token', dryRun: true, fetchImpl: async (url, options) => {
    assert.equal(options.method, undefined);
    calls++;
    if (calls === 1) return { ok: true, json: async () => ({ nextPageToken: 'next', documents: [{ fields: { source: {} } }] }) };
    assert.equal(new URL(url).searchParams.get('pageToken'), 'next');
    return { ok: true, json: async () => ({}) };
  } });
  assert.equal(calls, 2);
  assert.equal(result.candidates, 1);
  assert.equal(result.minimized, 0);
});


test('legacy form submission timestamp expires independently from cookie consent', () => {
  const page = browser({ ijanek_form_last_submit: String(Date.parse('2025-10-09T12:00:00.000Z')) });
  assert.equal(page.localStorage.getItem('ijanek_form_last_submit'), null);
  const freshPage = browser({ ijanek_form_last_submit: String(currentTime) });
  assert.equal(freshPage.localStorage.getItem('ijanek_form_last_submit'), String(currentTime));
});
