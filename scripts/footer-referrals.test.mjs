import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';

const source = name => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
const companies = ['elmet', 'el-tech', 'suszycka', 'sredzka-korona', 'centrum-przyjec', 'i-janek', 'strzelca'];
const storage = () => {
  const values = new Map();
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
  };
};

function landing(href, { consent = false, sessionStorage = storage(), failWrites = false, blockedStorage = false } = {}) {
  const writes = [];
  const requests = [];
  const scripts = [];
  const location = new URL(href, 'https://i-janicki.pl');
  const localStorage = storage();
  localStorage.setItem('ijanek_cookie_analytics', 'true');
  if (blockedStorage) {
    localStorage.getItem = () => { throw new Error('Storage disabled'); };
    sessionStorage.getItem = () => { throw new Error('Storage disabled'); };
    sessionStorage.setItem = () => { throw new Error('Storage disabled'); };
  }
  const app = {};
  const window = {
    location, sessionStorage,
    history: {
      state: { keep: true },
      replaceState(state, _, target) { this.state = state; location.href = new URL(target, location).href; },
    },
    IJanickiCookieConsent: { ensureCurrent: () => consent },
    firebase: {
      apps: [app], app: () => app, initializeApp: () => app,
      firestore: () => ({ collection: () => ({ add: async payload => {
        if (failWrites) throw new Error('Offline');
        writes.push(payload);
      } }) }),
    },
    addEventListener() {},
  };
  const document = {
    createElement: () => ({}), head: { appendChild: node => scripts.push(node) }, addEventListener() {},
  };
  const context = vm.createContext({ window, document, localStorage, sessionStorage, URL, console: { warn() {} },
    fetch: async (url, options) => {
      requests.push({ url, options, body: JSON.parse(options.body) });
      if (failWrites) throw new Error('Offline');
      return { ok: true };
    },
  });
  vm.runInContext(source('analytics.js'), context);
  return { window, writes, requests, scripts, sessionStorage,
    allow: () => { consent = true; },
    recover: () => { failWrites = false; },
    track: () => window.IJanickiAnalytics.maybeTrackHomeVisit(),
  };
}

test('each static entry redirects immediately with JS and has a no-JS fallback', () => {
  for (const company of companies) {
    const html = source(`stopka/${company}/index.html`);
    const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
    let destination;
    vm.runInNewContext(script, { window: { location: { replace: value => { destination = value; } } } });
    assert.equal(destination, `/?stopka=${company}`);
    assert.ok(html.includes(`content="0;url=${destination}"`));
    assert.ok(html.includes(`href="${destination}"`));
    assert.ok(html.includes('noindex,follow'));
    assert.ok(!html.includes('analytics.js'));
  }
  assert.ok(source('scripts/generate-seo-files.mjs').includes("'stopka',"));
});

test('every company is counted without consent, cookies, user IDs or a retained URL marker', async () => {
  for (const company of companies) {
    const page = landing(`/?stopka=${company}&keep=1#kontakt`);
    assert.equal(page.window.location.pathname, '/');
    assert.equal(page.window.location.search, '?keep=1');
    assert.equal(page.window.location.hash, '#kontakt');
    assert.equal(page.window.history.state.keep, true);
    assert.equal(await page.track(), false);
    assert.equal(page.writes.length, 0);
    assert.equal(page.scripts.length, 0);
    assert.equal(page.requests.length, 1);
    const request = page.requests[0];
    assert.equal(request.url, 'https://firestore.googleapis.com/v1/projects/i-janicki/databases/(default)/documents/analytics_events');
    assert.equal(request.options.method, 'POST');
    assert.equal(request.options.credentials, 'omit');
    assert.equal(request.options.referrerPolicy, 'no-referrer');
    assert.equal(request.options.keepalive, true);
    assert.deepEqual(Object.keys(request.body.fields).sort(), ['path', 'timestamp', 'type']);
    assert.equal(request.body.fields.type.stringValue, 'page_visit');
    assert.equal(request.body.fields.path.stringValue, `/stopka/${company}/`);
    assert.ok(Number.isFinite(Date.parse(request.body.fields.timestamp.timestampValue)));
    assert.equal(page.sessionStorage.getItem(`ijanek_metric_page_visit_logged:/stopka/${company}/`), null);
    page.allow();
    await page.track();
    assert.deepEqual(page.writes.map(event => event.path), ['/']);
    await page.track();
    assert.equal(page.writes.length, 1);
    assert.equal(page.requests.length, 1);
  }
});

