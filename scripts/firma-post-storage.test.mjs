import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import { filterDeletedPostCollections, markPostTabDeleted } from '../firma/post-state.mjs';

const storageKey = 'ijanicki_firma_state_v1';
const plain = (value) => JSON.parse(JSON.stringify(value));

// Exercise the real storage modules without contacting production Firebase.
async function fixture() {
  const documents = new Map();
  const local = new Map();
  let cloudState;
  let permissionDenied = false;
  const checkPermission = () => {
    if (permissionDenied) throw Object.assign(new Error('permission-denied'), { code: 'permission-denied' });
  };
  const saveDoc = (path, value, options) => {
    const previous = options?.merge ? (documents.get(path) || {}) : {};
    documents.set(path, {
      ...previous, ...plain(value),
      ...(value.deletedPostTabs ? {
        deletedPostTabs: { ...previous.deletedPostTabs, ...plain(value.deletedPostTabs) },
      } : {}),
    });
  };
  const firebase = {
    db: {},
    doc: (_db, ...parts) => parts.join('/'),
    collection: (_db, ...parts) => parts.join('/'),
    ensureFirmyAdminSession: async () => {},
    getSetting: async () => cloudState,
    setSetting: async (_path, value) => { cloudState = plain(value); },
    getDoc: async (path) => {
      checkPermission();
      return { data: () => documents.get(path) };
    },
    getDocs: async (path) => {
      checkPermission();
      return { docs: [...documents.entries()]
        .filter(([key]) => key.startsWith(`${path}/`) && !key.slice(path.length + 1).includes('/'))
        .map(([key, value]) => ({ id: key.split('/').at(-1), data: () => plain(value) })) };
    },
    setDoc: async (...args) => { checkPermission(); saveDoc(...args); },
    deleteDoc: async (path) => { checkPermission(); documents.delete(path); },
    writeBatch: () => {
      const writes = [];
      return {
        set: (...args) => writes.push(() => saveDoc(...args)),
        delete: (path) => writes.push(() => documents.delete(path)),
        commit: async () => { checkPermission(); writes.forEach((write) => write()); },
      };
    },
  };
  const context = vm.createContext({
    console: { warn() {}, info() {} },
    localStorage: { getItem: (key) => local.get(key) ?? null, setItem: (key, value) => local.set(key, value) },
    setTimeout: () => 1,
    clearTimeout() {},
  });
  const modules = new Map();
  const firebaseModule = new vm.SyntheticModule(Object.keys(firebase), function () {
    for (const [key, value] of Object.entries(firebase)) this.setExport(key, value);
  }, { context });
  async function load(url) {
    url.search = '';
    const key = url.href;
    if (modules.has(key)) return modules.get(key);
    const mod = new vm.SourceTextModule(await readFile(url, 'utf8'), { context, identifier: key });
    modules.set(key, mod);
    await mod.link((specifier, parent) => specifier.startsWith('./firebase.js')
      ? firebaseModule : load(new URL(specifier, parent.identifier)));
    return mod;
  }
  const storage = await load(new URL('../firma/storage.js', import.meta.url));
  await storage.evaluate();
  const posts = await load(new URL('../firma/post-storage.js', import.meta.url));
  await posts.evaluate();
  return {
    storage: storage.namespace, posts: posts.namespace, documents, local,
    setCloudState: (state) => { cloudState = { state: JSON.stringify(state) }; },
    denyPermission: () => { permissionDenied = true; },
  };
}

const firm = () => ({
  id: 'test-firm', name: 'Firma testowa', updatedAt: '2026-10-14T10:00:00Z',
  postTabs: [{ id: 'google-posts', name: 'Wpisy Google' }, { id: 'custom', name: 'Wlasna' }],
  posts: [{ id: 'deleted-post', tabId: 'google-posts' }, { id: 'retained-post', tabId: 'custom' }],
});

