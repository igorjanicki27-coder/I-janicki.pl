import {
  ensureAuth,
  db,
  doc,
  collection,
  setDoc,
  getDocs,
  deleteDoc,
  writeBatch,
} from './firebase.js?v=19';

function currentIso() {
  return new Date().toISOString();
}

function defaultPostTabs(now = currentIso()) {
  const today = now.slice(0, 10);
  return [
    { id: 'google-posts', name: 'Wpisy Google', frequency: 'monthly', startDate: today, createdAt: now, updatedAt: now },
    { id: 'google-articles', name: 'Artykuly w Google', frequency: 'monthly', startDate: today, createdAt: now, updatedAt: now },
    { id: 'social-media', name: 'Media spolecznosciowe', frequency: 'weekly', startDate: today, createdAt: now, updatedAt: now },
  ];
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeTab(tab, now = currentIso()) {
  return {
    id: tab.id,
    firmId: tab.firmId || '',
    name: tab.name || 'Nowa podzakladka',
    frequency: ['weekly', 'biweekly', 'monthly'].includes(tab.frequency) ? tab.frequency : 'monthly',
    startDate: tab.startDate || now.slice(0, 10),
    createdAt: tab.createdAt || now,
    updatedAt: tab.updatedAt || now,
  };
}

function normalizePost(post, now = currentIso()) {
  return {
    id: post.id,
    firmId: post.firmId || '',
    tabId: post.tabId || '',
    status: post.status === 'published' ? 'published' : 'scheduled',
    publishDate: post.publishDate || post.date || now.slice(0, 10),
    title: post.title || '',
    content: post.content || '',
    keywords: Array.isArray(post.keywords)
      ? post.keywords.map((item) => String(item || '').trim()).filter(Boolean)
      : String(post.keywords || '').split(',').map((item) => item.trim()).filter(Boolean),
    createdAt: post.createdAt || now,
    updatedAt: post.updatedAt || now,
  };
}

async function ensureFirmPostDoc(firm) {
  await ensureAuth();
  const now = currentIso();
  await setDoc(doc(db, 'firmy_clients', firm.id), {
    id: firm.id,
    name: firm.name || '',
    displayName: firm.displayName || '',
    nip: firm.nip || '',
    updatedAt: now,
  }, { merge: true });
}

async function loadCollection(pathSegments) {
  const snap = await getDocs(collection(db, ...pathSegments));
  return snap.docs.map((item) => ({ id: item.id, ...item.data() }));
}

export async function loadFirmPostCollections(firm) {
  await ensureFirmPostDoc(firm);

  let tabs = (await loadCollection(['firmy_clients', firm.id, 'post_tabs']))
    .map((tab) => normalizeTab({ ...tab, firmId: firm.id }));
  let posts = (await loadCollection(['firmy_clients', firm.id, 'posts']))
    .map((post) => normalizePost({ ...post, firmId: firm.id }));

  const legacyTabs = ensureArray(firm.postTabs);
  const legacyPosts = ensureArray(firm.posts);
  if (!tabs.length && legacyTabs.length) {
    await migrateLegacyPosts(firm, legacyTabs, legacyPosts);
    tabs = legacyTabs.map((tab) => normalizeTab({ ...tab, firmId: firm.id }));
    posts = legacyPosts.map((post) => normalizePost({ ...post, firmId: firm.id }));
  }

  if (!tabs.length) {
    tabs = defaultPostTabs().map((tab) => normalizeTab({ ...tab, firmId: firm.id }));
    await savePostTabs(firm, tabs);
  }

  return { tabs, posts };
}

export async function savePostTabs(firm, tabs) {
  await ensureFirmPostDoc(firm);
  const batch = writeBatch(db);
  for (const tab of tabs) {
    const normalized = normalizeTab({ ...tab, firmId: firm.id });
    batch.set(doc(db, 'firmy_clients', firm.id, 'post_tabs', normalized.id), normalized, { merge: true });
  }
  await batch.commit();
}

export async function savePostTab(firm, tab) {
  await ensureFirmPostDoc(firm);
  const normalized = normalizeTab({ ...tab, firmId: firm.id });
  await setDoc(doc(db, 'firmy_clients', firm.id, 'post_tabs', normalized.id), normalized, { merge: true });
}

export async function deletePostTab(firm, tabId) {
  await ensureFirmPostDoc(firm);
  const batch = writeBatch(db);
  batch.delete(doc(db, 'firmy_clients', firm.id, 'post_tabs', tabId));
  const posts = await loadCollection(['firmy_clients', firm.id, 'posts']);
  for (const post of posts) {
    if (post.tabId === tabId) {
      batch.delete(doc(db, 'firmy_clients', firm.id, 'posts', post.id));
    }
  }
  await batch.commit();
}

export async function savePost(firm, post) {
  await ensureFirmPostDoc(firm);
  const normalized = normalizePost({ ...post, firmId: firm.id });
  await setDoc(doc(db, 'firmy_clients', firm.id, 'posts', normalized.id), normalized, { merge: true });
}

export async function savePosts(firm, posts) {
  await ensureFirmPostDoc(firm);
  const batch = writeBatch(db);
  for (const post of posts) {
    const normalized = normalizePost({ ...post, firmId: firm.id });
    batch.set(doc(db, 'firmy_clients', firm.id, 'posts', normalized.id), normalized, { merge: true });
  }
  await batch.commit();
}

export async function deletePost(firm, postId) {
  await deleteDoc(doc(db, 'firmy_clients', firm.id, 'posts', postId));
}

async function migrateLegacyPosts(firm, tabs, posts) {
  await ensureFirmPostDoc(firm);
  await savePostTabs(firm, tabs);
  if (posts.length) {
    await savePosts(firm, posts);
  }
}