test('each repeated arrival is counted in the same session, while home analytics stays separate', async () => {
  const sessionStorage = storage();
  const first = landing('/?stopka=elmet', { consent: true, sessionStorage });
  await Promise.all([first.track(), first.track()]);
  assert.equal(first.writes.length, 1);
  assert.equal(first.requests.length, 1);
  const repeat = landing('/?stopka=elmet', { consent: true, sessionStorage });
  await repeat.track();
  assert.equal(repeat.writes.length, 0);
  assert.equal(repeat.requests.length, 1);
  const other = landing('/?stopka=el-tech', { consent: true, sessionStorage });
  await other.track();
  assert.equal(other.writes.length, 0);
  assert.equal(other.requests.length, 1);
  assert.equal(other.requests[0].body.fields.path.stringValue, '/stopka/el-tech/');
});

test('ordinary visits and unknown or misplaced markers do not create footer measurements', async () => {
  for (const url of ['/', '/?stopka=unknown', '/kontakt/?stopka=elmet']) {
    const page = landing(url);
    page.allow();
    await page.track();
    assert.equal(page.writes.length, 1);
    assert.equal(page.requests.length, 0);
  }
});

test('the counter works with storage disabled and does not load analytics services', () => {
  const page = landing('/index.html?stopka=elmet', { blockedStorage: true });
  assert.equal(page.requests.length, 1);
  assert.equal(page.writes.length, 0);
  assert.equal(page.scripts.length, 0);
  assert.ok(page.window.dataLayer.every(entry => entry[0] === 'consent'));
});

test('failed counter requests leave the visitor on the clean home URL', async () => {
  const page = landing('/?stopka=suszycka', { failWrites: true });
  await Promise.resolve();
  assert.equal(await page.track(), false);
  assert.equal(page.window.location.href, 'https://i-janicki.pl/');
  assert.equal(page.writes.length, 0);
  assert.equal(page.requests.length, 1);
});