test('deleted tab and its posts stay deleted after cloud sync and a fresh load', async () => {
  const f = await fixture();
  const stale = firm();
  const current = firm();
  await f.posts.savePostTabs(current, current.postTabs);
  await f.posts.savePosts(current, current.posts);
  await f.posts.deletePostTab(current, 'google-posts');
  markPostTabDeleted(current, 'google-posts');
  current.updatedAt = '2026-10-14T11:00:00Z';
  f.storage.saveState({ firms: [current] });
  f.setCloudState({ firms: [stale] });
  await f.storage.syncFromCloud();
  const reloaded = f.storage.loadState().firms[0];
  assert.deepEqual(plain(reloaded.postTabs).map((tab) => tab.id), ['custom']);
  const loaded = await f.posts.loadFirmPostCollections(reloaded);
  assert.deepEqual(plain(loaded.tabs).map((tab) => tab.id), ['custom']);
  assert.deepEqual(plain(loaded.posts).map((post) => post.id), ['retained-post']);
  assert.equal(f.documents.has('firmy_clients/test-firm/post_tabs/google-posts'), false);
  assert.equal(f.documents.has('firmy_clients/test-firm/posts/deleted-post'), false);
});

test('remote deletion record blocks migration from a stale device', async () => {
  const f = await fixture();
  const stale = firm();
  await f.posts.savePostTabs(stale, stale.postTabs);
  await f.posts.savePosts(stale, stale.posts);
  await f.posts.deletePostTab(stale, 'google-posts');
  const loaded = await f.posts.loadFirmPostCollections(stale);
  assert.deepEqual(plain(loaded.tabs).map((tab) => tab.id), ['custom']);
  assert.equal(loaded.deletedPostTabs['google-posts'], true);
  assert.equal(f.documents.has('firmy_clients/test-firm/post_tabs/google-posts'), false);
});

test('deleting all tabs keeps an empty calendar after cloud sync and repeated loads', async () => {
  const f = await fixture();
  const stale = firm();
  const current = firm();
  for (const id of ['google-posts', 'custom']) {
    await f.posts.deletePostTab(current, id);
    markPostTabDeleted(current, id);
  }
  f.storage.saveState({ firms: [current] });
  // Also cover a newer cloud snapshot from an older application/device.
  f.setCloudState({ firms: [{ ...stale, updatedAt: '2026-10-14T12:00:00Z' }] });
  await f.storage.syncFromCloud();
  const reloaded = f.storage.loadState().firms[0];
  for (let i = 0; i < 2; i += 1) {
    const loaded = await f.posts.loadFirmPostCollections(reloaded);
    assert.deepEqual(plain(loaded.tabs), []);
    assert.deepEqual(plain(loaded.posts), []);
  }
});

test('permission fallback preserves local deletion and an intentionally empty list', async () => {
  const f = await fixture();
  const current = firm();
  for (const id of ['google-posts', 'custom']) markPostTabDeleted(current, id);
  f.storage.saveState({ firms: [current] });
  f.denyPermission();
  const loaded = await f.posts.loadFirmPostCollections(f.storage.loadState().firms[0]);
  assert.equal(loaded.fallback, true);
  assert.deepEqual(plain(loaded.tabs), []);
  assert.deepEqual(plain(loaded.posts), []);
});

test('empty legacy arrays stay empty; first-use defaults and undeleted legacy migration still work', async () => {
  const f = await fixture();
  const empty = await f.posts.loadFirmPostCollections({ id: 'empty', postTabs: [], posts: [] });
  assert.deepEqual(plain(empty.tabs), []);
  const newState = f.storage.normalizeState({ firms: [{ id: 'new' }] });
  assert.equal(newState.firms[0].postTabs.length, 3);
  const defaults = await f.posts.loadFirmPostCollections(newState.firms[0]);
  assert.equal(defaults.tabs.length, 3);
  const legacy = await f.posts.loadFirmPostCollections(firm());
  assert.equal(legacy.tabs.length, 2);
  assert.equal(legacy.posts.length, 2);
});

test('reminder data filtering preserves unrelated tabs and posts', () => {
  const current = firm();
  current.deletedPostTabs = { 'google-posts': true };
  const filtered = filterDeletedPostCollections(current);
  assert.deepEqual(filtered.postTabs.map((tab) => tab.id), ['custom']);
  assert.deepEqual(filtered.posts.map((post) => post.id), ['retained-post']);
});
