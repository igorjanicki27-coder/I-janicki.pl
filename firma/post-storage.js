import {
  db,
  doc,
  collection,
  setDoc,
  getDocs,
  deleteDoc,
  writeBatch,
  ensureFirmyAdminSession,
} from './firebase.js?v=20';
import { normalizePostFrequency } from './post-frequency.mjs?v=1';

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

function isPermissionError(error) {
  return String(error?.code || '').includes('permission-denied')
    || String(error?.message || '').toLowerCase().includes('permission')
    || String(error?.message || '').includes('Missing or insufficient permissions');
}

function normalizeTab(tab, now = currentIso()) {
  return {
    id: tab.id,
    firmId: tab.firmId || '',
    name: tab.name || 'Nowa podzakladka',
    frequency: normalizePostFrequency(tab.frequency),
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
    isCreated: post.status === 'published' ? false : Boolean(post.isCreated),
    publishDate: post.publishDate || post.date || now.slice(0, 10),
    title: post.title || '',
    link: post.link || post.url || '',
    content: post.content || '',
    keywords: Array.isArray(post.keywords)
      ? post.keywords.map((item) => String(item || '').trim()).filter(Boolean)
      : String(post.keywords || '').split(',').map((item) => item.trim()).filter(Boolean),
    dismissedSimilarSignatures: Array.isArray(post.dismissedSimilarSignatures)
      ? post.dismissedSimilarSignatures.map((item) => String(item || '').trim()).filter(Boolean)
      : [],
    createdAt: post.createdAt || now,
    updatedAt: post.updatedAt || now,
  };
}

async function ensureFirmPostDoc(firm) {
  await ensureFirmyAdminSession();
  const now = currentIso();
  await setDoc(doc(db, 'firmy_clients', firm.id), {
    id: firm.id,
    name: firm.name || '',
    displayName: firm.displayName || '',
    nip: firm.nip || '',
    updatedAt: now,
  }, { merge: true });
}

function fallbackPostCollections(firm) {
  const tabs = ensureArray(firm.postTabs);
  const posts = ensureArray(firm.posts);
  return {
    tabs: (tabs.length ? tabs : defaultPostTabs()).map((tab) => normalizeTab({ ...tab, firmId: firm.id })),
    posts: posts.map((post) => normalizePost({ ...post, firmId: firm.id })),
    fallback: true,
  };
}

function mergeById(primary, backup) {
  const merged = [];
  const seen = new Set();
  for (const item of ensureArray(primary)) {
    if (!item?.id || seen.has(item.id)) continue;
    merged.push(item);
    seen.add(item.id);
  }
  for (const item of ensureArray(backup)) {
    if (!item?.id || seen.has(item.id)) continue;
    merged.push(item);
    seen.add(item.id);
  }
  return merged;
}

async function loadCollection(pathSegments) {
  const snap = await getDocs(collection(db, ...pathSegments));
  return snap.docs.map((item) => ({ id: item.id, ...item.data() }));
}

export async function loadFirmPostCollections(firm) {
  await ensureFirmyAdminSession();

  let tabs;
  let posts;
  try {
    tabs = (await loadCollection(['firmy_clients', firm.id, 'post_tabs']))
      .map((tab) => normalizeTab({ ...tab, firmId: firm.id }));
    posts = (await loadCollection(['firmy_clients', firm.id, 'posts']))
      .map((post) => normalizePost({ ...post, firmId: firm.id }));
  } catch (error) {
    if (isPermissionError(error)) {
      console.info('Brak uprawnień do subkolekcji postów. Używam danych lokalnych.', error);
      return fallbackPostCollections(firm);
    }
    throw error;
  }

  const legacyTabs = ensureArray(firm.postTabs);
  const legacyPosts = ensureArray(firm.posts);
  const normalizedLegacyTabs = legacyTabs.map((tab) => normalizeTab({ ...tab, firmId: firm.id }));
  const normalizedLegacyPosts = legacyPosts.map((post) => normalizePost({ ...post, firmId: firm.id }));

  if ((!tabs.length && normalizedLegacyTabs.length) || (!posts.length && normalizedLegacyPosts.length)) {
    try {
      await migrateLegacyPosts(firm, normalizedLegacyTabs, normalizedLegacyPosts);
    } catch (error) {
      if (!isPermissionError(error)) throw error;
      console.info('Brak uprawnień do migracji postów. Używam danych lokalnych.', error);
    }
  }

  const mergedTabs = mergeById(tabs, normalizedLegacyTabs);
  const mergedPosts = mergeById(posts, normalizedLegacyPosts);
  if (mergedTabs.length !== tabs.length || mergedPosts.length !== posts.length) {
    tabs = mergedTabs;
    posts = mergedPosts;
    try {
      await savePostTabs(firm, tabs);
      if (posts.length) await savePosts(firm, posts);
    } catch (error) {
      if (!isPermissionError(error)) throw error;
      console.info('Brak uprawnień do synchronizacji lokalnych postów z Firestore. Zachowuję je lokalnie.', error);
      return { tabs, posts, fallback: true };
    }
  }

  if (!tabs.length) {
    tabs = defaultPostTabs().map((tab) => normalizeTab({ ...tab, firmId: firm.id }));
    try {
      await savePostTabs(firm, tabs);
    } catch (error) {
      if (!isPermissionError(error)) throw error;
      console.info('Brak uprawnień do zapisania domyślnych zakładek postów. Używam ich lokalnie.', error);
    }
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
  await ensureFirmyAdminSession();
  await deleteDoc(doc(db, 'firmy_clients', firm.id, 'posts', postId));
}

async function migrateLegacyPosts(firm, tabs, posts) {
  await ensureFirmPostDoc(firm);
  await savePostTabs(firm, tabs);
  if (posts.length) {
    await savePosts(firm, posts);
  }
}