test('Stats separates footer data and refreshes it without reopening the PIN session', async () => {
  const now = Date.now();
  const events = [
    { type: 'page_visit', path: '/', timestamp: new Date(now - 1000) },
    { type: 'page_visit', path: '/stopka/elmet/', timestamp: new Date(now - 1000) },
    { type: 'page_visit', path: '/stopka/elmet', timestamp: new Date(now - 40 * 86400000) },
    { type: 'page_visit', path: '/stopka/suszycka/index.html', timestamp: new Date(now - 1000) },
    { type: 'page_visit', path: '/stopka/i-janek/', timestamp: new Date(now - 1000) },
    { type: 'page_visit', path: '/stopka/strzelca/', timestamp: new Date(now - 1000) },
    { type: 'page_visit', path: '/stopka/centrum-przyjec/', timestamp: new Date(now + 86400000) },
  ];
  const nodes = new Map();
  const document = { getElementById(id) {
    if (!nodes.has(id)) nodes.set(id, { style: {}, value: 'test', hidden: true, focus() {}, handlers: {}, attributes: {},
      addEventListener(name, handler) { this.handlers[name] = handler; },
      setAttribute(name, value) { this.attributes[name] = value; },
    });
    return nodes.get(id);
  } };
  let eventReads = 0;
  let formReads = 0;
  let reviewReads = 0;
  let sessionCommits = 0;
  let failNextRead = false;
  const db = {
    collection: name => ({
      get: async options => {
        assert.equal(options.source, 'server');
        eventReads++;
        if (failNextRead) { failNextRead = false; throw new Error('Offline'); }
        return { docs: events.map(event => ({ get: key => event[key] })) };
      },
      doc: () => ({ get: async options => {
        if (name !== 'contact_form_stats') return { exists: false };
        assert.equal(options.source, 'server');
        formReads++;
        return { exists: true, get: () => formReads };
      } }),
    }),
    batch: () => ({ set() {}, commit: async () => { sessionCommits++; } }),
  };
  const firestore = () => db;
  firestore.Timestamp = { fromMillis: value => value };
  firestore.FieldValue = { serverTimestamp: () => new Date() };
  const app = {};
  const window = { firebase: { apps: [app], app: () => app, initializeApp: () => app,
    firestore, auth: () => ({ currentUser: { uid: 'test-user' } }),
  } };
  const html = source('stats/index.html');
  const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].at(-1)[1];
  vm.runInNewContext(script, { window, document, crypto: webcrypto, TextEncoder, URL, console: { warn() {} },
    fetch: async (_, options) => {
      assert.equal(options.cache, 'no-store');
      reviewReads++;
      return { ok: true, json: async () => ({ reviews: [] }) };
    },
  });
  const refreshButton = nodes.get('refreshStats');
  assert.equal(refreshButton.hidden, true);
  await nodes.get('pinSubmit').handlers.click();
  assert.equal(nodes.get('pinGate').style.display, 'none');
  assert.equal(refreshButton.hidden, false);
  assert.equal(nodes.get('visitsValue').textContent, '1');
  assert.equal(nodes.get('todayVisits').textContent, '1');
  assert.ok(!nodes.get('pageVisitsRows').innerHTML.includes('/stopka/'));
  const footerRows = nodes.get('footerVisitsRows').innerHTML;
  assert.match(footerRows, /<td>ELMET<\/td><td>1<\/td><td>1<\/td><td>1<\/td><td>2<\/td>/);
  assert.match(footerRows, /<td>Suszycka<\/td><td>1<\/td><td>1<\/td><td>1<\/td><td>1<\/td>/);
  assert.match(footerRows, /<td>Centrum Przyjęć<\/td><td>0<\/td><td>0<\/td><td>0<\/td><td>0<\/td>/);
  assert.match(footerRows, /<td>i-JANEK<\/td><td>1<\/td><td>1<\/td><td>1<\/td><td>1<\/td>/);
  assert.match(footerRows, /<td>strzelca\.pl<\/td><td>1<\/td><td>1<\/td><td>1<\/td><td>1<\/td>/);
  assert.equal((footerRows.match(/<tr>/g) || []).length, companies.length);

  events.push({ type: 'page_visit', path: '/stopka/elmet/', timestamp: new Date(now - 500) });
  events.push({ type: 'page_visit', path: '/', timestamp: new Date(now - 500) });
  const refreshing = refreshButton.handlers.click();
  assert.equal(refreshButton.disabled, true);
  assert.equal(refreshButton.attributes['aria-busy'], 'true');
  assert.equal(nodes.get('refreshStatsLabel').textContent, 'Odświeżanie…');
  await Promise.all([refreshing, refreshButton.handlers.click()]);
  assert.equal(eventReads, 2);
  assert.equal(formReads, 2);
  assert.equal(reviewReads, 2);
  assert.equal(sessionCommits, 1);
  assert.equal(nodes.get('visitsValue').textContent, '2');
  assert.equal(nodes.get('contactFormsValue').textContent, '2');
  assert.match(nodes.get('footerVisitsRows').innerHTML, /<td>ELMET<\/td><td>2<\/td><td>2<\/td><td>2<\/td><td>3<\/td>/);
  assert.equal(refreshButton.disabled, false);
  assert.equal(refreshButton.attributes['aria-busy'], 'false');
  assert.equal(nodes.get('refreshStatsLabel').textContent, 'Odśwież');

  failNextRead = true;
  await refreshButton.handlers.click();
  assert.equal(refreshButton.disabled, false);
  assert.equal(refreshButton.attributes['aria-busy'], 'false');
  assert.match(nodes.get('statsStatus').textContent, /Nie udalo sie/);
  await refreshButton.handlers.click();
  assert.equal(nodes.get('visitsValue').textContent, '2');
  assert.equal(sessionCommits, 1);
});
